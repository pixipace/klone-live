import { unlink } from "fs/promises";
import path from "path";
import type { Post } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ALL_PLATFORMS,
  type PlatformId,
  type PlatformResult,
  platformPosters,
} from "@/lib/platforms";
import { ensureFreshToken } from "@/lib/platforms/refresh";

const PLATFORM_SET = new Set<PlatformId>(ALL_PLATFORMS);

export function isKnownPlatform(p: unknown): p is PlatformId {
  return typeof p === "string" && PLATFORM_SET.has(p as PlatformId);
}

export type FireResult = {
  status: "POSTED" | "PARTIAL" | "FAILED";
  results: Record<string, PlatformResult>;
};

export async function firePost(post: Post): Promise<FireResult> {
  const requested = (post.platforms || "")
    .split(",")
    .filter(isKnownPlatform);

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: post.userId, platform: { in: requested } },
  });
  const accountMap = new Map(accounts.map((a) => [a.platform, a]));

  const results: Record<string, PlatformResult> = {};

  for (const platform of requested) {
    const account = accountMap.get(platform);
    if (!account) {
      results[platform] = {
        error: `${platform} not connected.`,
      };
      continue;
    }
    try {
      const fresh = await ensureFreshToken(account);
      results[platform] = await platformPosters[platform]({
        account: fresh,
        caption: post.caption,
        mediaUrl: post.mediaUrl ?? undefined,
        mediaType: (post.mediaType ?? null) as "image" | "video" | null,
      });
    } catch (err) {
      console.error(`[firePost] ${platform} error:`, err);
      results[platform] = { error: String(err) };
    }
  }

  const entries = Object.values(results);
  const failed = entries.filter((r) => "error" in r).length;
  const succeeded = entries.length - failed;
  const status: FireResult["status"] =
    failed === 0 ? "POSTED" : succeeded === 0 ? "FAILED" : "PARTIAL";

  await prisma.post.update({
    where: { id: post.id },
    data: {
      status,
      results: JSON.stringify(results),
      postedAt: status === "FAILED" ? null : new Date(),
    },
  });

  if (succeeded > 0 && post.mediaUrl?.startsWith("/api/uploads/")) {
    const filename = post.mediaUrl.replace("/api/uploads/", "");
    const filePath = path.join(process.cwd(), ".uploads", filename);
    unlink(filePath).catch(() => {});
  }

  return { status, results };
}
