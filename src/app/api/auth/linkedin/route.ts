import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/auth/linkedin/callback`;

  const csrfState = Math.random().toString(36).substring(2);
  const scope = "openid profile w_member_social";

  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId!);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", csrfState);
  authUrl.searchParams.set("scope", scope);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("linkedin_csrf", csrfState, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
  });

  return response;
}
