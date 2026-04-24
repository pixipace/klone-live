import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    include: {
      socialAccounts: {
        select: {
          platform: true,
          username: true,
          externalId: true,
          createdAt: true,
          expiresAt: true,
        },
      },
      posts: {
        select: {
          id: true,
          caption: true,
          mediaUrl: true,
          mediaType: true,
          platforms: true,
          status: true,
          results: true,
          scheduledFor: true,
          postedAt: true,
          createdAt: true,
        },
      },
      clipJobs: {
        select: {
          id: true,
          sourceUrl: true,
          sourceTitle: true,
          status: true,
          createdAt: true,
          finishedAt: true,
          clips: {
            select: {
              id: true,
              startSec: true,
              endSec: true,
              hookTitle: true,
              hookVariants: true,
              viralityScore: true,
              videoPath: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      createdAt: user.createdAt,
    },
    socialAccounts: user.socialAccounts,
    posts: user.posts,
    clipJobs: user.clipJobs,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="klone-export-${user.id}-${Date.now()}.json"`,
    },
  });
}
