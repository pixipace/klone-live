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
    <header className="h-14 sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-foreground hover:text-muted-foreground transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-medium text-foreground tracking-tight">
          {titleLabel}
        </h1>
      </div>
      {/* Avatar — flat black circle, EL-style. No gradients. */}
      <Link
        href="/dashboard/settings"
        className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center text-background text-xs font-semibold hover:bg-foreground-secondary transition-colors"
        aria-label="Settings"
      >
        K
      </Link>
    </header>
  );
}
