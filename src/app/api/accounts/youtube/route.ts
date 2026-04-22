import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type YouTubeMeta = { subscribers?: number };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });

  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform: "youtube" } },
  });
  if (!account) return NextResponse.json({ connected: false });

  let meta: YouTubeMeta = {};
  try {
    if (account.meta) meta = JSON.parse(account.meta);
  } catch {
    // ignore
  }

  return NextResponse.json({
    connected: true,
    username: account.username,
    avatar: account.avatar,
    subscribers: meta.subscribers,
    channelId: account.externalId,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (session) {
    await prisma.socialAccount
      .delete({
        where: { userId_platform: { userId: session.id, platform: "youtube" } },
      })
      .catch(() => {});
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete("youtube_account");
  return response;
}
