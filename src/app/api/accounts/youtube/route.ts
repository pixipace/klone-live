import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get("youtube_account")?.value;
  if (!cookie) return NextResponse.json({ connected: false });

  try {
    const account = JSON.parse(cookie);
    return NextResponse.json({
      connected: true,
      username: account.username,
      avatar: account.avatar,
      subscribers: account.subscribers,
      channelId: account.channelId,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("youtube_account");
  return response;
}
