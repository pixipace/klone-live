import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type TikTokMeta = { followers?: number };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });

  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform: "tiktok" } },
  });
  if (!account) return NextResponse.json({ connected: false });

  let meta: TikTokMeta = {};
  try {
    if (account.meta) meta = JSON.parse(account.meta);
  } catch {
    // ignore
  }

  return NextResponse.json({
    connected: true,
    username: account.username,
    avatar: account.avatar,
    followers: meta.followers,
    expiresAt: account.expiresAt,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (session) {
    const account = await prisma.socialAccount.findUnique({
      where: { userId_platform: { userId: session.id, platform: "tiktok" } },
    });
    if (account) {
      try {
        await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: process.env.TIKTOK_CLIENT_KEY!,
            client_secret: process.env.TIKTOK_CLIENT_SECRET!,
            token: account.accessToken,
          }),
        });
      } catch (err) {
        console.error("Token revoke failed:", err);
      }
      await prisma.socialAccount
        .delete({
          where: { userId_platform: { userId: session.id, platform: "tiktok" } },
        })
        .catch(() => {});
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete("tiktok_account");
  return response;
}
