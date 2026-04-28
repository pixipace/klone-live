import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { runPipeline } from "./pipeline";
import { runExplainerPipeline } from "./explainer-pipeline";
import { autoDistributeClips } from "./distribute";
import { cleanupSourceCache } from "./youtube";
import { ALL_PLATFORMS, type PlatformId } from "@/lib/platforms";

const PLATFORM_SET = new Set<string>(ALL_PLATFORMS);

function parseTagList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

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

  // Also cleanup orphan uploads — files in .uploads/ root from
  // /api/upload that were never used in a Post (user uploaded then
  // closed the tab without publishing). Older than 14 days = safe to
  // assume abandoned.
  try {
    const orphans = await cleanupOrphanUploads();
    if (orphans > 0) {
      console.log(`[clipper-worker] cleaned up ${orphans} orphan upload(s) > 14d old`);
    }
  } catch (err) {
    console.warn(`[clipper-worker] cleanupOrphanUploads error:`, err);
  }

  // Also cleanup orphan POSTS — Post rows whose mediaUrl points to a
  // file that no longer exists (almost always because the underlying
  // ClipJob was deleted). Without this, the schedule view shows posts
  // that immediately ENOENT when the worker tries to publish them.
  try {
    const removed = await cleanupOrphanPosts();
    if (removed > 0) {
      console.log(`[clipper-worker] cleaned up ${removed} orphan post(s) (missing media file)`);
    }
  } catch (err) {
    console.warn(`[clipper-worker] cleanupOrphanPosts error:`, err);
  }
}

async function cleanupOrphanPosts(): Promise<number> {
  const { stat } = await import("fs/promises");
  const posts = await prisma.post.findMany({
    where: { mediaUrl: { startsWith: "/api/uploads/" } },
    select: { id: true, mediaUrl: true, status: true },
  });
  const orphanIds: string[] = [];
  const cancelIds: string[] = [];
  for (const p of posts) {
    if (!p.mediaUrl) continue;
    const filename = p.mediaUrl.replace(/^\/api\/uploads\//, "");
    if (!filename || filename.includes("..")) continue;
    const filepath = path.join(process.cwd(), ".uploads", filename);
    try {
      await stat(filepath);
    } catch {
      orphanIds.push(p.id);
      if (p.status === "SCHEDULED" || p.status === "QUEUED" || p.status === "POSTING") {
        cancelIds.push(p.id);
      }
    }
  }
  if (cancelIds.length > 0) {
    await prisma.post.updateMany({
      where: { id: { in: cancelIds } },
      data: {
        status: "FAILED",
        results: JSON.stringify({
          cancelled: { error: "Source media file was deleted" },
        }),
      },
    });
  }
  if (orphanIds.length > 0) {
    await prisma.post.deleteMany({ where: { id: { in: orphanIds } } });
  }
  return orphanIds.length;
}

async function cleanupOrphanUploads() {
  const { readdir, stat, unlink } = await import("fs/promises");
  const uploadsDir = path.join(process.cwd(), ".uploads");
  let removed = 0;
  let entries: string[] = [];
  try {
    entries = await readdir(uploadsDir);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - 14 * 86400 * 1000;

  // Pull all currently-referenced mediaUrl filenames from Posts so we
  // never delete a file that's still in a Post.mediaUrl (scheduled or
  // even FAILED — user might retry).
  const inUse = new Set<string>();
  const posts = await prisma.post.findMany({
    where: { mediaUrl: { not: null } },
    select: { mediaUrl: true },
  });
  for (const p of posts) {
    if (!p.mediaUrl) continue;
    const m = p.mediaUrl.match(/\/api\/uploads\/([^/?]+)$/);
    if (m) inUse.add(m[1]);
  }

  for (const name of entries) {
    // Skip subdirs (clips/, broll-cache/, source-cache/, clipper-sources/)
    if (
      name === "clips" ||
      name === "broll-cache" ||
      name === "source-cache" ||
      name === "clipper-sources"
    ) {
      continue;
    }
    if (inUse.has(name)) continue;
    const filePath = path.join(uploadsDir, name);
    try {
      const s = await stat(filePath);
      if (!s.isFile()) continue;
      if (s.mtimeMs > cutoff) continue; // still recent — keep
      await unlink(filePath);
      removed += 1;
    } catch {
      // ignore — race with another cleanup is fine
    }
  }
  return removed;
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
  console.log(
    `[clipper-worker] picking up job ${job.id} mode=${job.mode} (${job.sourceUrl})`,
  );
  try {
    if (job.mode === "EXPLAINER") {
      await runExplainerPipeline(job.id);
    } else {
      await runPipeline(job.id);
    }
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
          clipperDefaultHashtags: true,
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
    const userHashtags = parseTagList(job.user.clipperDefaultHashtags);
    const result = await autoDistributeClips({
      userId: job.user.id,
      clips: renderedClips,
      platforms,
      clipsPerDay: job.user.clipperClipsPerDay,
      skipWeekends: job.user.clipperSkipWeekends,
      withAiHashtags: job.user.clipperWithAiHashtags,
      userHashtags,
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
