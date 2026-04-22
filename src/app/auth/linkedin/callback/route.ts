import { NextRequest, NextResponse } from "next/server";
import { upsertSocialAccountForCurrentUser } from "@/lib/social-account";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=${encodeURIComponent(
        errorDescription || error
      )}`
    );
  }

  const csrfState = request.cookies.get("linkedin_csrf")?.value;
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
    const tokenRes = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
          redirect_uri: `${process.env.NEXTAUTH_URL}/auth/linkedin/callback`,
        }),
      }
    );

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("LinkedIn token error:", tokenData);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=${encodeURIComponent(
          tokenData.error_description || tokenData.error
        )}`
      );
    }

    const { access_token, expires_in } = tokenData;

    // Get user profile via OpenID userinfo
    const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userData = await userRes.json();

    // Get person URN for posting
    const personUrn = userData.sub ? `urn:li:person:${userData.sub}` : "";

    const accountData = JSON.stringify({
      platform: "linkedin",
      accessToken: access_token,
      personUrn,
      username: userData.name || "LinkedIn User",
      avatar: userData.picture || "",
      email: userData.email || "",
      expiresAt: Date.now() + (expires_in || 5184000) * 1000,
    });

    await upsertSocialAccountForCurrentUser({
      platform: "linkedin",
      accessToken: access_token,
      expiresAt: new Date(Date.now() + (expires_in || 5184000) * 1000),
      externalId: userData.sub ?? null,
      username: userData.name ?? null,
      avatar: userData.picture ?? null,
      meta: { personUrn, email: userData.email ?? null },
    });

    const response = NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?connected=linkedin`
    );

    response.cookies.set("linkedin_account", accountData, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 60,
    });

    return response;
  } catch (err) {
    console.error("LinkedIn OAuth error:", err);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=token_exchange_failed`
    );
  }
}
