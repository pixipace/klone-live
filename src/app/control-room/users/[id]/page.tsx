import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { UserActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      socialAccounts: {
        select: {
          platform: true,
          username: true,
          createdAt: true,
          expiresAt: true,
        },
      },
      _count: {
        select: { socialAccounts: true, posts: true, clipJobs: true },
      },
    },
  });

  if (!user) notFound();

  const [recentPosts, recentClipJobs] = await Promise.all([
    prisma.post.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        caption: true,
        status: true,
        platforms: true,
        createdAt: true,
      },
    }),
    prisma.clipJob.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        sourceTitle: true,
        sourceUrl: true,
        status: true,
        createdAt: true,
        _count: { select: { clips: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/control-room/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to users
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xl font-semibold">
            {(user.name || user.email)[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              {user.name || "(no name)"}
              {user.role === "ADMIN" && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-error/10 text-error font-medium">
                  ADMIN
                </span>
              )}
              {user.banned && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-error/10 text-error font-medium">
                  BANNED
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground mt-1">
              ID: {user.id} · Joined{" "}
              {user.createdAt.toLocaleString()}
            </p>
          </div>
        </div>
        <UserActions
          user={{
            id: user.id,
            email: user.email,
            plan: user.plan,
            role: user.role,
            banned: user.banned,
          }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Plan" value={user.plan} />
        <Stat label="Connected" value={String(user._count.socialAccounts)} />
        <Stat label="Posts" value={String(user._count.posts)} />
        <Stat label="Clip jobs" value={String(user._count.clipJobs)} />
      </div>

      <Section title="Connected social accounts">
        {user.socialAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="space-y-2">
            {user.socialAccounts.map((a) => {
              const daysLeft = a.expiresAt
                ? Math.floor(
                    (new Date(a.expiresAt).getTime() - Date.now()) / 86400000
                  )
                : null;
              return (
                <div
                  key={a.platform}
                  className="flex items-center justify-between px-4 py-2 rounded-lg bg-card border border-border/60"
                >
                  <div>
                    <span className="text-sm font-medium capitalize">
                      {a.platform}
                    </span>
                    {a.username && (
                      <span className="text-xs text-muted-foreground ml-2">
                        @{a.username}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {daysLeft !== null
                      ? daysLeft >= 0
                        ? `${daysLeft}d left`
                        : "expired"
                      : "no expiry"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Recent posts">
        {recentPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts.</p>
        ) : (
          <div className="space-y-2">
            {recentPosts.map((p) => (
              <div
                key={p.id}
                className="px-4 py-2 rounded-lg bg-card border border-border/60 text-xs"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-muted-foreground capitalize">
                    {p.status.toLowerCase()}
                  </span>
                  <span className="text-muted-foreground">
                    {p.createdAt.toLocaleString()}
                  </span>
                </div>
                <p className="text-sm truncate">{p.caption || "(no caption)"}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {p.platforms || "no platforms"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent clip jobs">
        {recentClipJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clip jobs.</p>
        ) : (
          <div className="space-y-2">
            {recentClipJobs.map((j) => (
              <div
                key={j.id}
                className="px-4 py-2 rounded-lg bg-card border border-border/60 text-xs"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-muted-foreground capitalize">
                    {j.status.toLowerCase()} · {j._count.clips} clips
                  </span>
                  <span className="text-muted-foreground">
                    {j.createdAt.toLocaleString()}
                  </span>
                </div>
                <p className="text-sm truncate">
                  {j.sourceTitle || "(processing…)"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">
                  {j.sourceUrl}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card border border-border/60 p-4">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-xl font-light mt-1">{value}</p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}
