import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ensureFreshToken } from "@/lib/platforms/refresh";

type FacebookMeta = {
  pages?: Array<{ id: string; name: string; access_token: string }>;
  selectedPageId?: string;
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });

  let account = await prisma.socialAccount.findUnique({
    where: { userId_platform: { userId: session.id, platform: "facebook" } },
  });
  if (!account) return NextResponse.json({ connected: false });

  account = await ensureFreshToken(account);

  let meta: FacebookMeta = {};
  try {
    if (account.meta) meta = JSON.parse(account.meta);
  } catch {
    // ignore
  }

  const pages = meta.pages ?? [];
  if (pages.length === 0) {
    return NextResponse.json({
      connected: true,
      username: account.username,
      avatar: account.avatar,
      followers: 0,
      reach: 0,
      impressions: 0,
      profileViews: 0,
      totalPosts: 0,
      posts: [],
    });
  }

  const page = meta.selectedPageId
    ? pages.find((p) => p.id === meta.selectedPageId) ?? pages[0]
    : pages[0];
  const pageToken = page.access_token;
  const pageId = page.id;

  let followers = 0;
  let pageName = page.name || account.username || "";
  let avatar = account.avatar ?? "";
  try {
    const url = `https://graph.facebook.com/v24.0/${pageId}?fields=name,fan_count,picture.type(large)&access_token=${pageToken}`;
    const pageInfoRes = await fetch(url);
    const pageInfo = await pageInfoRes.json();
    if (pageInfo.fan_count) followers = pageInfo.fan_count;
    if (pageInfo.name) pageName = pageInfo.name;
    if (pageInfo.picture?.data?.url) avatar = pageInfo.picture.data.url;
  } catch (err) {
    console.error("FB page info error:", err);
  }

  let reach = 0;
  let impressions = 0;
  let pageViews = 0;
  try {
    const url = `https://graph.facebook.com/v24.0/${pageId}/insights?metric=page_impressions,page_post_engagements,page_views_total&period=days_28&access_token=${pageToken}`;
    const insightsRes = await fetch(url);
    const insightsData = await insightsRes.json();
    if (insightsData.data) {
      impressions =
        insightsData.data.find((m: { name: string }) => m.name === "page_impressions")
          ?.values?.[0]?.value || 0;
      reach =
        insightsData.data.find((m: { name: string }) => m.name === "page_post_engagements")
          ?.values?.[0]?.value || 0;
      pageViews =
        insightsData.data.find((m: { name: string }) => m.name === "page_views_total")
          ?.values?.[0]?.value || 0;
    }
  } catch (err) {
    console.error("FB insights error:", err);
  }

  const posts: unknown[] = [];
  try {
    const url = `https://graph.facebook.com/v24.0/${pageId}/feed?fields=id,message,full_picture,permalink_url,created_time,type,likes.summary(true),comments.summary(true),shares&limit=9&access_token=${pageToken}`;
    const feedRes = await fetch(url);
    const feedData = await feedRes.json();

    if (feedData.data) {
      for (const post of feedData.data) {
        posts.push({
          id: post.id,
          caption: post.message || "(no caption)",
          mediaUrl: post.full_picture || null,
          mediaType: post.type === "video" ? "VIDEO" : "IMAGE",
          permalink: post.permalink_url,
          likes: post.likes?.summary?.total_count || 0,
          comments: post.comments?.summary?.total_count || 0,
          reach: post.shares?.count || 0,
          postedAt: post.created_time
            ? new Date(post.created_time).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : "Recently",
        });
      }
    }
  } catch (err) {
    console.error("FB feed error:", err);
  }

  return NextResponse.json({
    connected: true,
    username: pageName,
    avatar,
    followers,
    reach,
    impressions,
    profileViews: pageViews,
    totalPosts: posts.length,
    posts,
  });
}
