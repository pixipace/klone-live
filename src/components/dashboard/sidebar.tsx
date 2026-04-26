"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  PenSquare,
  Scissors,
  Calendar,
  Users,
  Settings,
  LogOut,
  BarChart3,
  MessageCircle,
  X,
} from "lucide-react";

type BadgeKey = "failedPosts" | "runningClips" | "scheduledPosts";
type NavBadge = {
  key: BadgeKey;
  /** "warning" pulses red (needs attention), "info" is neutral. */
  variant: "warning" | "info";
};

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Which badge value to render at the right side of this nav item. */
  badge?: NavBadge;
}> = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/create", label: "New post", icon: PenSquare },
  {
    href: "/dashboard/clips",
    label: "Clip Studio",
    icon: Scissors,
    badge: { key: "runningClips", variant: "info" },
  },
  {
    href: "/dashboard/posts",
    label: "My posts",
    icon: Calendar,
    badge: { key: "failedPosts", variant: "warning" },
  },
  { href: "/dashboard/insights", label: "Stats", icon: BarChart3 },
  { href: "/dashboard/comments", label: "Comments", icon: MessageCircle },
  { href: "/dashboard/accounts", label: "Connected apps", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [counts, setCounts] = useState<Record<BadgeKey, number>>({
    failedPosts: 0,
    runningClips: 0,
    scheduledPosts: 0,
  });

  // Poll counts on mount + every 30s + after route change. Lightweight
  // query (3 prisma counts) so this is cheap even on slow connections.
  useEffect(() => {
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const res = await fetch("/api/dashboard/counts");
        if (!res.ok) return;
        const data = (await res.json()) as Record<BadgeKey, number>;
        if (!cancelled) setCounts(data);
      } catch {
        // ignore — badge stays stale
      }
    };
    fetchCounts();
    const t = setInterval(fetchCounts, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pathname]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 bottom-0 w-[260px] md:w-[220px] bg-surface/95 backdrop-blur-xl border-r border-border/50 flex flex-col z-50 transition-transform duration-200 ease-out",
        // Mobile: hidden by default, slide in when open
        open ? "translate-x-0" : "-translate-x-full",
        // Desktop: always visible
        "md:translate-x-0"
      )}
    >
      {/* Logo + close button */}
      <div className="px-5 h-16 flex items-center justify-between gap-2.5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="relative">
            <div className="absolute inset-0 bg-accent/20 blur-lg rounded-full" />
            <Image
              src="/logo-icon.png"
              alt="Klone"
              width={26}
              height={26}
              className="relative"
            />
          </div>
          <span className="text-base font-semibold tracking-tight">KLONE</span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-2 -mr-2 text-muted-foreground hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 pt-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item, i) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                // Min 44px tall for touch targets on mobile
                "group relative flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-sm md:text-[13px] font-medium transition-all duration-200 animate-fade-up",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground active:bg-card/40"
              )}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {isActive && (
                <div className="absolute inset-0 rounded-lg bg-accent/8 border border-accent/10" />
              )}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-accent rounded-full" />
              )}
              <item.icon
                className={cn(
                  "w-5 h-5 md:w-4 md:h-4 relative z-10 transition-colors",
                  isActive ? "text-accent" : "group-hover:text-foreground"
                )}
              />
              <span className="relative z-10">{item.label}</span>
              {item.badge && counts[item.badge.key] > 0 && (
                <span
                  className={cn(
                    "ml-auto relative z-10 text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none",
                    item.badge.variant === "warning"
                      ? "bg-error/15 text-error"
                      : "bg-accent/15 text-accent"
                  )}
                >
                  {counts[item.badge.key]}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <div className="h-px bg-border/50 mb-3" />
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-sm md:text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <LogOut className="w-5 h-5 md:w-4 md:h-4" />
          Log out
        </button>
      </div>
    </aside>
  );
}
