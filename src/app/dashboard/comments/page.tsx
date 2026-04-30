"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  MessageCircle,
  Reply,
  Send,
  Loader2,
  Heart,
} from "lucide-react";

interface Comment {
  id: string;
  username: string;
  avatar?: string;
  text: string;
  timestamp: string;
  likes: number;
  postCaption: string;
  replied?: boolean;
}

interface CommentsData {
  connected: boolean;
  comments: Comment[];
}

export default function CommentsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CommentsData>({
    connected: false,
    comments: [],
  });
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/comments/instagram");
      const json = await res.json();
      setData(json);
    } catch {
      setData({ connected: false, comments: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, []);

  const handleReply = async (commentId: string) => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      await fetch("/api/comments/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, text: replyText }),
      });
      setData((prev) => ({
        ...prev,
        comments: prev.comments.map((c) =>
          c.id === commentId ? { ...c, replied: true } : c
        ),
      }));
      setReplyText("");
      setReplyingTo(null);
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Manage and reply to comments on your Instagram posts.
        </p>
      </div>

      {loading ? (
        <Card>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
        </Card>
      ) : !data.connected ? (
        <Card>
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium">
              Connect your Instagram account
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Visit the Accounts page to connect your Instagram and manage
              comments.
            </p>
          </div>
        </Card>
      ) : data.comments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageCircle className="w-5 h-5" />}
            title="No comments yet"
            description="When viewers comment on your Instagram posts, they'll appear here so you can reply without leaving Klone."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.comments.map((comment) => (
            <Card key={comment.id}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-medium text-sm shrink-0">
                  {comment.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {comment.username}
                    </span>
                    <span className="text-xs text-muted">
                      {comment.timestamp}
                    </span>
                    {comment.replied && (
                      <Badge variant="success">Replied</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    On: <span className="italic">{comment.postCaption}</span>
                  </p>
                  <p className="text-sm text-foreground mt-2">{comment.text}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-muted flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {comment.likes} likes
                    </span>
                    {!comment.replied && (
                      <button
                        onClick={() =>
                          setReplyingTo(
                            replyingTo === comment.id ? null : comment.id
                          )
                        }
                        className="text-xs text-accent hover:underline flex items-center gap-1"
                      >
                        <Reply className="w-3 h-3" />
                        Reply
                      </button>
                    )}
                  </div>

                  {replyingTo === comment.id && (
                    <div className="mt-3 flex gap-2">
                      <Input
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleReply(comment.id)}
                        disabled={sendingReply || !replyText.trim()}
                      >
                        {sendingReply ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-1" />
                            Send
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
