import { prisma } from "@/lib/prisma";
import { runPipeline } from "./pipeline";

const POLL_INTERVAL_MS = 10_000;
const STUCK_JOB_THRESHOLD_MS = 30 * 60 * 1000; // 30 min

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
  } catch (err) {
    console.error(`[clipper-worker] pipeline crashed:`, err);
  } finally {
    inflight = false;
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
}

export function stopClipperWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
