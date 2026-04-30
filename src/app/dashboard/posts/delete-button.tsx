"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function DeleteButton({ postId }: { postId: string }) {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this post?",
      description: "This permanently removes the post from your history. The published version on each platform stays — this only affects Klone.",
      destructive: true,
      confirmLabel: "Delete post",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Post deleted");
        startTransition(() => router.refresh());
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Delete failed", data.error || "Please try again");
        setBusy(false);
      }
    } catch (err) {
      toast.error("Delete failed", String(err).slice(0, 200));
      setBusy(false);
    }
  };

  return (
    <button
      onClick={remove}
      disabled={busy}
      title="Delete post"
      className="p-1.5 text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Trash2 className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
