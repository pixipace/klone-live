import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, PenSquare, ExternalLink, AlertCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { format, isToday, isYesterday, startOfWeek, isAfter, formatDistanceToNow } from "date-fns";
import { RetryButton } from "./retry-button";
import { CancelScheduledButton } from "./cancel-scheduled-button";
import { MetricsRow } from "./metrics-row";

const FETCHABLE_PLATFORMS = new Set(["youtube", "instagram"]);

export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "all", label: "All", statuses: null },
  { id: "scheduled", label: "Scheduled", statuses: ["SCHEDULED"] },
  { id: "published", label: "Published", statuses: ["POSTED", "PARTIAL"] },
  { id: "failed", label: "Failed", statuses: ["FAILED"] },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

type PlatformLink = { platform: string; url?: string; error?: string };

function parseResults(raw: string | null): PlatformLink[] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw) as Record<
      string,
      { url?: string; error?: string }
    >;
    return Object.entries(obj).map(([platform, r]) => ({
      platform,
      url: r?.url,
      error: r?.error,
    }));
  } catch {
    return [];
  }
}

/** Status colour for the left-edge dot indicator (replaces the chunky badge). */
const STATUS_DOT: Record<string, { color: string; label: string }> = {
  POSTED: { color: "bg-success", label: "Published" },
  PARTIAL: { color: "bg-warning", label: "Partial" },
  POSTING: { color: "bg-accent", label: "Posting" },
  SCHEDULED: { color: "bg-accent/60", label: "Scheduled" },
  FAILED: { color: "bg-error", label: "Failed" },
  DRAFT: { color: "bg-muted/40", label: "Draft" },
};

/** Bucket a Post into a relative-date group label. Today / Yesterday /
 *  This week / Earlier this month / month-and-year for older posts. */
function bucketLabel(d: Date, sortByScheduled: boolean): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  if (isAfter(d, weekStart)) return sortByScheduled ? "This week" : "Earlier this week";
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  if (isAfter(d, monthStart)) return "Earlier this month";
  return format(d, "MMMM yyyy");
}

/** Derive the clip's thumbnail URL from a clips/{jobId}/{name}.mp4 mediaUrl
 *  by swapping the extension. The pipeline writes both files side-by-side. */
