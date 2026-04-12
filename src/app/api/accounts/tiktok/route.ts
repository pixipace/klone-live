import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const tiktokCookie = request.cookies.get("tiktok_account")?.value;

  if (!tiktokCookie) {
    return NextResponse.json({ connected: false });
  }

  try {
    const account = JSON.parse(tiktokCookie);
    return NextResponse.json({
      connected: true,
      username: account.username,
      avatar: account.avatar,
      followers: account.followers,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

export async function DELETE(request: NextRequest) {
  const tiktokCookie = request.cookies.get("tiktok_account")?.value;

  // Revoke the token on TikTok's side so the user has to re-authorize
  if (tiktokCookie) {
    try {
      const account = JSON.parse(tiktokCookie);
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
      // Continue with cookie deletion even if revoke fails
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete("tiktok_account");
  return response;
}
