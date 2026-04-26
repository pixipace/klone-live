import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
import {
  LayoutDashboard,
  Users,
  Activity,
  Server,
  ArrowLeft,
  Cog,
  ScrollText,
} from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  if (!session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-xs font-semibold text-error uppercase tracking-wider">
              Owner
            </span>
            <nav className="flex items-center gap-1">
              <NavLink href="/control-room" icon={LayoutDashboard} label="Overview" />
              <NavLink href="/control-room/users" icon={Users} label="Users" />
              <NavLink href="/control-room/activity" icon={Activity} label="Activity" />
              <NavLink href="/control-room/system" icon={Server} label="System" />
              <NavLink href="/control-room/audit" icon={ScrollText} label="Audit log" />
              <NavLink href="/control-room/settings" icon={Cog} label="Settings" />
            </nav>
          </div>
          <Link
            href="/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to app
          </Link>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </Link>
  );
}
