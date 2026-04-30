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

  // If this post's media is a Klone clip, fetch the originating Clip + Job
  // and pass it as clipContext. Lets posters (currently just YouTube) build
  // richer attribution + transformative-use metadata.
  const clipMatch = post.mediaUrl?.match(/^\/api\/uploads\/clips\/([^/]+)\/(.+)$/);
  let clipContext: import("@/lib/platforms/types").ClipContext | undefined;
  if (clipMatch) {
    const [, jobId] = clipMatch;
    const clip = await prisma.clip.findFirst({
      where: { jobId, videoPath: post.mediaUrl, job: { userId: post.userId } },
      select: {
        hookTitle: true,
        reason: true,
        transcript: true,
        job: { select: { sourceUrl: true, sourceTitle: true } },
      },
    });
    if (clip) {
      clipContext = {
        sourceUrl: clip.job.sourceUrl ?? null,
        sourceTitle: clip.job.sourceTitle ?? null,
        hookTitle: clip.hookTitle ?? null,
        hookReason: clip.reason ?? null,
        transcript: clip.transcript ?? null,
      };
    }
  }

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
        clipContext,
      });
    } catch (err) {
      // Distinguish EXPECTED failures from genuine bugs:
      //   - ENOENT (file deleted by orphan cleanup before post fired) is
      //     a known recoverable condition. Worker re-sweeps orphan posts
      //     hourly and removes them. Don't pollute Sentry with these.
      //   - Other errors are genuine — they go through the normal
      //     console.error path and Sentry picks them up.
      const errStr = String(err);
      const isOrphanFile =
        (err as { code?: string })?.code === "ENOENT" ||
        errStr.includes("ENOENT");
      if (isOrphanFile) {
        console.warn(`[firePost] ${platform} skipped — source file deleted (orphan)`);
        results[platform] = {
          error: "Source clip file no longer exists — was cleaned up before this post fired",
        };
      } else {
        console.error(`[firePost] ${platform} error:`, err);
        results[platform] = { error: String(err) };
      }
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

  // Cleanup: delete the media file IF this is the last pending post for it.
  // Auto-distribute creates many Post rows pointing to the same clip mp4
  // across multiple days/platforms. We keep the file until they're all done.
  if (succeeded > 0 && post.mediaUrl?.startsWith("/api/uploads/")) {
    const stillPending = await prisma.post.count({
      where: {
        mediaUrl: post.mediaUrl,
        status: { in: ["SCHEDULED", "QUEUED", "POSTING"] },
        id: { not: post.id },
      },
    });
    if (stillPending === 0) {
      const filename = post.mediaUrl.replace("/api/uploads/", "");
      const filePath = path.join(process.cwd(), ".uploads", filename);
      unlink(filePath).catch(() => {});
    }
  }

  return { status, results };
}
