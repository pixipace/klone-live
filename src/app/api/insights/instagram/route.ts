import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get("instagram_account")?.value;
  if (!cookie) {
    return NextResponse.json({ connected: false });
  }

  try {
    const account = JSON.parse(cookie);
    const { accessToken, instagramId, username, avatar } = account;

    if (!instagramId) {
      return NextResponse.json({
        connected: true,
        username,
        avatar,
        followers: account.followers || 0,
        reach: 0,
        impressions: 0,
        profileViews: 0,
        totalPosts: 0,
        posts: [],
      });
    }

    // Fetch latest account info (including avatar + follower count + media count)
    let followers = account.followers || 0;
    let totalPosts = 0;
    let profilePicture = avatar;
    try {
      const accountRes = await fetch(
        `https://graph.facebook.com/v24.0/${instagramId}?fields=username,profile_picture_url,followers_count,media_count&access_token=${accessToken}`
      );
      const accountInfo = await accountRes.json();
      if (accountInfo.followers_count !== undefined) followers = accountInfo.followers_count;
      if (accountInfo.media_count !== undefined) totalPosts = accountInfo.media_count;
      if (accountInfo.profile_picture_url) profilePicture = accountInfo.profile_picture_url;
    } catch {
      // Skip if account info fetch fails
    }

    // Insights
    let reach = 0;
    let impressions = 0;
    let profileViews = 0;
    try {
      const insightsUrl = `https://graph.facebook.com/v24.0/${instagramId}/insights?metric=reach,impressions,profile_views&period=days_28&access_token=${accessToken}`;
      const insightsRes = await fetch(insightsUrl);
      const insightsData = await insightsRes.json();

      reach = insightsData.data?.find((m: { name: string }) => m.name === "reach")?.values?.[0]?.value || 0;
      impressions = insightsData.data?.find((m: { name: string }) => m.name === "impressions")?.values?.[0]?.value || 0;
      profileViews = insightsData.data?.find((m: { name: string }) => m.name === "profile_views")?.values?.[0]?.value || 0;
    } catch {
      // Skip if insights fail
    }

    // Fetch recent media with thumbnails
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
  } catch (err) {
    console.error("Instagram insights error:", err);
    return NextResponse.json({ connected: false });
  }
}
