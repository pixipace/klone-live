export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
    const { startClipperWorker } = await import("@/lib/clipper/worker");
    startClipperWorker();
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
