import type { SocialAccount } from "@prisma/client";

export type MediaType = "image" | "video" | null;

/** Extra context attached when the media being posted is a Klone clip
 *  (i.e. mediaUrl matches /api/uploads/clips/<jobId>/...). Currently only
 *  the YouTube poster reads this, to build a transformative-looking
 *  description (source attribution, commentary, transcript) that both
 *  improves Content ID dispute success AND signals fair-use. Optional —
 *  posters MUST tolerate this being undefined for non-clip uploads. */
export type ClipContext = {
  sourceUrl: string | null;
  sourceTitle: string | null;
  hookTitle: string | null;
  hookReason: string | null;
  transcript: string | null;
};

export type PlatformPostInput = {
  account: SocialAccount;
  caption: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  clipContext?: ClipContext;
};

export type PlatformSuccess = {
  success: true;
  id: string;
  url?: string;
  message: string;
};

export type PlatformError = {
  error: string;
};

export type PlatformResult = PlatformSuccess | PlatformError;

export function parseMeta<T = Record<string, unknown>>(
  account: SocialAccount
): T {
  if (!account.meta) return {} as T;
  try {
    return JSON.parse(account.meta) as T;
  } catch {
    return {} as T;
  }
}

export async function readUploadBuffer(mediaUrl: string): Promise<Buffer> {
  const { readFile } = await import("fs/promises");
  const path = await import("path");
  const filename = mediaUrl.replace("/api/uploads/", "");
  const filePath = path.join(process.cwd(), ".uploads", filename);
  return readFile(filePath);
}

/**
 * Build a publicly fetchable URL for a media file. The /api/uploads
 * route requires session auth (so logged-out browsers can't enumerate
 * other users' clips), but external platforms (Meta, etc.) need to
 * GET the video without a session — they have no cookies.
 *
 * Solution: append a short-lived HMAC signature to the URL. The route
 * accepts EITHER a valid session OR a valid signature, scoped to the
 * exact path + expiry. Default TTL: 1 hour, plenty of time for Meta to
 * fetch + transcode and outlives any reasonable retry window.
 */
export function publicMediaUrl(mediaUrl: string, ttlSeconds: number = 3600): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const secret = process.env.NEXTAUTH_SECRET || "";
  const sig = signMediaPath(mediaUrl, expiresAt, secret);
  return `${process.env.NEXTAUTH_URL}${mediaUrl}?e=${expiresAt}&t=${sig}`;
}

/** Sign a media path + expiry with NEXTAUTH_SECRET. The route uses the
 *  same function to verify. Path-scoped so a signature for clip A can't
 *  be replayed to download clip B. */
export function signMediaPath(mediaPath: string, expiresAt: number, secret: string): string {
  // Lazy require so this file stays edge-compatible if needed later.
  // crypto.createHmac is sync + small; no async cost.
  const crypto = require("crypto") as typeof import("crypto");
  return crypto
    .createHmac("sha256", secret)
    .update(`${mediaPath}:${expiresAt}`)
    .digest("hex")
    .slice(0, 32); // 32 hex chars = 128 bits, plenty
}

/** Verify a signature against the given path + expiry. Returns true
 *  only if the signature matches AND the expiry is in the future. */
export function verifyMediaSignature(
  mediaPath: string,
  expiresAt: number,
  signature: string,
): boolean {
  const secret = process.env.NEXTAUTH_SECRET || "";
  if (!secret) return false;
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = signMediaPath(mediaPath, expiresAt, secret);
  // Constant-time compare to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
