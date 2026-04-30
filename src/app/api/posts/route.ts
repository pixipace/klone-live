import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVerifiedSession } from "@/lib/auth";
import { firePost, isKnownPlatform } from "@/lib/post-runner";

export async function POST(request: NextRequest) {
  let postId: string | null = null;

  try {
    // Posting is gated on email verification — typo'd-email accounts
    // can't publish to social platforms. Browsing/configuring still
    // works (those routes use plain getSession).
    const auth = await getVerifiedSession();
    if (!auth.ok) {
      if (auth.reason === "no_session") {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      return NextResponse.json(
        {
          error: "Verify your email before publishing posts. Check your inbox or click 'Resend' on the dashboard banner.",
          reason: "email_not_verified",
        },
        { status: 403 },
      );
    }
    const session = auth.session;

    const body = await request.json();
    const { caption, mediaUrl, mediaType, platforms, scheduledFor } = body as {
      caption?: string;
      mediaUrl?: string;
      mediaType?: "image" | "video" | null;
      platforms?: unknown[];
      scheduledFor?: string | null;
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

    let scheduleDate: Date | null = null;
    if (scheduledFor) {
      const d = new Date(scheduledFor);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Invalid scheduledFor date" },
          { status: 400 }
        );
      }
      if (d.getTime() > Date.now() + 30_000) {
        scheduleDate = d;
      }
    }

    const created = await prisma.post.create({
      data: {
        userId: session.id,
        caption: caption ?? "",
        mediaUrl: mediaUrl ?? null,
        mediaType: mediaType ?? null,
        platforms: requested.join(","),
        status: scheduleDate ? "SCHEDULED" : "POSTING",
        scheduledFor: scheduleDate,
      },
    });
    postId = created.id;

    if (scheduleDate) {
      return NextResponse.json({
        success: true,
        postId,
        scheduled: true,
        scheduledFor: scheduleDate.toISOString(),
      });
    }

    const result = await firePost(created);
    return NextResponse.json({
      success: true,
      postId,
      results: result.results,
    });
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
