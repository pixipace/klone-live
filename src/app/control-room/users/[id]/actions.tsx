"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function UserActions({
  user,
}: {
  user: {
    id: string;
    email: string;
    plan: string;
    role: string;
    banned: boolean;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const callAction = async (action: string, body?: Record<string, unknown>) => {
    setBusy(action);
    try {
      const res = await fetch(`/api/control-room/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Action failed");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const deleteUser = async () => {
    if (
      !confirm(
        `Permanently delete ${user.email}? Cascades all their posts, clips, social accounts.`
      )
    )
      return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/control-room/users/${user.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/control-room/users");
      } else {
        const data = await res.json();
        alert(data.error || "Delete failed");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <select
        defaultValue={user.plan}
        onChange={(e) => callAction("setPlan", { plan: e.target.value })}
        disabled={busy !== null}
        className="text-xs bg-card border border-border rounded-lg px-2 py-1.5"
      >
        <option value="FREE">FREE</option>
        <option value="PRO">PRO</option>
        <option value="AGENCY">AGENCY</option>
      </select>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          callAction(user.role === "ADMIN" ? "demote" : "promote")
        }
        disabled={busy !== null}
      >
        {busy === "promote" || busy === "demote" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : user.role === "ADMIN" ? (
          "Demote"
        ) : (
          "Make admin"
        )}
      </Button>
      <Button
        size="sm"
        variant={user.banned ? "outline" : "outline"}
        onClick={() =>
          callAction(user.banned ? "unban" : "ban")
        }
        disabled={busy !== null}
      >
        {busy === "ban" || busy === "unban" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : user.banned ? (
          "Unban"
        ) : (
          "Ban"
        )}
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={deleteUser}
        disabled={busy !== null}
      >
        {busy === "delete" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          "Delete"
        )}
      </Button>
    </div>
  );
}
