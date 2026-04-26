import crypto from "crypto";

/**
 * AES-256-GCM at-rest encryption for OAuth tokens (SocialAccount.accessToken,
 * refreshToken). Was plaintext before — privacy policy claims tokens are
 * encrypted, so this brings reality in line with the policy.
 *
 * Key derivation:
 *   - Reads TOKEN_ENC_KEY from env if set (32-byte hex or base64)
 *   - Falls back to SHA-256 of NEXTAUTH_SECRET (always 32 bytes; we already
 *     enforce NEXTAUTH_SECRET length >= 32 at boot)
 *
 * Wire format:
 *   "v1:<iv-base64>:<ciphertext-base64>:<authtag-base64>"
 *
 * Tokens encrypted with this scheme are detected via the "v1:" prefix.
 * Anything without that prefix is treated as legacy plaintext and returned
 * as-is, so existing rows keep working until the migration runs.
 */

let keyCache: Buffer | null = null;

function getKey(): Buffer {
  if (keyCache) return keyCache;
  const explicit = process.env.TOKEN_ENC_KEY;
  if (explicit) {
    // Accept hex (64 chars) or base64
    const buf =
      explicit.length === 64
        ? Buffer.from(explicit, "hex")
        : Buffer.from(explicit, "base64");
    if (buf.length !== 32) {
      throw new Error(
        "TOKEN_ENC_KEY must decode to exactly 32 bytes (64 hex chars or 44 base64 chars)"
      );
    }
    keyCache = buf;
    return buf;
  }
  // Fallback: derive from NEXTAUTH_SECRET (which we already require to exist
  // and be >=32 chars). SHA-256 gives us deterministic 32 bytes.
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Token encryption needs NEXTAUTH_SECRET (>=32 chars) or explicit TOKEN_ENC_KEY"
    );
  }
  keyCache = crypto.createHash("sha256").update(secret).digest();
  return keyCache;
}

export function encryptToken(plain: string): string {
  if (!plain) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${enc.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith("v1:")) {
    // Legacy plaintext — return as-is. Migration script will re-encrypt.
    return stored;
  }
  try {
    const parts = stored.split(":");
    if (parts.length !== 4) return null;
    const [, ivB64, dataB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

/** Helper to check if a stored value is encrypted (vs legacy plaintext). */
export function isEncrypted(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith("v1:");
}
