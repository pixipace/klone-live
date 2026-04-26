import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { encryptToken } from "@/lib/token-crypto";

export type Platform = "tiktok" | "facebook" | "instagram" | "linkedin" | "youtube";

export type UpsertSocialAccount = {
  platform: Platform;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  externalId?: string | null;
  username?: string | null;
  avatar?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function upsertSocialAccountForCurrentUser(
  data: UpsertSocialAccount
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "no_session" };

  // Encrypt at rest. Reads happen via decryptSocialAccount() / refresh.ts
  // which transparently decrypt. v1: prefix marks encrypted values; legacy
  // plaintext rows still work until the migration runs.
  const accessTokenEnc = encryptToken(data.accessToken);
  const refreshTokenEnc = data.refreshToken
    ? encryptToken(data.refreshToken)
    : null;

  await prisma.socialAccount.upsert({
    where: {
      userId_platform: { userId: session.id, platform: data.platform },
    },
    create: {
      userId: session.id,
      platform: data.platform,
      accessToken: accessTokenEnc,
      refreshToken: refreshTokenEnc,
      expiresAt: data.expiresAt ?? null,
      externalId: data.externalId ?? null,
      username: data.username ?? null,
      avatar: data.avatar ?? null,
      meta: data.meta ? JSON.stringify(data.meta) : null,
    },
    update: {
      accessToken: accessTokenEnc,
      refreshToken: refreshTokenEnc,
      expiresAt: data.expiresAt ?? null,
      externalId: data.externalId ?? null,
      username: data.username ?? null,
      avatar: data.avatar ?? null,
      meta: data.meta ? JSON.stringify(data.meta) : null,
    },
  });

  return { ok: true };
}