function thumbFromMediaUrl(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;
  if (!mediaUrl.match(/\/api\/uploads\/clips\/[^/]+\/.+\.mp4$/)) return null;
  return mediaUrl.replace(/\.mp4$/, ".jpg");
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.id === sp.filter)?.id ?? "all") as FilterId;
  const filterDef = FILTERS.find((f) => f.id === filter)!;

  const posts = await prisma.post.findMany({
    where: {
      userId: session.id,
      ...(filterDef.statuses && { status: { in: [...filterDef.statuses] } }),
    },
    orderBy:
      filter === "scheduled"
        ? { scheduledFor: "asc" }
        : { createdAt: "desc" },
    take: 200,
  });

  // Pre-compute per-filter counts for the tab bar so each tab shows its size
  const counts = await prisma.post.groupBy({
    by: ["status"],
    where: { userId: session.id },
    _count: { _all: true },
  });
  const countByStatus = new Map(counts.map((c) => [c.status, c._count._all]));
  const totalCount = Array.from(countByStatus.values()).reduce((a, b) => a + b, 0);
  const filterCount = (id: FilterId): number => {
    const def = FILTERS.find((f) => f.id === id)!;
    if (!def.statuses) return totalCount;
    return def.statuses.reduce(
      (sum, s) => sum + (countByStatus.get(s) ?? 0),
      0
    );
  };

  // Group posts by relative date bucket, preserving fetched order within each.
  const sortByScheduled = filter === "scheduled";
  const grouped = new Map<string, typeof posts>();
  for (const p of posts) {
    const sortDate =
      sortByScheduled && p.scheduledFor ? p.scheduledFor : p.createdAt;
    const key = bucketLabel(sortDate, sortByScheduled);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Posts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalCount} total · across all platforms and statuses
          </p>
        </div>
        <Link href="/dashboard/create">
          <Button size="sm">
            <PenSquare className="w-4 h-4 mr-1" />
            New Post
          </Button>
        </Link>
      </div>

      <div className="flex gap-1 items-center flex-wrap border-b border-border/40 -mb-2">
        {FILTERS.map((f) => {
          const isActive = filter === f.id;
          const n = filterCount(f.id);
          return (
            <Link
              key={f.id}
              href={f.id === "all" ? "/dashboard/posts" : `/dashboard/posts?filter=${f.id}`}
              className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px inline-flex items-center gap-2 ${
                isActive
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  isActive
                    ? "bg-accent/15 text-accent"
                    : "bg-card text-muted"
                }`}
              >
                {n}
              </span>
            </Link>
          );
        })}
        {filter === "scheduled" && posts.length > 0 && (
          <div className="ml-auto">
            <CancelScheduledButton count={posts.length} />
          </div>
        )}
      </div>

      {posts.length === 0 ? (
        <Card className="text-center py-16">
          <Calendar className="w-10 h-10 text-muted mx-auto mb-3" />
          <h3 className="text-base font-medium">
            {filter === "all" ? "No posts yet" : `No ${filterDef.label.toLowerCase()} posts`}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {filter === "all"
              ? "Create your first post or generate clips that auto-schedule across your platforms."
              : "Switch filters or create a new post."}
          </p>
          <Link href="/dashboard/create" className="inline-block mt-5">
            <Button size="sm">
              <PenSquare className="w-4 h-4 mr-2" />
              Create your first post
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([bucket, items]) => (
            <section key={bucket}>
              <h2 className="text-[10px] font-medium text-muted uppercase tracking-[0.15em] mb-2 px-1">
                {bucket}
              </h2>
              <div className="rounded-xl bg-card/60 border border-border/40 overflow-hidden divide-y divide-border/40">
                {items.map((post) => {
                  const platforms = post.platforms ? post.platforms.split(",") : [];
                  const links = parseResults(post.results);
                  const linkByPlatform = new Map(links.map((l) => [l.platform, l]));
                  const isScheduled = post.status === "SCHEDULED";
                  const dot = STATUS_DOT[post.status] ?? STATUS_DOT.DRAFT;
                  const thumbUrl = thumbFromMediaUrl(post.mediaUrl);
                  const failedPlatforms = links
                    .filter((l) => l.error)
                    .map((l) => l.platform);
                  const showRetry =
                    (post.status === "FAILED" || post.status === "PARTIAL") &&
                    failedPlatforms.length > 0;
                  const showMetrics =
                    post.status === "POSTED" || post.status === "PARTIAL";

                  return (
                    <article
                      key={post.id}
                      className="group flex items-center gap-3 px-3 py-3 hover:bg-card transition-colors"
                    >
                      {/* Status dot — left-edge accent in place of chunky badge */}
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot.color}`}
                        title={dot.label}
                      />

                      {/* Thumbnail (real frame from clip, or letter placeholder) */}
                      <div className="w-16 h-16 rounded-md bg-card border border-border/40 flex-shrink-0 overflow-hidden flex items-center justify-center text-[10px] text-muted">
                        {thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : post.mediaType === "image" && post.mediaUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={post.mediaUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{post.mediaType ?? "—"}</span>
                        )}
                      </div>

                      {/* Main content — title + meta + platform tags in TWO lines */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {post.caption || (
                              <span className="text-muted-foreground italic">
                                No caption
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[11px] text-muted">
                            {dot.label}
                          </span>
                          <span className="text-muted/40">·</span>
                          <span className="text-[11px] text-muted">
                            {isScheduled && post.scheduledFor
                              ? `for ${format(post.scheduledFor, "MMM d, h:mma")}`
                              : post.postedAt
                                ? formatDistanceToNow(post.postedAt, {
                                    addSuffix: true,
                                  })
                                : formatDistanceToNow(post.createdAt, {
                                    addSuffix: true,
                                  })}
                          </span>
                          {platforms.length > 0 && (
                            <>
                              <span className="text-muted/40">·</span>
                              <div className="flex gap-1 flex-wrap">
                                {platforms.map((p) => {
                                  const link = linkByPlatform.get(p);
                                  if (link?.url) {
                                    return (
                                      <a
                                        key={p}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success inline-flex items-center gap-1 hover:bg-success/15 transition-colors"
                                      >
                                        {p}
                                        <ExternalLink className="w-2 h-2" />
                                      </a>
                                    );
                                  }
                                  if (link?.error) {
                                    const isAuthErr =
                                      /token|auth|expired|401|403|invalid_grant|reconnect|reauth|unauthorized/i.test(
                                        link.error
                                      );
                                    if (isAuthErr) {
                                      return (
                                        <a
                                          key={p}
                                          href="/dashboard/accounts"
                                          title={link.error}
                                          className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning hover:bg-warning/15 inline-flex items-center gap-1 transition-colors"
                                        >
                                          <AlertCircle className="w-2 h-2" />
                                          {p}
                                        </a>
                                      );
                                    }
                                    return (
                                      <span
                                        key={p}
                                        title={link.error}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error"
                                      >
                                        {p}
                                      </span>
                                    );
                                  }
                                  return (
                                    <span
                                      key={p}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-card border border-border/40 text-muted-foreground"
                                    >
                                      {p}
                                    </span>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                        {/* Inline collapsible row for retry + metrics — only renders if relevant */}
                        {(showRetry || showMetrics) && (
                          <div className="mt-1.5">
                            {showRetry && (
                              <RetryButton
                                postId={post.id}
                                failedPlatforms={failedPlatforms}
                              />
                            )}
                            {showMetrics && (
                              <MetricsRow
                                postId={post.id}
                                metrics={(() => {
                                  if (!post.metrics) return {};
                                  try {
                                    return JSON.parse(post.metrics);
                                  } catch {
                                    return {};
                                  }
                                })()}
                                metricsUpdatedAt={
                                  post.metricsUpdatedAt
                                    ? post.metricsUpdatedAt.toISOString()
                                    : null
                                }
                                hasFetchablePlatforms={platforms.some((p) =>
                                  FETCHABLE_PLATFORMS.has(p)
                                )}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

