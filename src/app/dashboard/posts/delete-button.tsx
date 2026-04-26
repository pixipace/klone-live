"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteButton({ postId }: { postId: string }) {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const remove = async () => {
    if (!confirm("Delete this post? Cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (res.ok) {
        startTransition(() => router.refresh());
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Delete failed");
        setBusy(false);
      }
    } catch (err) {
      alert(String(err).slice(0, 200));
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
