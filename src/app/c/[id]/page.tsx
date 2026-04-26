import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ArrowRight, Sparkles, Play } from "lucide-react";

const APP_URL = process.env.NEXTAUTH_URL || "https://klone.live";

/**
 * Build absolute media URLs for OG/Twitter cards. Social platforms need
 * fully-qualified URLs (no relative paths).
 */
function publicMediaUrl(clipId: string, filename: string): string {
  return `${APP_URL}/api/public-clips/${clipId}/${filename}`;
}

function nameFromPath(p: string | null): string | null {
  if (!p) return null;
  const m = p.match(/\/([^/]+)$/);
  return m ? m[1] : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const clip = await prisma.clip.findFirst({
    where: { id, publicShareEnabled: true },
    select: {
      hookTitle: true,
      transcript: true,
      videoPath: true,
      thumbnailPath: true,
    },
  });

  if (!clip) {
    return {
      title: "Clip not found — Klone",
      robots: { index: false, follow: false },
    };
  }

  const title = clip.hookTitle || "A Klone clip";
  const description =
    clip.transcript?.slice(0, 200) ||
    "Made with Klone — turn long videos into cinematic short clips.";
  const thumbName = nameFromPath(clip.thumbnailPath);
  const videoName = nameFromPath(clip.videoPath);
  const thumbUrl = thumbName ? publicMediaUrl(id, thumbName) : null;
  const videoUrl = videoName ? publicMediaUrl(id, videoName) : null;
  const pageUrl = `${APP_URL}/c/${id}`;

  return {
    title: `${title} — Klone`,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: "video.other",
      siteName: "Klone",
      images: thumbUrl ? [{ url: thumbUrl, width: 1080, height: 1920 }] : [],
      videos: videoUrl
        ? [{ url: videoUrl, width: 1080, height: 1920, type: "video/mp4" }]
        : [],
    },
    twitter: {
      card: "player",
      title,
      description,
      images: thumbUrl ? [thumbUrl] : [],
      players: videoUrl
        ? [
            {
              playerUrl: videoUrl,
              streamUrl: videoUrl,
              width: 1080,
              height: 1920,
            },
          ]
        : [],
    },
  };
}

// Public clip pages don't require auth — render fresh per request to
// honor revoked-visibility instantly. Skip the marketing-stats hit too.
export const dynamic = "force-dynamic";

export default async function PublicClipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const clip = await prisma.clip.findFirst({
    where: { id, publicShareEnabled: true },
    select: {
      id: true,
      hookTitle: true,
      transcript: true,
      videoPath: true,
      thumbnailPath: true,
      musicAttribution: true,
      durationSec: true,
      viralityScore: true,
      publicViews: true,
      job: { select: { sourceTitle: true, sourceUrl: true } },
    },
  });

  if (!clip || !clip.videoPath) notFound();

  // Bump pageview counter (fire-and-forget — never block render)
  prisma.clip
    .update({
      where: { id: clip.id },
      data: { publicViews: { increment: 1 } },
    })
    .catch(() => {});

  const videoName = nameFromPath(clip.videoPath);
  const thumbName = nameFromPath(clip.thumbnailPath);
  const videoUrl = videoName ? `/api/public-clips/${id}/${videoName}` : null;
  const thumbUrl = thumbName ? `/api/public-clips/${id}/${thumbName}` : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header — minimal, links to klone.live */}
      <header className="border-b border-border/40 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo-icon.png" alt="Klone" width={22} height={22} />
            <span className="text-sm font-semibold tracking-tight">KLONE</span>
          </Link>
          <Link
            href="/signup"
            className="text-xs font-medium bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Try Klone free
          </Link>
        </div>
      </header>

      {/* Clip + meta */}
      <main className="flex-1 px-4 py-8 md:py-12">
        <div className="max-w-md mx-auto space-y-6">
          {/* The video */}
          {videoUrl && (
            <div className="relative rounded-2xl bg-black overflow-hidden shadow-2xl shadow-black/40 aspect-[9/16]">
              <video
                src={videoUrl}
                poster={thumbUrl ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full"
              />
            </div>
          )}

          {/* Hook title */}
          <div>
            <h1 className="text-xl font-semibold leading-snug text-balance">
              {clip.hookTitle}
            </h1>
            {clip.job?.sourceTitle && (
              <p className="text-xs text-muted-foreground mt-2">
                Clipped from{" "}
                {clip.job.sourceUrl ? (
                  <a
                    href={clip.job.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-accent underline-offset-2 hover:underline"
                  >
                    {clip.job.sourceTitle}
                  </a>
                ) : (
                  clip.job.sourceTitle
                )}
              </p>
            )}
            {clip.musicAttribution && (
              <p className="text-[11px] text-muted mt-1">
                {clip.musicAttribution}
              </p>
            )}
          </div>

          {/* Acquisition CTA — the whole point of this page */}
          <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-card to-card p-5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-medium uppercase tracking-wider mb-2">
                <Sparkles className="w-3 h-3" />
                Made with Klone
              </div>
              <h2 className="text-lg font-semibold mb-1">
                Turn YOUR long videos into clips like this
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Klone uses AI to find viral moments, cut them vertical, add
                captions, and publish across TikTok, Instagram, YouTube,
                Facebook, and LinkedIn — automatically.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 text-sm font-medium bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Start clipping free
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  See how it works
                </Link>
              </div>
            </div>
          </div>

          {/* Quiet stat strip at the bottom */}
          <div className="flex items-center justify-center gap-6 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Play className="w-3 h-3" />
              {clip.publicViews + 1} views
            </span>
            {clip.viralityScore && (
              <span>{clip.viralityScore}/10 virality</span>
            )}
            {clip.durationSec && (
              <span>{Math.round(clip.durationSec)}s</span>
            )}
          </div>
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-border/40 py-5 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-[11px] text-muted">
          <span>&copy; 2026 Klone</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-muted-foreground">
              Home
            </Link>
            <Link href="/pricing" className="hover:text-muted-foreground">
              Pricing
            </Link>
            <Link href="/privacy" className="hover:text-muted-foreground">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
