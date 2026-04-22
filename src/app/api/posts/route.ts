import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  ALL_PLATFORMS,
  type PlatformId,
  type PlatformResult,
  platformPosters,
} from "@/lib/platforms";

const PLATFORM_SET = new Set<PlatformId>(ALL_PLATFORMS);

function isKnownPlatform(p: unknown): p is PlatformId {
  return typeof p === "string" && PLATFORM_SET.has(p as PlatformId);
}

export async function POST(request: NextRequest) {
  let postId: string | null = null;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { caption, mediaUrl, mediaType, platforms } = body as {
      caption?: string;
      mediaUrl?: string;
      mediaType?: "image" | "video" | null;
      platforms?: unknown[];
    };

    const requested = Array.isArray(platforms)
      ? platforms.filter(isKnownPlatform)
      : [];

    if (requested.length === 0) {
      return NextResponse.json(
        { error: "No valid platforms selected" },
        { status: 400 }
      );
    }

    const accounts = await prisma.socialAccount.findMany({
      where: { userId: session.id, platform: { in: requested } },
    });
    const accountMap = new Map(accounts.map((a) => [a.platform, a]));

    const created = await prisma.post.create({
      data: {
        userId: session.id,
        caption: caption ?? "",
        mediaUrl: mediaUrl ?? null,
        mediaType: mediaType ?? null,
        platforms: requested.join(","),
        status: "POSTING",
      },
    });
    postId = created.id;

    const results: Record<string, PlatformResult> = {};

    for (const platform of requested) {
      const account = accountMap.get(platform);
      if (!account) {
        results[platform] = {
          error: `${platform} not connected. Connect from Accounts.`,
        };
        continue;
      }
      try {
        results[platform] = await platformPosters[platform]({
          account,
          caption: caption ?? "",
          mediaUrl,
          mediaType: mediaType ?? null,
        });
      } catch (err) {
        console.error(`${platform} post error:`, err);
        results[platform] = { error: String(err) };
      }
    }

    const entries = Object.values(results);
    const failed = entries.filter((r) => "error" in r).length;
    const succeeded = entries.length - failed;
    const status =
      failed === 0 ? "POSTED" : succeeded === 0 ? "FAILED" : "PARTIAL";

    await prisma.post.update({
      where: { id: postId },
      data: {
        status,
        results: JSON.stringify(results),
        postedAt: status === "FAILED" ? null : new Date(),
      },
    });

    if (succeeded > 0 && mediaUrl?.startsWith("/api/uploads/")) {
      const filename = mediaUrl.replace("/api/uploads/", "");
      const filePath = path.join(process.cwd(), ".uploads", filename);
      unlink(filePath).catch(() => {});
    }

    return NextResponse.json({ success: true, postId, results });
  } catch (err) {
    console.error("Post creation error:", err);
    if (postId) {
      await prisma.post
        .update({
          where: { id: postId },
          data: {
            status: "FAILED",
            results: JSON.stringify({ error: String(err) }),
          },
        })
        .catch(() => {});
    }
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
