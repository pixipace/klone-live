import type { SocialAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Always-decrypted SocialAccount returned to callers. Use this everywhere
 * downstream code reads accessToken / refreshToken — it transparently
 * handles both legacy plaintext rows and v1: encrypted rows.
 */
export type DecryptedSocialAccount = SocialAccount;

/**
 * Refresh the OAuth token if it expires within REFRESH_THRESHOLD_MS, then
 * return the account with PLAINTEXT accessToken / refreshToken (decrypted
 * from at-rest storage). Callers can use the tokens directly without
 * worrying about encryption.
 */
export async function ensureFreshToken(
  account: SocialAccount
): Promise<DecryptedSocialAccount> {
  const decrypted = withDecryptedTokens(account);

  if (!shouldRefresh(decrypted)) return decrypted;

  try {
    switch (decrypted.platform) {
      case "youtube":
        return await refreshGoogle(decrypted);
      case "tiktok":
        return await refreshTikTok(decrypted);
      case "facebook":
      case "instagram":
        return await refreshMeta(decrypted);
      default:
        return decrypted;
    }
  } catch (err) {
    console.error(`[refresh] ${decrypted.platform} failed:`, err);
    return decrypted;
  }
}

/** Return a copy of the row with accessToken + refreshToken decrypted. */
function withDecryptedTokens(account: SocialAccount): SocialAccount {
  return {
    ...account,
    accessToken: decryptToken(account.accessToken) ?? account.accessToken,
    refreshToken: decryptToken(account.refreshToken),
  };
}

function shouldRefresh(account: SocialAccount): boolean {
  if (!account.expiresAt) return false;
  return account.expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS;
}

/** Persist a refreshed token (encrypts it) and return the row with the
 *  PLAINTEXT new token in memory so the caller can use it immediately. */
async function persistAndReturn(
  account: SocialAccount,
  updates: { accessToken: string; refreshToken?: string | null; expiresAt: Date }
): Promise<SocialAccount> {
  const dbUpdate: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt: Date;
  } = {
    accessToken: encryptToken(updates.accessToken),
    expiresAt: updates.expiresAt,
  };
  if (updates.refreshToken !== undefined) {
    dbUpdate.refreshToken = updates.refreshToken
      ? encryptToken(updates.refreshToken)
      : null;
  }
  const written = await prisma.socialAccount.update({
    where: { id: account.id },
    data: dbUpdate,
  });
  // Return decrypted view so callers see the plaintext token they just got
  return {
    ...written,
    accessToken: updates.accessToken,
    refreshToken:
      updates.refreshToken !== undefined
        ? updates.refreshToken
        : decryptToken(written.refreshToken),
  };
}

async function refreshGoogle(account: SocialAccount): Promise<SocialAccount> {
  if (!account.refreshToken) {
    throw new Error("Google refresh token missing — please reconnect YouTube");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Google refresh: ${data.error_description || data.error || res.status}`);
  }

  return persistAndReturn(account, {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  });
}

async function refreshTikTok(account: SocialAccount): Promise<SocialAccount> {
  if (!account.refreshToken) {
    throw new Error("TikTok refresh token missing — please reconnect TikTok");
  }

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`TikTok refresh: ${data.error_description || data.error || res.status}`);
  }

  return persistAndReturn(account, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? account.refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
  });
}

async function refreshMeta(account: SocialAccount): Promise<SocialAccount> {
  const url = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("client_secret", process.env.META_APP_SECRET!);
  url.searchParams.set("fb_exchange_token", account.accessToken);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Meta refresh: ${data.error?.message || res.status}`);
  }

  return persistAndReturn(account, {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 5184000) * 1000),
  });
}
