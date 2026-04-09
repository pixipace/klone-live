import { NextRequest, NextResponse } from "next/server";

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
          redirect_uri: `${process.env.NEXTAUTH_URL}/auth/tiktok/callback`,
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

    // Store in a cookie for now (in production, save to database)
    const accountData = JSON.stringify({
      platform: "tiktok",
      accessToken: access_token,
      refreshToken: refresh_token,
      openId: open_id,
      expiresAt: Date.now() + expires_in * 1000,
      username: userInfo?.display_name || "TikTok User",
      avatar: userInfo?.avatar_url || "",
      followers: userInfo?.follower_count || 0,
    });

    const response = NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?connected=tiktok`
    );

    response.cookies.set("tiktok_account", accountData, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (err) {
    console.error("TikTok OAuth error:", err);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=token_exchange_failed`
    );
  }
}
