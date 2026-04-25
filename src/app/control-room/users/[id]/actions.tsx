"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Settings } from "lucide-react";

const FEATURE_LIST: Array<{ key: string; label: string; defaultOn: boolean }> = [
  { key: "clipper", label: "Clipper (Clip Studio)", defaultOn: true },
  { key: "posting", label: "Posting (Create / Schedule)", defaultOn: true },
  { key: "scheduling", label: "Scheduled posts", defaultOn: true },
  { key: "ai", label: "AI features (captions, hooks, mood)", defaultOn: true },
  { key: "musicSfx", label: "Background music + SFX", defaultOn: true },
];

export function UserActions({
  user,
}: {
  user: {
    id: string;
    email: string;
    plan: string;
    role: string;
    banned: boolean;
    featureFlags: string | null;
    maxClipsPerMonth: number | null;
    notes: string | null;
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
        onClick={() => callAction(user.banned ? "unban" : "ban")}
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

export function SuperAdminControls({
  user,
}: {
  user: {
    id: string;
    featureFlags: string | null;
    maxClipsPerMonth: number | null;
    notes: string | null;
  };
}) {
  const router = useRouter();

  const initialFlags: Record<string, boolean> = (() => {
    if (!user.featureFlags) return {};
    try {
      return JSON.parse(user.featureFlags);
    } catch {
      return {};
    }
  })();

  const [flags, setFlags] = useState<Record<string, boolean>>(initialFlags);
  const [maxClips, setMaxClips] = useState<string>(
    user.maxClipsPerMonth?.toString() ?? ""
  );
  const [notes, setNotes] = useState(user.notes ?? "");
  const [savingFlags, setSavingFlags] = useState(false);
  const [savingLimits, setSavingLimits] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const post = async (action: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/control-room/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed");
    } else {
      router.refresh();
    }
  };

  const saveFlags = async () => {
    setSavingFlags(true);
    try {
      const out: Record<string, boolean> = {};
      for (const f of FEATURE_LIST) {
        const val = flags[f.key];
        if (val === undefined) continue;
        if (val !== f.defaultOn) out[f.key] = val;
      }
      await post("setFeatureFlags", { featureFlags: out });
    } finally {
      setSavingFlags(false);
    }
  };

  const saveLimits = async () => {
    setSavingLimits(true);
    try {
      const num = maxClips.trim() === "" ? null : parseInt(maxClips, 10);
      if (num !== null && (Number.isNaN(num) || num < 0)) {
        alert("Max clips must be 0 or higher (or empty for plan default).");
        return;
      }
      await post("setLimits", { maxClipsPerMonth: num });
    } finally {
      setSavingLimits(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await post("setNotes", { notes });
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="rounded-xl border border-error/20 bg-error/5 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-error" />
        <h2 className="text-sm font-semibold text-error">
          Owner-only controls
        </h2>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Feature toggles
        </label>
        <div className="space-y-1.5">
          {FEATURE_LIST.map((f) => {
            const current = flags[f.key];
            const isOn = current === undefined ? f.defaultOn : current;
            return (
              <label
                key={f.key}
                className="flex items-center justify-between text-sm cursor-pointer hover:bg-card/40 rounded px-2 py-1.5"
              >
                <span>{f.label}</span>
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={(e) =>
                    setFlags((prev) => ({ ...prev, [f.key]: e.target.checked }))
                  }
                  className="accent-error"
                />
              </label>
            );
          })}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={saveFlags}
          disabled={savingFlags}
          className="mt-3"
        >
          {savingFlags ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1" />
          )}
          Save toggles
        </Button>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Custom limits
        </label>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              Max clip jobs / month (empty = plan default)
            </label>
            <input
              type="number"
              min={0}
              value={maxClips}
              onChange={(e) => setMaxClips(e.target.value)}
              placeholder="No override"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={saveLimits}
            disabled={savingLimits}
          >
            {savingLimits ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Private notes (only visible to owner)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Sales context, support history, anything you want to remember about this user…"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-y"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={saveNotes}
          disabled={savingNotes}
          className="mt-2"
        >
          {savingNotes ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1" />
          )}
          Save notes
        </Button>
      </div>
    </div>
  );
}
