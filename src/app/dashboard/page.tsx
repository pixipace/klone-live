import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PenSquare,
  ArrowRight,
  Calendar,
  Send,
  Scissors,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  ExternalLink,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const platforms = [
  { id: "tiktok", name: "TikTok", color: "#00f2ea", letter: "T" },
  { id: "instagram", name: "Instagram", color: "#e4405f", letter: "I" },
  { id: "facebook", name: "Facebook", color: "#1877f2", letter: "f" },
  { id: "youtube", name: "YouTube", color: "#ff0000", letter: "Y" },
  { id: "linkedin", name: "LinkedIn", color: "#0077b5", letter: "in" },
];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000);

  const [
    scheduledCount,
    postedThisWeek,
    failedThisWeek,
    clipsTotal,
    postsLifetime,
    socialAccounts,
    recentPosts,
    recentClipJobs,
  ] = await Promise.all([
    prisma.post.count({
      where: { userId: session.id, status: "SCHEDULED" },
    }),
    prisma.post.count({
      where: {
        userId: session.id,
        status: { in: ["POSTED", "PARTIAL"] },
        postedAt: { gte: weekAgo },
      },
    }),
    prisma.post.count({
      where: {
        userId: session.id,
        status: "FAILED",
        createdAt: { gte: weekAgo },
      },
    }),
    prisma.clip.count({
      where: { job: { userId: session.id } },
    }),
    prisma.post.count({
      where: {
        userId: session.id,
        status: { in: ["POSTED", "PARTIAL"] },
      },
    }),
    prisma.socialAccount.findMany({
      where: { userId: session.id },
      select: { platform: true, expiresAt: true, username: true },
    }),
    prisma.post.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        caption: true,
        status: true,
        platforms: true,
        results: true,
        createdAt: true,
      },
    }),
    prisma.clipJob.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        sourceTitle: true,
        status: true,
        progress: true,
        stageDetail: true,
        _count: { select: { clips: true } },
      },
    }),
  ]);

  // Parse per-platform URLs from each recent post's `results` JSON for the
  // tappable link tags on the dashboard (rather than just text labels).
  function parseLinks(raw: string | null): Map<string, string> {
    if (!raw) return new Map();
    try {
      const obj = JSON.parse(raw) as Record<string, { url?: string }>;
      const m = new Map<string, string>();
      for (const [platform, r] of Object.entries(obj)) {
        if (r?.url) m.set(platform, r.url);
      }
      return m;
    } catch {
      return new Map();
    }
  }

  const connectedPlatformIds = new Set(socialAccounts.map((a) => a.platform));
  const successRate =
    postedThisWeek + failedThisWeek > 0
      ? Math.round((postedThisWeek / (postedThisWeek + failedThisWeek)) * 100)
      : null;

  const greet = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  // Progressive onboarding — show the checklist until all three are done.
  // Each step transitions from pending → done as the user makes progress,
  // so the banner morphs rather than disappearing on first action.
  const onboarding = {
    connectedAccount: socialAccounts.length > 0,
    generatedClip: clipsTotal > 0,
    publishedPost: postsLifetime > 0 || scheduledCount > 0,
  };
  const onboardingDone =
    onboarding.connectedAccount &&
    onboarding.generatedClip &&
    onboarding.publishedPost;
  const onboardingComplete = Object.values(onboarding).filter(Boolean).length;

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {greet}, {session.name?.split(" ")[0] || "there"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {clipsTotal === 0 && postsLifetime === 0 ? (
            <>Here&apos;s what&apos;s happening with your content this week.</>
          ) : (
            <>
              You&apos;ve made{" "}
              <strong className="text-foreground font-medium">
                {clipsTotal} clip{clipsTotal === 1 ? "" : "s"}
              </strong>{" "}
              and published{" "}
              <strong className="text-foreground font-medium">
                {postsLifetime} post{postsLifetime === 1 ? "" : "s"}
              </strong>{" "}
              to social so far.
            </>
          )}
        </p>
      </div>

      {!onboardingDone && (() => {
        // Compute the "current" step — the first not-done one. That
        // step gets the highlighted styling + always-visible CTA so
        // a new user has zero ambiguity about what to click next.
        const steps = [
          {
            n: 1,
            done: onboarding.connectedAccount,
            title: "Connect a social account",
            desc: "OAuth into TikTok, Instagram, Facebook, YouTube, or LinkedIn. ~30 seconds. Tokens are encrypted at rest.",
            href: "/dashboard/accounts",
            cta: "Connect accounts",
            icon: Users,
          },
          {
            n: 2,
            done: onboarding.generatedClip,
            title: "Generate your first video",
            desc: "Paste a YouTube URL. Clip Studio extracts viral moments from your own talks; Explainer Studio narrates AI commentary over silent clips of any source (copyright-safe).",
            href: "/dashboard/clips",
            cta: "Open Clip Studio",
            icon: Scissors,
          },
          {
            n: 3,
            done: onboarding.publishedPost,
            title: "Schedule + post",
            desc: "Auto-distribute across platforms at each one's best time, or post a single clip on demand.",
            href: "/dashboard/create",
            cta: "Compose post",
            icon: Send,
          },
        ];
        const currentStepIdx = steps.findIndex((s) => !s.done);
        return (
          <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 md:p-7 shadow-sm">
            <div className="flex items-center justify-between mb-4 gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                  {onboardingComplete === 0
                    ? "Welcome to Klone"
                    : `${onboardingComplete}/3 done`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-8 rounded-full transition-colors ${
                      i < onboardingComplete
                        ? "bg-accent"
                        : i === onboardingComplete
                        ? "bg-accent/40"
                        : "bg-border"
                    }`}
                  />
                ))}
              </div>
            </div>
            <h3 className="text-2xl font-semibold tracking-tight mb-1">
              {onboardingComplete === 0
                ? "First clip in ~10 minutes"
                : "Keep going — almost there"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-lg">
              {onboardingComplete === 0
                ? "Three quick steps. Every one is reversible — connections can be disconnected, clips can be deleted, scheduled posts can be cancelled."
                : `Just ${3 - onboardingComplete} more step${3 - onboardingComplete === 1 ? "" : "s"} until your first post lands.`}
            </p>
            <div className="space-y-2.5">
              {steps.map((s, i) => (
                <Step
                  key={s.n}
                  num={s.n}
                  title={s.title}
                  desc={s.desc}
                  href={s.href}
                  cta={s.cta}
                  done={s.done}
                  icon={s.icon}
                  isCurrent={i === currentStepIdx}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Posted this week"
          value={String(postedThisWeek)}
          icon={Send}
          accent={postedThisWeek > 0}
        />
        <StatCard
          label="Scheduled"
          value={String(scheduledCount)}
          icon={Calendar}
          accent={scheduledCount > 0}
        />
        <StatCard
          label="Clips generated"
          value={String(clipsTotal)}
          icon={Scissors}
          accent={clipsTotal > 0}
        />
        <StatCard
          label="Success rate (7d)"
          value={successRate === null ? "—" : `${successRate}%`}
          icon={CheckCircle2}
          accent={successRate === null ? false : successRate >= 90}
          warning={successRate !== null && successRate < 70}
        />
      </div>

      {/* Connected platforms */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Connected accounts
        </h3>
        <div className="flex gap-2 flex-wrap">
          {platforms.map((p) => {
            const account = socialAccounts.find((a) => a.platform === p.id);
            const isConnected = !!account;
            const expiresAt = account?.expiresAt;
            const daysLeft = expiresAt
              ? Math.floor(
                  (new Date(expiresAt).getTime() - Date.now()) / 86400000
                )
              : null;
            const expiringSoon =
              daysLeft !== null && daysLeft >= 0 && daysLeft < 7;
            return (
              <Link
                key={p.id}
                href="/dashboard/accounts"
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                  isConnected
                    ? expiringSoon
                      ? "bg-warning/5 border-warning/30"
                      : "bg-card border-border hover:border-border-hover"
                    : "bg-card/40 border-dashed border-border opacity-60 hover:opacity-100"
                }`}
              >
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: p.color }}
                >
                  {p.letter}
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  {p.name}
                </span>
                {isConnected && expiringSoon && (
                  <AlertCircle className="w-3 h-3 text-warning" />
                )}
                {!isConnected && (
                  <span className="text-[10px] text-muted">connect</span>
                )}
              </Link>
            );
          })}
        </div>
        {connectedPlatformIds.size === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Connect at least one account to start posting →{" "}
            <Link href="/dashboard/accounts" className="text-accent hover:underline">
              Accounts
            </Link>
          </p>
        )}
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RecentPostsCard
          posts={recentPosts.map((p) => ({
            id: p.id,
            caption: p.caption,
            status: p.status,
            platforms: p.platforms ? p.platforms.split(",") : [],
            links: parseLinks(p.results),
          }))}
        />
        <ActivityCard
          title="Recent clip jobs"
          href="/dashboard/clips"
          empty="No clip jobs yet — paste a YouTube URL"
          items={recentClipJobs.map((j) => ({
            key: j.id,
            label: j.sourceTitle || "(processing…)",
            sub:
              j.status === "RUNNING"
                ? `${j.stageDetail || "running"} · ${j.progress}%`
                : `${j.status.toLowerCase()} · ${j._count.clips} clip${j._count.clips === 1 ? "" : "s"}`,
          }))}
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/dashboard/clips"
          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-accent/10 via-card to-card border border-accent/20 p-6 hover:border-accent/40 transition-all"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center mb-4">
              <Scissors className="w-5 h-5 text-accent" />
            </div>
            <h3 className="text-base font-medium">Generate clips</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Paste a YouTube URL → get cinematic 9:16 clips ready to post.
            </p>
            <div className="flex items-center gap-1 mt-4 text-xs text-accent font-medium">
              Open Clip Studio
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/create"
          className="group relative overflow-hidden rounded-xl bg-card border border-border p-6 hover:border-border-hover transition-all card-glow"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-card-hover flex items-center justify-center mb-4">
              <PenSquare className="w-5 h-5 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium">Create a post</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upload media or write a caption and post to all your platforms.
            </p>
            <div className="flex items-center gap-1 mt-4 text-xs text-muted-foreground font-medium group-hover:text-foreground transition-colors">
              Start posting
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

