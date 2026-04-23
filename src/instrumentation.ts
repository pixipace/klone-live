export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
  const { startClipperWorker } = await import("@/lib/clipper/worker");
  startClipperWorker();
}
