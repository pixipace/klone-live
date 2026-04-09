"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLATFORMS } from "@/lib/constants";
import { ExternalLink, Unplug, CheckCircle2 } from "lucide-react";

const oauthUrls: Record<string, string> = {
  tiktok: "/api/auth/tiktok",
  twitter: "#",
  linkedin: "#",
  instagram: "#",
  facebook: "#",
  youtube: "#",
};

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
      <AccountsContent />
    </Suspense>
  );
}

function AccountsContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  return (
    <div className="space-y-6">
      {connected && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
          <CheckCircle2 className="w-4 h-4" />
          Successfully connected {connected}!
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
        {PLATFORMS.map((platform) => {
          const isConnected = connected === platform.id;
          const hasOAuth = oauthUrls[platform.id] !== "#";

          return (
            <Card
              key={platform.id}
              className={`flex items-center justify-between ${
                isConnected ? "border-success/20" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                  style={{ backgroundColor: platform.color }}
                >
                  {platform.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {platform.name}
                    </span>
                    {isConnected && (
                      <Badge variant="success">Connected</Badge>
                    )}
                  </div>
                  {isConnected ? (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Account connected successfully
                    </div>
                  ) : (
                    <p className="text-xs text-muted mt-0.5">
                      {hasOAuth ? "Click to connect" : "Coming soon"}
                    </p>
                  )}
                </div>
              </div>

              {isConnected ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button variant="danger" size="sm">
                    <Unplug className="w-4 h-4 mr-1" />
                    Disconnect
                  </Button>
                </div>
              ) : (
                <a href={oauthUrls[platform.id]}>
                  <Button
                    variant={hasOAuth ? "outline" : "secondary"}
                    size="sm"
                    disabled={!hasOAuth}
                  >
                    {hasOAuth ? "Connect" : "Soon"}
                  </Button>
                </a>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
