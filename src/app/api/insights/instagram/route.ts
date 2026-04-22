import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureFreshToken } from "@/lib/platforms/refresh";

type IgMeta = {
  accounts?: Array<{ instagramId: string }>;
  selectedInstagramId?: string;
  followers?: number;
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });

  let account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform: "instagram" } },
  });
  if (!account) return NextResponse.json({ connected: false });

  account = await ensureFreshToken(account);

  let meta: IgMeta = {};
  try {
    if (account.meta) meta = JSON.parse(account.meta);
  } catch {
    // ignore
  }

  const accessToken = account.accessToken;
  const instagramId =
    meta.selectedInstagramId ?? account.externalId ?? meta.accounts?.[0]?.instagramId;
  const username = account.username ?? "";

  if (!instagramId) {
    return NextResponse.json({
      connected: true,
      username,
      avatar: account.avatar,
      followers: meta.followers ?? 0,
      reach: 0,
      impressions: 0,
      profileViews: 0,
      totalPosts: 0,
      posts: [],
    });
  }

  let followers = meta.followers ?? 0;
  let totalPosts = 0;
  let profilePicture = account.avatar ?? "";
  try {
    const accountRes = await fetch(
      `https://graph.facebook.com/v24.0/${instagramId}?fields=username,profile_picture_url,followers_count,media_count&access_token=${accessToken}`
    );
    const accountInfo = await accountRes.json();
    if (accountInfo.followers_count !== undefined) followers = accountInfo.followers_count;
    if (accountInfo.media_count !== undefined) totalPosts = accountInfo.media_count;
    if (accountInfo.profile_picture_url) profilePicture = accountInfo.profile_picture_url;
  } catch {
    // ignore
  }

  let reach = 0;
  let impressions = 0;
  let profileViews = 0;
  try {
    const insightsUrl = `https://graph.facebook.com/v24.0/${instagramId}/insights?metric=reach,impressions,profile_views&period=days_28&access_token=${accessToken}`;
    const insightsRes = await fetch(insightsUrl);
    const insightsData = await insightsRes.json();
    reach =
      insightsData.data?.find((m: { name: string }) => m.name === "reach")?.values?.[0]?.value || 0;
    impressions =
      insightsData.data?.find((m: { name: string }) => m.name === "impressions")?.values?.[0]?.value || 0;
    profileViews =
      insightsData.data?.find((m: { name: string }) => m.name === "profile_views")?.values?.[0]?.value || 0;
  } catch {
    // ignore
  }

  const mediaUrl = `https://graph.facebook.com/v24.0/${instagramId}/media?fields=id,caption,media_url,thumbnail_url,media_type,permalink,like_count,comments_count,timestamp&limit=9&access_token=${accessToken}`;
  const mediaRes = await fetch(mediaUrl);
  const mediaData = await mediaRes.json();

  const posts = (mediaData.data || []).map(
    (m: {
      id: string;
      caption?: string;
      media_url?: string;
      thumbnail_url?: string;
      media_type?: string;
      permalink?: string;
      like_count?: number;
      comments_count?: number;
      timestamp?: string;
    }) => ({
      id: m.id,
      caption: m.caption || "(no caption)",
      mediaUrl: m.media_type === "VIDEO" ? m.thumbnail_url || m.media_url : m.media_url,
      mediaType: m.media_type,
      permalink: m.permalink,
      likes: m.like_count || 0,
      comments: m.comments_count || 0,
      reach: 0,
      postedAt: m.timestamp
        ? new Date(m.timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })
        : "Recently",
    })
  );

  return NextResponse.json({
    connected: true,
    username,
    avatar: profilePicture,
    followers,
    reach,
    impressions,
    profileViews,
    totalPosts,
    posts,
  });
}
