import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "./rate-limit";

/**
 * One-call rate limiter for authed API routes. Keys by route + user + IP
 * so per-user abuse and per-IP abuse are both bounded. Returns either:
 *   - null  → request is fine, continue
 *   - NextResponse(429) → caller should `return` this
 *
 * Recommended caller pattern:
 *
 *   const limit = enforceRateLimit(request, session.id, "clips:submit", 10, 60_000);
 *   if (limit) return limit;
 *   // ... real handler
 *
 * Buckets we use across the API (60s windows):
 *   heavy ops:  10 (clip submit, upload, highlight reel, retry)
 *   medium:     20 (repick, regenerate-hook, refresh-metrics, trim)
 *   light:      30 (preferences, post delete, hook edit)
 *   destructive: 5 (account delete)
 */
export function enforceRateLimit(
  request: Request,
  userId: string,
  bucket: string,
  max: number,
  windowMs: number = 60_000
): NextResponse | null {
  const ip = getClientIp(request);
  const key = `${bucket}:${userId}:${ip}`;
  const result = checkRateLimit(key, max, windowMs);
  if (result.allowed) return null;

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: `Too many requests. Try again in ${retryAfter}s.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetAt),
      },
    }
  );
}
