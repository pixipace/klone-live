import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { runPipeline } from "./pipeline";
import { autoDistributeClips } from "./distribute";
import { cleanupSourceCache } from "./youtube";
import { ALL_PLATFORMS, type PlatformId } from "@/lib/platforms";

const PLATFORM_SET = new Set<string>(ALL_PLATFORMS);

const POLL_INTERVAL_MS = 10_000;
// Bumped from 30min → 3hr to support 2-3hr source videos. Whisper alone
// can take 60-90 min on a 3hr source; full pipeline (including chunked
// Gemma picker + per-clip ffmpeg cuts) can run 90-150 min.
const STUCK_JOB_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 hr
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const FAILED_RETENTION_DAYS = 14;

let started = false;
let timer: NodeJS.Timeout | null = null;
let inflight = false;

async function recoverOrphans() {
  // Any job marked RUNNING when the worker boots was almost certainly
  // killed by a restart (no clipper jobs run >30 min on this hardware).
  // Mark them FAILED so the user can delete/retry instead of staring at
  // a stuck "Transcribing…" forever.
  const orphans = await prisma.clipJob.updateMany({
    where: { status: "RUNNING" },
    data: {
      status: "FAILED",
      stage: "FAILED",
      error: "Interrupted by server restart — please retry",
      finishedAt: new Date(),
    },
  });
  if (orphans.count > 0) {
    console.log(`[clipper-worker] recovered ${orphans.count} orphan job(s) from restart`);
  }
}

async function cleanupOldJobs() {
  // Delete FAILED jobs older than retention window + their on-disk files.
  // DONE jobs stay forever (those are user-owned content); user can delete
  // manually via the trash button in the UI.
  const cutoff = new Date(Date.now() - FAILED_RETENTION_DAYS * 86400 * 1000);
  const oldFailed = await prisma.clipJob.findMany({
    where: { status: "FAILED", finishedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (oldFailed.length === 0) return;

  for (const j of oldFailed) {
    if (/^[a-z0-9]+$/i.test(j.id)) {
      const dir = path.join(process.cwd(), ".uploads", "clips", j.id);
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  await prisma.clipJob.deleteMany({
    where: { id: { in: oldFailed.map((j) => j.id) } },
  });
  console.log(
    `[clipper-worker] cleaned up ${oldFailed.length} FAILED job(s) older than ${FAILED_RETENTION_DAYS}d`
  );

  // Also cleanup expired source-cache entries (>7d old)
  try {
    const removed = await cleanupSourceCache();
    if (removed > 0) {
      console.log(`[clipper-worker] cleaned up ${removed} expired source-cache entries`);
    }
  } catch (err) {
    console.warn(`[clipper-worker] cleanupSourceCache error:`, err);
  }
}

async function failStuckJobs() {
  // Belt-and-suspenders: if a RUNNING job's startedAt is older than
  // STUCK_JOB_THRESHOLD_MS, fail it. Catches cases where the worker
  // didn't crash but the underlying ffmpeg/whisper hung.
  const cutoff = new Date(Date.now() - STUCK_JOB_THRESHOLD_MS);
  const stuck = await prisma.clipJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    data: {
      status: "FAILED",
      stage: "FAILED",
      error: "Job exceeded 30-min runtime limit — please retry",
      finishedAt: new Date(),
    },
  });
  if (stuck.count > 0) {
    console.log(`[clipper-worker] failed ${stuck.count} stuck job(s)`);
  }
}

async function tick() {
  if (inflight) return;

  await failStuckJobs().catch((err) =>
    console.error("[clipper-worker] failStuckJobs error:", err)
  );

  const job = await prisma.clipJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return;

  inflight = true;
  console.log(`[clipper-worker] picking up job ${job.id} (${job.sourceUrl})`);
  try {
    await runPipeline(job.id);
    await maybeAutoPublish(job.id);
  } catch (err) {
    console.error(`[clipper-worker] pipeline crashed:`, err);
  } finally {
    inflight = false;
  }
}

/**
 * If the job's owner has clipperAutoPublish enabled and saved platform
 * prefs, schedule the rendered clips immediately using those prefs. Runs
 * AFTER runPipeline returns successfully — never blocks the pipeline
 * itself, and DONE → AUTO-PUBLISHED is logged separately so failures here
 * don't appear to kill the clip job.
 */
async function maybeAutoPublish(jobId: string): Promise<void> {
  const job = await prisma.clipJob.findUnique({
    where: { id: jobId },
    include: {
      user: {
        select: {
          id: true,
          clipperAutoPublish: true,
          clipperPlatforms: true,
          clipperClipsPerDay: true,
          clipperSkipWeekends: true,
          clipperWithAiHashtags: true,
        },
      },
      clips: true,
    },
  });
  if (!job || job.status !== "DONE") return;
  if (!job.user.clipperAutoPublish) return;

  const platforms = (job.user.clipperPlatforms ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is PlatformId => PLATFORM_SET.has(p));
  if (platforms.length === 0) {
    console.warn(
      `[clipper-worker] auto-publish on for ${job.user.id} but no platforms saved — skipping`
    );
    return;
  }

  const renderedClips = job.clips.filter((c) => c.videoPath !== null);
  if (renderedClips.length === 0) return;

  try {
    const result = await autoDistributeClips({
      userId: job.user.id,
      clips: renderedClips,
      platforms,
      clipsPerDay: job.user.clipperClipsPerDay,
      skipWeekends: job.user.clipperSkipWeekends,
      withAiHashtags: job.user.clipperWithAiHashtags,
    });
    console.log(
      `[clipper-worker] auto-published ${jobId}: ${result.scheduled} post(s) across ${platforms.length} platform(s)`
    );
  } catch (err) {
    console.error(`[clipper-worker] auto-publish failed for ${jobId}:`, err);
  }
}

export function startClipperWorker() {
  if (started) return;
  started = true;
  console.log(`[clipper-worker] starting, polling every ${POLL_INTERVAL_MS}ms`);
  // Recover any RUNNING job left over from a restart BEFORE the first tick
  recoverOrphans()
    .catch((err) => console.error("[clipper-worker] recoverOrphans error:", err))
    .finally(() => {
      timer = setInterval(() => {
        tick().catch((err) => console.error("[clipper-worker] tick error:", err));
      }, POLL_INTERVAL_MS);
    });
  // Hourly cleanup of old failed jobs
  setInterval(() => {
    cleanupOldJobs().catch((err) =>
      console.error("[clipper-worker] cleanupOldJobs error:", err)
    );
  }, CLEANUP_INTERVAL_MS).unref();
  // Run once at startup too
  cleanupOldJobs().catch((err) =>
    console.error("[clipper-worker] cleanupOldJobs error:", err)
  );
}

export function stopClipperWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
