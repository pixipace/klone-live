import * as Sentry from "@sentry/nextjs";

// Edge runtime (middleware, edge routes) — minimal config
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  enabled: !!process.env.SENTRY_DSN,
});
