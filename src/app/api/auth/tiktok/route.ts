import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectUri = `${process.env.NEXTAUTH_URL}/auth/tiktok/callback`;

  const csrfState = crypto.randomUUID();
  const scope = "user.info.basic,video.publish,video.upload,video.list";

  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authUrl.searchParams.set("client_key", clientKey!);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", csrfState);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("tiktok_csrf", csrfState, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
  });

  return response;
}
