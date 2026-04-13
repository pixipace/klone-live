import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get("linkedin_account")?.value;
  if (!cookie) return NextResponse.json({ connected: false });

  try {
    const account = JSON.parse(cookie);
    return NextResponse.json({
      connected: true,
      username: account.username,
      avatar: account.avatar,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("linkedin_account");
  return response;
}
