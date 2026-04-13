"use client";

import { usePathname } from "next/navigation";
import { Command } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/create": "Create Post",
  "/dashboard/posts": "Posts",
  "/dashboard/accounts": "Accounts",
  "/dashboard/insights": "Insights",
  "/dashboard/comments": "Comments",
  "/dashboard/settings": "Settings",
};

export function Topbar() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Dashboard";

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border/40">
      <h1 className="text-sm font-medium text-muted-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/50 border border-border/50 text-xs text-muted hover:text-muted-foreground hover:border-border transition-colors">
          <Command className="w-3 h-3" />
          <span>Search</span>
          <kbd className="text-[10px] bg-background/50 px-1.5 py-0.5 rounded font-mono text-muted">
            /
          </kbd>
        </button>
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-white text-[11px] font-semibold">
          K
        </div>
      </div>
    </header>
  );
}
