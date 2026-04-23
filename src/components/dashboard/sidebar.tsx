"use client";

import Link from "next/link";
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
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/create", label: "Create", icon: PenSquare },
  { href: "/dashboard/clips", label: "Clip Studio", icon: Scissors },
  { href: "/dashboard/posts", label: "Posts", icon: Calendar },
  { href: "/dashboard/insights", label: "Insights", icon: BarChart3 },
  { href: "/dashboard/comments", label: "Comments", icon: MessageCircle },
  { href: "/dashboard/accounts", label: "Accounts", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-surface/50 backdrop-blur-xl border-r border-border/50 flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 h-16 flex items-center gap-2.5">
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
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-2 space-y-0.5">
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
                "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 animate-fade-up",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute inset-0 rounded-lg bg-accent/8 border border-accent/10" />
              )}
              {/* Active glow dot */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-accent rounded-full" />
              )}
              <item.icon
                className={cn(
                  "w-4 h-4 relative z-10 transition-colors",
                  isActive ? "text-accent" : "group-hover:text-foreground"
                )}
              />
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4">
        <div className="h-px bg-border/50 mb-3" />
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </aside>
  );
}
