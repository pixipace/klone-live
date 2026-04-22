"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  Unplug,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  Camera,
} from "lucide-react";

interface MetaPage {
  id: string;
  name: string;
}

interface MetaIgAccount {
  instagramId: string;
  pageId: string;
  pageName: string;
  username: string;
  avatar: string;
  followers: number;
}

interface AccountStatus {
  connected: boolean;
  username?: string;
  avatar?: string;
  followers?: number;
  pages?: MetaPage[];
  pageCount?: number;
  accounts?: MetaIgAccount[];
  accountCount?: number;
}

interface CombinedStatus {
  connected: boolean;
  username?: string;
  avatar?: string;
  followers?: number;
  fbPages?: MetaPage[];
  igAccounts?: MetaIgAccount[];
  selectedPageId?: string | null;
  selectedInstagramId?: string | null;
}

interface PlatformCard {
  id: string;
  name: string;
  color: string;
  oauth: string | null;
  description: string;
}

const PLATFORM_CARDS: PlatformCard[] = [
  {
    id: "tiktok",
    name: "TikTok",
    color: "#00f2ea",
    oauth: "/api/auth/tiktok",
    description: "Post videos to your TikTok account",
  },
  {
    id: "meta",
    name: "Facebook & Instagram",
    color: "#1877f2",
    oauth: "/api/auth/facebook",
    description: "Connect Facebook Pages and Instagram Business accounts",
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    color: "#000000",
    oauth: null,
    description: "Coming soon",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0077b5",
    oauth: "/api/auth/linkedin",
    description: "Post to your LinkedIn profile and company pages",
  },
  {
    id: "youtube",
    name: "YouTube",
    color: "#ff0000",
    oauth: "/api/auth/google",
    description: "Upload Shorts and videos to your YouTube channel",
  },
];

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
      <AccountsContent />
    </Suspense>
  );
}

function AccountsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");
  const justConnected = searchParams.get("connected");
  const [tiktokStatus, setTiktokStatus] = useState<AccountStatus>({
    connected: false,
  });
  const [metaStatus, setMetaStatus] = useState<CombinedStatus>({
    connected: false,
  });
  const [youtubeStatus, setYoutubeStatus] = useState<AccountStatus>({
    connected: false,
  });
  const [linkedinStatus, setLinkedinStatus] = useState<AccountStatus>({
    connected: false,
  });
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [selecting, setSelecting] = useState(false);

  const handleSelect = async (
    platform: "facebook" | "instagram",
    selection: { pageId?: string; instagramId?: string }
  ) => {
    setSelecting(true);
    try {
      await fetch("/api/accounts/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, selection }),
      });
      await fetchStatuses();
    } finally {
      setSelecting(false);
    }
  };

  const fetchStatuses = useCallback(async () => {
    setLoading(true);
    try {
      const [ttRes, fbRes, igRes, ytRes, liRes] = await Promise.all([
        fetch("/api/accounts/tiktok").then((r) => r.json()),
        fetch("/api/accounts/facebook").then((r) => r.json()),
        fetch("/api/accounts/instagram").then((r) => r.json()),
        fetch("/api/accounts/youtube").then((r) => r.json()),
        fetch("/api/accounts/linkedin").then((r) => r.json()),
      ]);

      setTiktokStatus(ttRes);
      setYoutubeStatus(ytRes);
      setLinkedinStatus(liRes);

      if (fbRes.connected || igRes.connected) {
        setMetaStatus({
          connected: true,
          username: fbRes.username || igRes.username,
          avatar: fbRes.avatar || igRes.avatar,
          followers: igRes.followers,
          fbPages: fbRes.pages || [],
          igAccounts: igRes.accounts || [],
          selectedPageId: fbRes.selectedPageId ?? null,
          selectedInstagramId: igRes.selectedInstagramId ?? null,
        });
      } else {
        setMetaStatus({ connected: false });
      }
    } catch {
      setTiktokStatus({ connected: false });
      setMetaStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const handleDisconnect = async (cardId: string) => {
    setDisconnecting(cardId);
    try {
      if (cardId === "tiktok") {
        await fetch("/api/accounts/tiktok", { method: "DELETE" });
        setTiktokStatus({ connected: false });
      } else if (cardId === "meta") {
        await Promise.all([
          fetch("/api/accounts/facebook", { method: "DELETE" }),
          fetch("/api/accounts/instagram", { method: "DELETE" }),
        ]);
        setMetaStatus({ connected: false });
      } else if (cardId === "youtube") {
        await fetch("/api/accounts/youtube", { method: "DELETE" });
        setYoutubeStatus({ connected: false });
      } else if (cardId === "linkedin") {
        await fetch("/api/accounts/linkedin", { method: "DELETE" });
        setLinkedinStatus({ connected: false });
      }
      router.replace("/dashboard/accounts");
    } finally {
      setDisconnecting(null);
    }
  };

  const getStatus = (cardId: string): AccountStatus | CombinedStatus => {
    if (cardId === "tiktok") return tiktokStatus;
    if (cardId === "meta") return metaStatus;
    if (cardId === "youtube") return youtubeStatus;
    if (cardId === "linkedin") return linkedinStatus;
    return { connected: false };
  };

  return (
    <div className="space-y-6">
      {justConnected && getStatus(justConnected).connected && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
          <CheckCircle2 className="w-4 h-4" />
          Successfully connected{" "}
          {PLATFORM_CARDS.find((c) => c.id === justConnected)?.name}!
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
          Connection failed: {error}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Connect your social media accounts to start posting. Your credentials
        are encrypted and stored securely.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLATFORM_CARDS.map((card) => {
          const status = getStatus(card.id);
          const isConnected = status?.connected || false;
          const isMeta = card.id === "meta";
          const metaTotal =
            isMeta && "fbPages" in status
              ? (status.fbPages?.length || 0) + (status.igAccounts?.length || 0)
              : 0;

          return (
            <Card
              key={card.id}
              className={`${isConnected ? "border-success/20" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0"
                    style={{ backgroundColor: card.color }}
                  >
                    {card.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{card.name}</span>
                      {isConnected && <Badge variant="success">Connected</Badge>}
                    </div>
                    {isConnected && status?.username ? (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {status.username}
                        {isMeta && metaTotal > 0 && (
                          <> &middot; {metaTotal} linked asset{metaTotal > 1 ? "s" : ""}</>
                        )}
                        {!isMeta &&
                          "followers" in status &&
                          typeof status.followers === "number" &&
                          status.followers > 0 && (
                            <> &middot; {status.followers} followers</>
                          )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted mt-0.5">
                        {card.oauth
                          ? loading
                            ? "Checking..."
                            : card.description
                          : card.description}
                      </p>
                    )}
                  </div>
                </div>

                {isConnected ? (
                  <div className="flex gap-2 shrink-0">
                    {isMeta && metaTotal > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMetaExpanded(!metaExpanded)}
                      >
                        {metaExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDisconnect(card.id)}
                      disabled={disconnecting === card.id}
                    >
                      {disconnecting === card.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Unplug className="w-4 h-4 mr-1" />
                          Disconnect
                        </>
                      )}
                    </Button>
                  </div>
                ) : card.oauth ? (
                  <a
                    href={card.oauth}
                    className="shrink-0 inline-flex items-center justify-center text-sm px-4 py-2 font-medium rounded-lg border border-border hover:border-border-hover text-foreground bg-transparent transition-colors cursor-pointer"
                  >
                    Connect
                  </a>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled
                    className="shrink-0"
                  >
                    Soon
                  </Button>
                )}
              </div>

              {/* Expanded Meta asset list */}
              {isMeta &&
                metaExpanded &&
                isConnected &&
                "fbPages" in status && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    {(status.fbPages?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Facebook Page to post to
                        </p>
                        <div className="space-y-1.5">
                          {status.fbPages?.map((page) => {
                            const isSelected = status.selectedPageId === page.id;
                            return (
                              <label
                                key={page.id}
                                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-card/50 rounded px-1 py-0.5"
                              >
                                <input
                                  type="radio"
                                  name="fb-page"
                                  checked={isSelected}
                                  disabled={selecting}
                                  onChange={() =>
                                    handleSelect("facebook", { pageId: page.id })
                                  }
                                  className="accent-accent"
                                />
                                <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
                                <span className="truncate">{page.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(status.igAccounts?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Instagram account to post to
                        </p>
                        <div className="space-y-1.5">
                          {status.igAccounts?.map((ig) => {
                            const isSelected =
                              status.selectedInstagramId === ig.instagramId;
                            return (
                              <label
                                key={ig.instagramId}
                                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-card/50 rounded px-1 py-0.5"
                              >
                                <input
                                  type="radio"
                                  name="ig-account"
                                  checked={isSelected}
                                  disabled={selecting}
                                  onChange={() =>
                                    handleSelect("instagram", {
                                      instagramId: ig.instagramId,
                                    })
                                  }
                                  className="accent-accent"
                                />
                                <Camera className="w-3.5 h-3.5 text-accent shrink-0" />
                                <span className="truncate">
                                  @{ig.username}
                                  {ig.followers > 0 && (
                                    <span className="text-muted-foreground ml-1">
                                      ({ig.followers} followers)
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
