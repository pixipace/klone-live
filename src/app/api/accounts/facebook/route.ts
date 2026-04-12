import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get("facebook_account")?.value;
  if (!cookie) return NextResponse.json({ connected: false });

  try {
    const account = JSON.parse(cookie);
    return NextResponse.json({
      connected: true,
      username: account.username,
      avatar: account.avatar,
      pages: (account.pages || []).map(
        (p: { id: string; name: string }) => ({
          id: p.id,
          name: p.name,
        })
      ),
      pageCount: account.pages?.length || 0,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("facebook_account");
  return response;
}
