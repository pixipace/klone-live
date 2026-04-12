import Link from "next/link";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Send,
  Users,
  PenSquare,
  PlusCircle,
} from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard title="Scheduled Posts" value={0} icon={Calendar} />
        <StatsCard title="Posts Published" value={0} icon={Send} />
        <StatsCard title="Connected Accounts" value={0} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardTitle className="mb-4">Get Started</CardTitle>
          <div className="space-y-3">
            <Link
              href="/dashboard/accounts"
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <PlusCircle className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Connect a social account</p>
                <p className="text-xs text-muted">
                  Link your TikTok, X, or LinkedIn to start posting
                </p>
              </div>
            </Link>

            <Link
              href="/dashboard/create"
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <PenSquare className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Create your first post</p>
                <p className="text-xs text-muted">
                  Upload a video and publish to your accounts
                </p>
              </div>
            </Link>
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-4">Recent Activity</CardTitle>
          <div className="text-center py-8">
            <Calendar className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No posts yet
            </p>
            <p className="text-xs text-muted mt-1">
              Your published posts will appear here
            </p>
            <Link href="/dashboard/create" className="inline-block mt-4">
              <Button size="sm">Create your first post</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
