"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/dashboard/stats-card";
import {
  Eye,
  Heart,
  Users,
  TrendingUp,
  BarChart3,
  Loader2,
  MessageCircle,
  ImageIcon,
} from "lucide-react";

interface Post {
  id: string;
  caption: string;
  mediaUrl?: string;
  mediaType?: string;
  likes: number;
  comments: number;
  reach: number;
  postedAt: string;
  permalink?: string;
}

interface InsightsData {
  connected: boolean;
  username?: string;
  avatar?: string;
  followers?: number;
  reach?: number;
  impressions?: number;
  profileViews?: number;
  totalPosts?: number;
  posts?: Post[];
}

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InsightsData>({ connected: false });
  const [platform, setPlatform] = useState<"instagram" | "facebook">(
    "instagram"
  );

  useEffect(() => {
    const fetchInsights = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/insights/${platform}`);
        const json = await res.json();
        setData(json);
      } catch {
        setData({ connected: false });
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, [platform]);

  const totalEngagement = data.posts?.reduce(
    (sum, p) => sum + p.likes + p.comments,
    0
  );

  return (
    <div className="space-y-6">
      {/* Platform switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPlatform("instagram")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            platform === "instagram"
              ? "bg-accent/10 text-accent border border-accent/20"
              : "text-muted-foreground hover:text-foreground border border-border"
          }`}
        >
          Instagram
        </button>
        <button
          onClick={() => setPlatform("facebook")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            platform === "facebook"
              ? "bg-accent/10 text-accent border border-accent/20"
              : "text-muted-foreground hover:text-foreground border border-border"
          }`}
        >
          Facebook
        </button>
      </div>

      {loading ? (
        <Card>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
        </Card>
      ) : !data.connected ? (
        <Card>
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium">
              Connect your {platform} account
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Visit the Accounts page to connect your {platform} account and
              view insights.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Account header */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                {data.avatar ? (
                  <div className="relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-accent/20">
                    <Image
                      src={data.avatar}
                      alt={data.username || "profile"}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-lg">
                    {data.username?.charAt(0).toUpperCase() || "?"}
                  </div>
                )}
                <div>
                  <CardTitle className="text-xl">@{data.username}</CardTitle>
                  <CardDescription className="mt-1">
                    Insights for the last 30 days
                  </CardDescription>
                </div>
              </div>
              <Badge variant="accent">Live Data</Badge>
            </div>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Followers"
              value={data.followers?.toLocaleString() || "0"}
              icon={Users}
            />
            <StatsCard
              title="Reach"
              value={data.reach?.toLocaleString() || "0"}
              change="Last 30 days"
              icon={Eye}
            />
            <StatsCard
              title="Impressions"
              value={data.impressions?.toLocaleString() || "0"}
              change="Last 30 days"
              icon={TrendingUp}
            />
            <StatsCard
              title="Engagement"
              value={totalEngagement?.toLocaleString() || "0"}
              change="Likes + comments"
              icon={Heart}
            />
          </div>

          {/* Recent Posts Performance - Grid layout with thumbnails */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <CardTitle>Recent Posts</CardTitle>
              {data.posts && data.posts.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Showing {data.posts.length} most recent
                </span>
              )}
            </div>
            {!data.posts || data.posts.length === 0 ? (
              <div className="text-center py-12">
                <ImageIcon className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No posts to show yet
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.posts.map((post) => (
                  <div
                    key={post.id}
                    className="group relative border border-border rounded-xl overflow-hidden hover:border-accent/30 transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-card-hover relative overflow-hidden">
                      {post.mediaUrl ? (
                        <Image
                          src={post.mediaUrl}
                          alt={post.caption}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-10 h-10 text-muted" />
                        </div>
                      )}
                      {post.mediaType === "VIDEO" && (
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded px-2 py-0.5 text-[10px] text-white font-medium">
                          VIDEO
                        </div>
                      )}
                    </div>

                    {/* Caption + stats */}
                    <div className="p-3">
                      <p className="text-xs text-foreground line-clamp-2 h-8">
                        {post.caption === "(no caption)" ? (
                          <span className="text-muted italic">No caption</span>
                        ) : (
                          post.caption
                        )}
                      </p>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" />
                            {post.likes}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {post.comments}
                          </span>
                          {post.reach > 0 && (
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {post.reach}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted">
                          {post.postedAt}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
