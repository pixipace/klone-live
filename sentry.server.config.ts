import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Capture 10% of transactions for performance monitoring (free tier
  // allows ~10k/month — adjust if we get noisy)
  tracesSampleRate: 0.1,

  // Don't send if no DSN (local dev without Sentry configured)
  enabled: !!process.env.SENTRY_DSN,

  // Scrub sensitive data before sending
  beforeSend(event, hint) {
    // Strip potentially-sensitive request body data
    if (event.request?.data) {
      const data = event.request.data;
      if (typeof data === "object" && data !== null) {
        const scrubbed: Record<string, unknown> = { ...(data as Record<string, unknown>) };
        for (const key of Object.keys(scrubbed)) {
          if (
            /password|token|secret|key|authorization|cookie|hash/i.test(key)
          ) {
            scrubbed[key] = "[scrubbed]";
          }
        }
        event.request.data = scrubbed;
      }
    }

    // Strip cookies + auth headers
    if (event.request?.headers) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(event.request.headers)) {
        if (/cookie|authorization|x-api-key/i.test(k)) {
          headers[k] = "[scrubbed]";
        } else {
          headers[k] = v as string;
        }
      }
      event.request.headers = headers;
    }

    // Don't send errors triggered by our own test endpoint repeatedly
    const err = hint?.originalException;
    if (err && typeof err === "object" && "message" in err) {
      const msg = String((err as Error).message);
      if (msg.includes("[Sentry test error]")) {
        // Allow ONE test through, then short-circuit subsequent ones via tag
        event.tags = { ...event.tags, sentry_test: "true" };
      }
    }

    return event;
  },

  // Ignore known noisy errors that aren't actionable
  ignoreErrors: [
    // Browser-only stuff that bubbles to server in some Next.js paths
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
    // Network errors users get on flaky wifi — not our bug
    "fetch failed",
    "ECONNRESET",
    "EPIPE",
  ],
});
