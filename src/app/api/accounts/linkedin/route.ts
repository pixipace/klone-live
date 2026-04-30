import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });

  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform: "linkedin" } },
  });
  if (!account) return NextResponse.json({ connected: false });

  // LinkedIn is the ONLY platform without a refresh token mechanism —
  // tokens last 60 days then must be re-OAuth'd. So expiresAt IS the
  // reconnect signal here. Other platforms refresh transparently.
  const now = Date.now();
  const expiry = account.expiresAt ? new Date(account.expiresAt).getTime() : null;
  const needsReconnect = expiry !== null && expiry <= now;
  return NextResponse.json({
    connected: true,
    needsReconnect,
    username: account.username,
    avatar: account.avatar,
    expiresAt: account.expiresAt,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (session) {
    await prisma.socialAccount
      .delete({
        where: { userId_platform: { userId: session.id, platform: "linkedin" } },
      })
      .catch(() => {});
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete("linkedin_account");
  return response;
}
