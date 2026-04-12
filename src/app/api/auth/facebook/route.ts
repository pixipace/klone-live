import { NextResponse } from "next/server";

export async function GET() {
  const appId = process.env.META_APP_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/auth/facebook/callback`;

  const csrfState = Math.random().toString(36).substring(2);
  // Request all Facebook + Instagram scopes in one auth flow
  const scope = [
    "public_profile",
    "pages_show_list",
    "business_management",
    "pages_manage_posts",
    "pages_read_engagement",
    "publish_video",
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_insights",
    "instagram_manage_comments",
  ].join(",");

  const authUrl = new URL("https://www.facebook.com/v24.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId!);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", csrfState);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("response_type", "code");

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("facebook_csrf", csrfState, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
  });

  return response;
}
