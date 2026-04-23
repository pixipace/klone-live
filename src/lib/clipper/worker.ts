import { prisma } from "@/lib/prisma";
import { runPipeline } from "./pipeline";

const POLL_INTERVAL_MS = 10_000;

let started = false;
let timer: NodeJS.Timeout | null = null;
let inflight = false;

async function tick() {
  if (inflight) return;

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
  timer = setInterval(() => {
    tick().catch((err) => console.error("[clipper-worker] tick error:", err));
  }, POLL_INTERVAL_MS);
}

export function stopClipperWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
