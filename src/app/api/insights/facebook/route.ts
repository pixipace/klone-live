import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get("facebook_account")?.value;
  if (!cookie) {
    return NextResponse.json({ connected: false });
  }

  try {
    const account = JSON.parse(cookie);
    const { pages, username } = account;

    if (!pages || pages.length === 0) {
      return NextResponse.json({
        connected: true,
        username,
        avatar: account.avatar,
        followers: 0,
        reach: 0,
        impressions: 0,
        profileViews: 0,
        totalPosts: 0,
        posts: [],
      });
    }

    const page = pages[0];
    const pageToken = page.access_token;
    const pageId = page.id;

    console.log("FB Insights: Using page", page.name, "id:", pageId);
    console.log("FB Insights: Page token exists:", !!pageToken);

    // Fetch page info
    let followers = 0;
    let pageName = page.name || username;
    let avatar = account.avatar;
    try {
      const url = `https://graph.facebook.com/v24.0/${pageId}?fields=name,fan_count,picture.type(large)&access_token=${pageToken}`;
      console.log("FB Insights: Fetching page info...");
      const pageInfoRes = await fetch(url);
      const pageInfo = await pageInfoRes.json();
      console.log("FB Insights: Page info response:", JSON.stringify(pageInfo).slice(0, 300));
      if (pageInfo.fan_count) followers = pageInfo.fan_count;
      if (pageInfo.name) pageName = pageInfo.name;
      if (pageInfo.picture?.data?.url) avatar = pageInfo.picture.data.url;
    } catch (err) {
      console.error("FB page info error:", err);
    }

    // Fetch page insights
    let reach = 0;
    let impressions = 0;
    let pageViews = 0;
    try {
      const url = `https://graph.facebook.com/v24.0/${pageId}/insights?metric=page_impressions,page_post_engagements,page_views_total&period=days_28&access_token=${pageToken}`;
      console.log("FB Insights: Fetching insights...");
      const insightsRes = await fetch(url);
      const insightsData = await insightsRes.json();
      console.log("FB Insights: Insights response:", JSON.stringify(insightsData).slice(0, 500));
      if (insightsData.data) {
        impressions = insightsData.data.find((m: { name: string }) => m.name === "page_impressions")?.values?.[0]?.value || 0;
        reach = insightsData.data.find((m: { name: string }) => m.name === "page_post_engagements")?.values?.[0]?.value || 0;
        pageViews = insightsData.data.find((m: { name: string }) => m.name === "page_views_total")?.values?.[0]?.value || 0;
      }
    } catch (err) {
      console.error("FB insights error:", err);
    }

    // Fetch recent posts — use page token with /feed endpoint
    const posts: unknown[] = [];
    try {
      const url = `https://graph.facebook.com/v24.0/${pageId}/feed?fields=id,message,full_picture,permalink_url,created_time,type,likes.summary(true),comments.summary(true),shares&limit=9&access_token=${pageToken}`;
      console.log("FB Insights: Fetching feed...");
      const feedRes = await fetch(url);
      const feedData = await feedRes.json();
      console.log("FB Insights: Feed response:", JSON.stringify(feedData).slice(0, 500));

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

      if (feedData.error) {
        console.error("FB Feed error:", feedData.error);
        // Try published_posts as fallback (requires pages_read_engagement)
        const url2 = `https://graph.facebook.com/v24.0/${pageId}/published_posts?fields=id,message,full_picture,permalink_url,created_time&limit=9&access_token=${pageToken}`;
        console.log("FB Insights: Trying published_posts...");
        const feedRes2 = await fetch(url2);
        const feedData2 = await feedRes2.json();
        console.log("FB Insights: published_posts response:", JSON.stringify(feedData2).slice(0, 500));
        if (feedData2.data) {
          for (const post of feedData2.data) {
            posts.push({
              id: post.id,
              caption: post.message || "(no caption)",
              mediaUrl: post.full_picture || null,
              mediaType: "IMAGE",
              permalink: post.permalink_url,
              likes: 0,
              comments: 0,
              reach: 0,
              postedAt: post.created_time
                ? new Date(post.created_time).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "Recently",
            });
          }
        }
      }
    } catch (err) {
      console.error("FB feed error:", err);
    }

    console.log("FB Insights: Final data — followers:", followers, "posts:", posts.length, "impressions:", impressions);

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
  } catch (err) {
    console.error("Facebook insights error:", err);
    return NextResponse.json({ connected: false });
  }
}
