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

  return NextResponse.json({
    connected: true,
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