function Step({
  num,
  title,
  desc,
  href,
  cta,
  done,
  icon: Icon,
  isCurrent,
}: {
  num: number;
  title: string;
  desc: string;
  href: string;
  cta: string;
  done?: boolean;
  icon?: React.ElementType;
  /** True when this is the next-to-do step. Highlights the row and
   *  always shows the CTA (vs hover-only for non-current steps). */
  isCurrent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-start gap-4 p-3 rounded-lg transition-all group ${
        done
          ? "opacity-60 hover:opacity-100"
          : isCurrent
          ? "bg-accent-soft border border-accent/20 hover:border-accent/40"
          : "hover:bg-card-hover border border-transparent"
      }`}
    >
      <div
        className={`w-9 h-9 rounded-md flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
          done
            ? "bg-success-soft text-success"
            : isCurrent
            ? "bg-foreground text-background"
            : "bg-foreground/5 text-foreground"
        }`}
      >
        {done ? (
          <CheckCircle2 className="w-4.5 h-4.5" />
        ) : Icon ? (
          <Icon className="w-4 h-4" />
        ) : (
          num
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className={`text-sm font-semibold tracking-tight ${done ? "line-through text-muted-foreground" : ""}`}>
          {title}
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <span
        className={`text-xs font-medium self-center whitespace-nowrap transition-opacity ${
          done
            ? "text-muted opacity-0 group-hover:opacity-100"
            : isCurrent
            ? "text-accent"
            : "text-foreground-secondary opacity-0 group-hover:opacity-100"
        }`}
      >
        {done ? "Done ✓" : `${cta} →`}
      </span>
    </Link>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  warning,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="relative group rounded-xl bg-card border border-border p-5 card-glow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p
            className={`text-3xl font-light mt-2 tracking-tight ${
              warning
                ? "text-warning"
                : accent
                  ? "text-foreground"
                  : "text-muted-foreground"
            }`}
          >
            {value}
          </p>
        </div>
        <Icon
          className={`w-5 h-5 ${
            warning
              ? "text-warning"
              : accent
                ? "text-accent"
                : "text-muted/40"
          }`}
        />
      </div>
    </div>
  );
}

function RecentPostsCard({
  posts,
}: {
  posts: Array<{
    id: string;
    caption: string;
    status: string;
    platforms: string[];
    links: Map<string, string>;
  }>;
}) {
  return (
    <div className="block rounded-xl bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">Recent posts</h4>
        <Link
          href="/dashboard/posts"
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          See all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          No posts yet — create one
        </p>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <div key={p.id} className="space-y-1.5">
              <p className="text-xs text-foreground line-clamp-2">
                {p.caption || (
                  <span className="text-muted-foreground">No caption</span>
                )}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {p.platforms.map((plat) => {
                  const url = p.links.get(plat);
                  if (url) {
                    return (
                      <a
                        key={plat}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success inline-flex items-center gap-1 hover:bg-success/15 transition-colors"
                      >
                        {plat}
                        <ExternalLink className="w-2 h-2" />
                      </a>
                    );
                  }
                  return (
                    <span
                      key={plat}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground"
                    >
                      {plat} · {p.status.toLowerCase()}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityCard({
  title,
  href,
  empty,
  items,
}: {
  title: string;
  href: string;
  empty: string;
  items: Array<{ key: string; label: string; sub: string }>;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl bg-card border border-border p-5 hover:border-border-hover transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">{title}</h4>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          {empty}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex flex-col gap-0.5 text-xs"
            >
              <span className="text-foreground truncate">{item.label}</span>
              <span className="text-muted-foreground text-[11px] truncate">
                {item.sub}
              </span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
