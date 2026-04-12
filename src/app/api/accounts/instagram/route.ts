import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get("instagram_account")?.value;
  if (!cookie) return NextResponse.json({ connected: false });

  try {
    const account = JSON.parse(cookie);
    return NextResponse.json({
      connected: true,
      username: account.username,
      avatar: account.avatar,
      followers: account.followers,
      accounts: account.accounts || [],
      accountCount: account.accounts?.length || 0,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("instagram_account");
  return response;
}
