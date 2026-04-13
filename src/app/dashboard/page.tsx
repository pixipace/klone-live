import Link from "next/link";
import {
  PenSquare,
  ArrowRight,
  Zap,
  Calendar,
  Users,
  Send,
} from "lucide-react";

const platforms = [
  { name: "TikTok", color: "#00f2ea", letter: "T" },
  { name: "Instagram", color: "#e4405f", letter: "I" },
  { name: "Facebook", color: "#1877f2", letter: "f" },
  { name: "YouTube", color: "#ff0000", letter: "Y" },
  { name: "LinkedIn", color: "#0077b5", letter: "in" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8 animate-fade-up">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Welcome to Klone
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Publish content across all your social platforms from one place.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Scheduled", value: "0", icon: Calendar },
          { label: "Published", value: "0", icon: Send },
          { label: "Connected", value: "0", icon: Users },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className={`relative group rounded-xl bg-card border border-border/60 p-5 animate-fade-up delay-${i + 1} card-glow`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
                <p className="text-3xl font-light mt-2 tracking-tight">
                  {stat.value}
                </p>
              </div>
              <stat.icon className="w-5 h-5 text-muted/40" />
            </div>
          </div>
        ))}
      </div>

      {/* Connected platforms strip */}
      <div className="animate-fade-up delay-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Platforms
          </span>
        </div>
        <div className="flex gap-2">
          {platforms.map((p) => (
            <Link
              key={p.name}
              href="/dashboard/accounts"
              className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/60 hover:border-border-hover transition-all"
            >
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: p.color }}
              >
                {p.letter}
              </div>
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                {p.name}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up delay-5">
        <Link
          href="/dashboard/create"
          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-accent/10 via-card to-card border border-accent/20 p-6 hover:border-accent/40 transition-all"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center mb-4">
              <PenSquare className="w-5 h-5 text-accent" />
            </div>
            <h3 className="text-base font-medium">Create a post</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upload media and publish to all your platforms at once.
            </p>
            <div className="flex items-center gap-1 mt-4 text-xs text-accent font-medium">
              Start creating
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/accounts"
          className="group relative overflow-hidden rounded-xl bg-card border border-border/60 p-6 hover:border-border-hover transition-all card-glow"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-card-hover flex items-center justify-center mb-4">
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium">Connect accounts</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Link your TikTok, Instagram, YouTube, LinkedIn, or Facebook.
            </p>
            <div className="flex items-center gap-1 mt-4 text-xs text-muted-foreground font-medium group-hover:text-foreground transition-colors">
              Manage accounts
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
