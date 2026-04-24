import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type IgMeta = {
  accounts?: Array<{
    instagramId: string;
    pageId: string;
    pageName?: string;
    username: string;
    avatar?: string;
    followers?: number;
  }>;
  selectedInstagramId?: string;
  followers?: number;
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });

  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform: "instagram" } },
  });
  if (!account) return NextResponse.json({ connected: false });

  let meta: IgMeta = {};
  try {
    if (account.meta) meta = JSON.parse(account.meta);
  } catch {
    // ignore
  }

  return NextResponse.json({
    connected: true,
    username: account.username,
    avatar: account.avatar,
    followers: meta.followers,
    accounts: meta.accounts || [],
    accountCount: meta.accounts?.length || 0,
    selectedInstagramId:
      meta.selectedInstagramId ?? meta.accounts?.[0]?.instagramId ?? null,
    expiresAt: account.expiresAt,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (session) {
    await prisma.socialAccount
      .delete({
        where: { userId_platform: { userId: session.id, platform: "instagram" } },
      })
      .catch(() => {});
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete("instagram_account");
  return response;
}
