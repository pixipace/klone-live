import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, PenSquare, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; variant: "success" | "warning" | "error" | "default" | "accent" }> = {
  POSTED: { label: "Published", variant: "success" },
  PARTIAL: { label: "Partial", variant: "warning" },
  POSTING: { label: "Posting…", variant: "accent" },
  FAILED: { label: "Failed", variant: "error" },
  DRAFT: { label: "Draft", variant: "default" },
};

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

export default async function PostsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const posts = await prisma.post.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Posts</h1>
        <Link href="/dashboard/create">
          <Button size="sm">
            <PenSquare className="w-4 h-4 mr-1" />
            New Post
          </Button>
        </Link>
      </div>

      {posts.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium">No posts yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Create your first post to start publishing content to your social
              media accounts.
            </p>
            <Link href="/dashboard/create" className="inline-block mt-6">
              <Button>
                <PenSquare className="w-4 h-4 mr-2" />
                Create your first post
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const status = STATUS_LABEL[post.status] ?? STATUS_LABEL.DRAFT;
            const platforms = post.platforms ? post.platforms.split(",") : [];
            const links = parseResults(post.results);
            const linkByPlatform = new Map(links.map((l) => [l.platform, l]));
            return (
              <Card key={post.id} className="p-4">
                <div className="flex items-start gap-4">
                  {post.mediaType === "video" && (
                    <div className="w-20 h-20 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0 text-xs text-muted-foreground">
                      Video
                    </div>
                  )}
                  {post.mediaType === "image" && (
                    <div className="w-20 h-20 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0 text-xs text-muted-foreground">
                      Image
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2 mb-2">
                      {post.caption || <span className="text-muted-foreground">No caption</span>}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {platforms.map((p) => {
                        const link = linkByPlatform.get(p);
                        if (link?.url) {
                          return (
                            <a
                              key={p}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] px-2 py-0.5 rounded bg-success/10 text-success inline-flex items-center gap-1 hover:bg-success/15 transition-colors"
                            >
                              {p}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          );
                        }
                        if (link?.error) {
                          return (
                            <span
                              key={p}
                              title={link.error}
                              className="text-[11px] px-2 py-0.5 rounded bg-error/10 text-error"
                            >
                              {p} failed
                            </span>
                          );
                        }
                        return (
                          <span
                            key={p}
                            className="text-[11px] px-2 py-0.5 rounded bg-card border border-border text-muted-foreground"
                          >
                            {p}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
