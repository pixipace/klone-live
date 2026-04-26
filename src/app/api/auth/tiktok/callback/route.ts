import { NextRequest, NextResponse } from "next/server";
import { upsertSocialAccountForCurrentUser } from "@/lib/social-account";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=${error}`
    );
  }

  const csrfState = request.cookies.get("tiktok_csrf")?.value;
  if (!state || state !== csrfState) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=invalid_state`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=no_code`
    );
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY!,
          client_secret: process.env.TIKTOK_CLIENT_SECRET!,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/tiktok/callback`,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=${tokenData.error}`
      );
    }

    const { access_token, refresh_token, open_id, expires_in } = tokenData;

    // Get user info
    const userResponse = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const userData = await userResponse.json();
    const userInfo = userData.data?.user;

    // Persist to SocialAccount table (encrypted at rest via the upsert
    // helper). Was previously also writing the same data to a `tiktok_account`
    // cookie that nothing reads anymore — removed since cookies leaked the
    // raw token to the client (httpOnly stops JS reads but it's still in
    // wire/storage). DB is the only source of truth now.
    const upsert = await upsertSocialAccountForCurrentUser({
      platform: "tiktok",
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
      externalId: open_id,
      username: userInfo?.display_name || "TikTok User",
      avatar: userInfo?.avatar_url || "",
    });
    if (!upsert.ok) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=session_lost`
      );
    }

    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?connected=tiktok`
    );
  } catch (err) {
    console.error("TikTok OAuth error:", err);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=token_exchange_failed`
    );
  }
}
