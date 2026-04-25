"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/create": "New post",
  "/dashboard/clips": "Clip Studio",
  "/dashboard/posts": "My posts",
  "/dashboard/accounts": "Connected apps",
  "/dashboard/insights": "Stats",
  "/dashboard/comments": "Comments",
  "/dashboard/settings": "Settings",
};

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  // Find best match (longest prefix wins)
  const title =
    Object.keys(pageTitles)
      .sort((a, b) => b.length - a.length)
      .find((p) => pathname === p || pathname.startsWith(p + "/"))
      ?.split("/")
      .pop() || "Dashboard";
  const titleLabel = pageTitles[`/dashboard/${title}`] || pageTitles["/dashboard"] || "Dashboard";

  return (
    <header className="h-14 sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-foreground hover:text-accent transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-medium text-muted-foreground">
          {titleLabel}
        </h1>
      </div>
      <Link
        href="/dashboard/settings"
        className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-white text-xs font-semibold hover:opacity-80 transition-opacity"
        aria-label="Settings"
      >
        K
      </Link>
    </header>
  );
}
