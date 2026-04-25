import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance + replay are sampled lower on client to stay under free
  // tier and not bloat user bundles
  tracesSampleRate: 0.05,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,

  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Browser errors we don't care about
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    // Browser extensions injecting their own errors
    /extension\//i,
    /^chrome:\/\//i,
    /^moz-extension:\/\//i,
  ],

  // Don't send if user has DNT enabled — be a good citizen
  beforeSend(event) {
    if (
      typeof navigator !== "undefined" &&
      navigator.doNotTrack === "1"
    ) {
      return null;
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
