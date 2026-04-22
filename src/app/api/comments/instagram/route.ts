import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureFreshToken } from "@/lib/platforms/refresh";

type IgMeta = {
  accounts?: Array<{ instagramId: string }>;
  selectedInstagramId?: string;
};

async function loadIgAccount() {
  const session = await getSession();
  if (!session) return null;

  let account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform: "instagram" } },
  });
  if (!account) return null;

  account = await ensureFreshToken(account);

  let meta: IgMeta = {};
  try {
    if (account.meta) meta = JSON.parse(account.meta);
  } catch {
    // ignore
  }

  const instagramId =
    meta.selectedInstagramId ?? account.externalId ?? meta.accounts?.[0]?.instagramId;
  return { accessToken: account.accessToken, instagramId };
}

export async function GET() {
  const ig = await loadIgAccount();
  if (!ig) return NextResponse.json({ connected: false, comments: [] });
  const { accessToken, instagramId } = ig;

  if (!instagramId) {
    return NextResponse.json({ connected: true, comments: [] });
  }

  const mediaUrl = `https://graph.facebook.com/v24.0/${instagramId}/media?fields=id,caption&limit=10&access_token=${accessToken}`;
  const mediaRes = await fetch(mediaUrl);
  const mediaData = await mediaRes.json();

  if (!mediaData.data || mediaData.data.length === 0) {
    return NextResponse.json({ connected: true, comments: [] });
  }

  const comments: unknown[] = [];
  for (const media of mediaData.data.slice(0, 5)) {
    try {
      const commentsUrl = `https://graph.facebook.com/v24.0/${media.id}/comments?fields=id,text,username,like_count,timestamp&access_token=${accessToken}`;
      const commentsRes = await fetch(commentsUrl);
      const commentsData = await commentsRes.json();

      if (commentsData.data) {
        for (const c of commentsData.data) {
          comments.push({
            id: c.id,
            username: c.username || "user",
            text: c.text,
            timestamp: c.timestamp ? new Date(c.timestamp).toLocaleString() : "Recently",
            likes: c.like_count || 0,
            postCaption: media.caption?.slice(0, 60) || "(no caption)",
            replied: false,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ connected: true, comments });
}

export async function POST(request: NextRequest) {
  const ig = await loadIgAccount();
  if (!ig) {
    return NextResponse.json(
      { error: "Instagram not connected" },
      { status: 401 }
    );
  }
  const { accessToken } = ig;

  try {
    const { commentId, text } = await request.json();

    const replyUrl = `https://graph.facebook.com/v24.0/${commentId}/replies`;
    const replyRes = await fetch(replyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        message: text,
        access_token: accessToken,
      }),
    });

    const replyData = await replyRes.json();

    if (replyData.error) {
      return NextResponse.json({ error: replyData.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: replyData.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
