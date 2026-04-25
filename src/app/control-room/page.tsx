import Link from "next/link";
import { Users, FileText, Scissors, Calendar, AlertCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 86400 * 1000);
  const dayAgo = new Date(now.getTime() - 86400 * 1000);

  const [
    totalUsers,
    newUsersWeek,
    newUsersMonth,
    bannedUsers,
    totalPosts,
    postsWeek,
    failedPostsWeek,
    totalClipJobs,
    clipsWeek,
    failedClipsWeek,
    runningClipJobs,
    queuedClipJobs,
    totalSocialAccounts,
    recentSignups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.user.count({ where: { banned: true } }),
    prisma.post.count(),
    prisma.post.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.post.count({
      where: { status: "FAILED", createdAt: { gte: weekAgo } },
    }),
    prisma.clipJob.count(),
    prisma.clipJob.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.clipJob.count({
      where: { status: "FAILED", createdAt: { gte: weekAgo } },
    }),
    prisma.clipJob.count({ where: { status: "RUNNING" } }),
    prisma.clipJob.count({ where: { status: "QUEUED" } }),
    prisma.socialAccount.count(),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, email: true, name: true, createdAt: true, role: true },
    }),
  ]);

  const newUsers24h = await prisma.user.count({
    where: { createdAt: { gte: dayAgo } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What&apos;s happening across all of Klone.
        </p>
      </div>

      <Section title="Users">
        <KpiGrid>
          <Kpi label="Total" value={totalUsers} icon={Users} />
          <Kpi label="New (24h)" value={newUsers24h} icon={Users} accent={newUsers24h > 0} />
          <Kpi label="New (7d)" value={newUsersWeek} icon={Users} accent={newUsersWeek > 0} />
          <Kpi label="New (30d)" value={newUsersMonth} icon={Users} />
          <Kpi label="Connected accounts" value={totalSocialAccounts} icon={Users} />
          <Kpi label="Banned" value={bannedUsers} icon={AlertCircle} warning={bannedUsers > 0} />
        </KpiGrid>
      </Section>

      <Section title="Posts">
        <KpiGrid>
          <Kpi label="Total" value={totalPosts} icon={FileText} />
          <Kpi label="Last 7d" value={postsWeek} icon={FileText} accent={postsWeek > 0} />
          <Kpi
            label="Failed (7d)"
            value={failedPostsWeek}
            icon={AlertCircle}
            warning={failedPostsWeek > 0}
          />
        </KpiGrid>
      </Section>

      <Section title="Clip jobs">
        <KpiGrid>
          <Kpi label="Total ran" value={totalClipJobs} icon={Scissors} />
          <Kpi label="Last 7d" value={clipsWeek} icon={Scissors} accent={clipsWeek > 0} />
          <Kpi label="Running" value={runningClipJobs} icon={Calendar} accent={runningClipJobs > 0} />
          <Kpi label="Queued" value={queuedClipJobs} icon={Calendar} />
          <Kpi
            label="Failed (7d)"
            value={failedClipsWeek}
            icon={AlertCircle}
            warning={failedClipsWeek > 0}
          />
        </KpiGrid>
      </Section>

      <Section title="Recent signups">
        {recentSignups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <div className="space-y-2">
            {recentSignups.map((u) => (
              <Link
                key={u.id}
                href={`/control-room/users/${u.id}`}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-card border border-border/60 hover:border-border-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-semibold">
                    {(u.name || u.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.name || "(no name)"}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  {u.role === "ADMIN" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error font-medium">
                      ADMIN
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {u.createdAt.toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>
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

function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  accent,
  warning,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl bg-card border border-border/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
        <Icon
          className={`w-4 h-4 ${warning ? "text-warning" : accent ? "text-accent" : "text-muted/40"}`}
        />
      </div>
      <p
        className={`text-2xl font-light mt-2 ${
          warning ? "text-warning" : "text-foreground"
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}
