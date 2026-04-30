import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Security headers — applied to every response.
// CSP keeps `unsafe-inline` for styles (Tailwind) and scripts (Next.js
// hydration / SSR doesn't easily allow nonces yet); everything else is
// locked down. Sentry endpoints whitelisted for connect-src.
const SENTRY_HOST = "https://o4511279277015040.ingest.us.sentry.io";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${SENTRY_HOST}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // HSTS only in production (avoids breaking localhost over plain HTTP)
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
      { protocol: "https", hostname: "platform-lookaside.fbsbx.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: "klone",
  project: "klone",
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // disableLogger was deprecated in @sentry/nextjs v8 — moved to a
  // webpack treeshake hint (the Sentry client console.log noise is
  // tree-shaken out of the prod bundle without needing the flag).
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
