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

  // BACKFILL: older OAuth flows (or rows where the user/info call failed
  // during connect) left username empty. Now that we have a valid access
  // token, refresh the display_name from TikTok and update the row.
  // Silent — failures don't block the GET; we just return what we have.
  let username = account.username;
  let avatar = account.avatar;
  let followers = meta.followers;
  if (!username || username === "TikTok User" || username === "") {
    try {
      const userRes = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count",
        { headers: { Authorization: `Bearer ${account.accessToken}` } },
      );
      const data = await userRes.json();
      const u = data?.data?.user;
      if (u && (u.display_name || u.avatar_url || typeof u.follower_count === "number")) {
        username = u.display_name || username || "TikTok account";
        avatar = u.avatar_url || avatar;
        if (typeof u.follower_count === "number") {
          followers = u.follower_count;
          meta.followers = u.follower_count;
        }
        // Persist the refreshed values so the next request doesn't have
        // to re-fetch (and so the picker / posts page reads the same data).
        await prisma.socialAccount.update({
          where: { userId_platform: { userId: session.id, platform: "tiktok" } },
          data: {
            username,
            avatar: avatar ?? null,
            meta: JSON.stringify(meta),
          },
        });
      }
    } catch {
      // Network failure or TikTok API hiccup — just return what's in DB.
    }
  }

  // TikTok access tokens last 24h; we refresh via refresh_token before
  // every post. Like Google/YouTube, missing refresh_token is the only
  // real "reconnect" signal — short-TTL access expiry is normal.
  const needsReconnect = !account.refreshToken;
  return NextResponse.json({
    connected: true,
    needsReconnect,
    username: username || "TikTok account",
    avatar,
    followers,
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
