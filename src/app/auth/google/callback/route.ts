import { NextRequest, NextResponse } from "next/server";
import { upsertSocialAccountForCurrentUser } from "@/lib/social-account";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=${encodeURIComponent(error)}`
    );
  }

  const csrfState = request.cookies.get("google_csrf")?.value;
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
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.NEXTAUTH_URL}/auth/google/callback`,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Google token error:", tokenData);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=${encodeURIComponent(
          tokenData.error_description || tokenData.error
        )}`
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    // Get user info
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const userData = await userRes.json();

    // Get YouTube channel info
    let channelName = userData.name || "YouTube User";
    let channelId = "";
    let subscriberCount = 0;
    let channelAvatar = userData.picture || "";

    try {
      const ytRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      const ytData = await ytRes.json();
      const channel = ytData.items?.[0];
      if (channel) {
        channelName = channel.snippet?.title || channelName;
        channelId = channel.id;
        subscriberCount = parseInt(channel.statistics?.subscriberCount || "0", 10);
        channelAvatar = channel.snippet?.thumbnails?.default?.url || channelAvatar;
      }
    } catch {
      // Skip if YouTube channel fetch fails
    }

    const accountData = JSON.stringify({
      platform: "youtube",
      accessToken: access_token,
      refreshToken: refresh_token,
      channelId,
      username: channelName,
      avatar: channelAvatar,
      subscribers: subscriberCount,
      expiresAt: Date.now() + (expires_in || 3600) * 1000,
    });

    await upsertSocialAccountForCurrentUser({
      platform: "youtube",
      accessToken: access_token,
      refreshToken: refresh_token ?? null,
      expiresAt: new Date(Date.now() + (expires_in || 3600) * 1000),
      externalId: channelId || null,
      username: channelName,
      avatar: channelAvatar,
      meta: { subscribers: subscriberCount },
    });

    const response = NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?connected=youtube`
    );

    response.cookies.set("youtube_account", accountData, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (err) {
    console.error("Google OAuth error:", err);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=token_exchange_failed`
    );
  }
}
