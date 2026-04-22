import type { SocialAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

export async function ensureFreshToken(
  account: SocialAccount
): Promise<SocialAccount> {
  if (!shouldRefresh(account)) return account;

  try {
    switch (account.platform) {
      case "youtube":
        return await refreshGoogle(account);
      case "tiktok":
        return await refreshTikTok(account);
      case "facebook":
      case "instagram":
        return await refreshMeta(account);
      default:
        return account;
    }
  } catch (err) {
    console.error(`[refresh] ${account.platform} failed:`, err);
    return account;
  }
}

function shouldRefresh(account: SocialAccount): boolean {
  if (!account.expiresAt) return false;
  return account.expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS;
}

async function refreshGoogle(account: SocialAccount): Promise<SocialAccount> {
  if (!account.refreshToken) return account;

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

  return prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    },
  });
}

async function refreshTikTok(account: SocialAccount): Promise<SocialAccount> {
  if (!account.refreshToken) return account;

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

  return prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? account.refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    },
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

  return prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 5184000) * 1000),
    },
  });
}
