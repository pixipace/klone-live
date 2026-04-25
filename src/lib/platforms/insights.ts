/**
 * Per-Post engagement metrics fetcher.
 *
 * Given a Post that's been published to one or more platforms, fetch the
 * latest engagement metrics from each platform's insights API. Returns
 * a per-platform map; failures fall through silently (a single platform's
 * API hiccup shouldn't block the rest).
 *
 * Currently implemented:
 *   - youtube  (videos.list?part=statistics — fully approved)
 *   - instagram (Media Insights API — instagram_manage_insights approved)
 *
 * Deferred (will return null until added):
 *   - facebook  (post insights — works but adds complexity for separate Page-token model)
 *   - linkedin  (personal posts have no public engagement endpoint)
 *   - tiktok    (video.list — not yet approved)
 */

import { prisma } from "@/lib/prisma";
import { ensureFreshToken } from "./refresh";

export type PlatformMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  impressions?: number;
  /** ISO timestamp when these metrics were fetched. */
  fetchedAt: string;
};

export type PostMetrics = Record<string, PlatformMetrics>;

type PostResultEntry = {
  url?: string;
  id?: string;
  error?: string;
};

/**
 * Fetch metrics for a single post across all the platforms it was published to.
 * Returns the merged metrics object (caller persists to Post.metrics + Post.metricsUpdatedAt).
 */
export async function fetchMetricsForPost(
  postId: string,
  userId: string
): Promise<PostMetrics> {
  const post = await prisma.post.findFirst({
    where: { id: postId, userId },
  });
  if (!post || !post.results) return {};

  let parsed: Record<string, PostResultEntry>;
  try {
    parsed = JSON.parse(post.results) as Record<string, PostResultEntry>;
  } catch {
    return {};
  }

  const metrics: PostMetrics = {};
  for (const [platform, result] of Object.entries(parsed)) {
    if (!result?.id && !result?.url) continue;

    try {
      const m = await fetchSinglePlatform(userId, platform, result);
      if (m) metrics[platform] = m;
    } catch (err) {
      console.warn(`[insights] ${platform} metrics fetch failed for post ${postId}:`, err);
    }
  }
  return metrics;
}

async function fetchSinglePlatform(
  userId: string,
  platform: string,
  result: PostResultEntry
): Promise<PlatformMetrics | null> {
  switch (platform) {
    case "youtube":
      return fetchYouTubeMetrics(userId, result);
    case "instagram":
      return fetchInstagramMetrics(userId, result);
    default:
      return null;
  }
}

async function fetchYouTubeMetrics(
  userId: string,
  result: PostResultEntry
): Promise<PlatformMetrics | null> {
  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId, platform: "youtube" } },
  });
  if (!account) return null;

  const fresh = await ensureFreshToken(account);
  // result.id is the YouTube video ID
  const vid = result.id;
  if (!vid) return null;

  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(vid)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${fresh.accessToken}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    items?: Array<{
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>;
  };
  const stats = data.items?.[0]?.statistics;
  if (!stats) return null;

  return {
    views: stats.viewCount ? parseInt(stats.viewCount, 10) : undefined,
    likes: stats.likeCount ? parseInt(stats.likeCount, 10) : undefined,
    comments: stats.commentCount ? parseInt(stats.commentCount, 10) : undefined,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchInstagramMetrics(
  userId: string,
  result: PostResultEntry
): Promise<PlatformMetrics | null> {
  const account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId, platform: "instagram" } },
  });
  if (!account) return null;

  const fresh = await ensureFreshToken(account);
  // result.id is the IG media ID
  const mediaId = result.id;
  if (!mediaId) return null;

  // Reels-compatible metrics (media_type=VIDEO uses these). The fields differ
  // from photo posts which use impressions/reach/engagement/saved.
  const metricsParam = "plays,likes,comments,shares,saved,reach";
  const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(mediaId)}/insights?metric=${metricsParam}&access_token=${encodeURIComponent(fresh.accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    // Some accounts (older / personal) don't allow insights — silently skip
    return null;
  }

  const data = (await res.json()) as {
    data?: Array<{ name: string; values?: Array<{ value: number }> }>;
  };

  const out: PlatformMetrics = { fetchedAt: new Date().toISOString() };
  for (const item of data.data ?? []) {
    const v = item.values?.[0]?.value;
    if (typeof v !== "number") continue;
    switch (item.name) {
      case "plays":
        out.views = v;
        break;
      case "likes":
        out.likes = v;
        break;
      case "comments":
        out.comments = v;
        break;
      case "shares":
        out.shares = v;
        break;
      case "saved":
        out.saves = v;
        break;
      case "reach":
        out.reach = v;
        break;
    }
  }
  return out;
}
