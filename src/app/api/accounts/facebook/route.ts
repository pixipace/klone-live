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

  // Meta long-lived tokens last 60 days. Refresh path is fb_exchange_token
  // (called by ensureFreshToken in src/lib/platforms/refresh.ts), no
  // separate refresh_token. We only flag needsReconnect when the token
  // is actually expired AND refresh would have been attempted (the
  // refresh helper extends well-before-expiry, so a still-expired
  // token here means refresh failed = user revoked grant).
  const now = Date.now();
  const expiry = account.expiresAt ? new Date(account.expiresAt).getTime() : null;
  const needsReconnect = expiry !== null && expiry <= now;
  return NextResponse.json({
    connected: true,
    needsReconnect,
    username: account.username,
    avatar: account.avatar,
    pages: (meta.pages || []).map((p) => ({ id: p.id, name: p.name })),
    pageCount: meta.pages?.length || 0,
    selectedPageId: meta.selectedPageId ?? meta.pages?.[0]?.id ?? null,
    expiresAt: account.expiresAt,
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
