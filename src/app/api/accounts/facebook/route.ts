import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type FacebookMeta = {
  pages?: Array<{ id: string; name: string }>;
  selectedPageId?: string;
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });

  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform: "facebook" } },
  });
  if (!account) return NextResponse.json({ connected: false });

  let meta: FacebookMeta = {};
  try {
    if (account.meta) meta = JSON.parse(account.meta);
  } catch {
    // ignore
  }

  return NextResponse.json({
    connected: true,
    username: account.username,
    avatar: account.avatar,
    pages: (meta.pages || []).map((p) => ({ id: p.id, name: p.name })),
    pageCount: meta.pages?.length || 0,
    selectedPageId: meta.selectedPageId ?? meta.pages?.[0]?.id ?? null,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (session) {
    await prisma.socialAccount
      .delete({
        where: { userId_platform: { userId: session.id, platform: "facebook" } },
      })
      .catch(() => {});
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete("facebook_account");
  return response;
}
