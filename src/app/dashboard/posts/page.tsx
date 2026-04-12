import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, PenSquare } from "lucide-react";

export default function PostsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {["All", "Scheduled", "Published", "Draft"].map((filter) => (
            <button
              key={filter}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === "All"
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
        <Link href="/dashboard/create">
          <Button size="sm">
            <PenSquare className="w-4 h-4 mr-1" />
            New Post
          </Button>
        </Link>
      </div>

      <Card>
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium">No posts yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Create your first post to start publishing content to your social
            media accounts.
          </p>
          <Link href="/dashboard/create" className="inline-block mt-6">
            <Button>
              <PenSquare className="w-4 h-4 mr-2" />
              Create your first post
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
