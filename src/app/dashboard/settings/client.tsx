"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Trash2, Loader2, Save } from "lucide-react";

const TZ_PRESETS = [
  { value: "", label: "Use my browser timezone" },
  { value: "America/New_York", label: "US East (NYC)" },
  { value: "America/Los_Angeles", label: "US West (LA)" },
  { value: "America/Chicago", label: "US Central (Chicago)" },
  { value: "Europe/London", label: "UK / Ireland" },
  { value: "Europe/Paris", label: "Europe Central" },
  { value: "Asia/Karachi", label: "Pakistan" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "Asia/Dubai", label: "UAE / Gulf" },
  { value: "Asia/Singapore", label: "Singapore / SE Asia" },
  { value: "Australia/Sydney", label: "Sydney / AU East" },
  { value: "UTC", label: "UTC" },
];

export function SettingsClient({
  user,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    plan: string;
    notifyOnPost: boolean;
    audienceTimezone: string | null;
  };
}) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [notifyOnPost, setNotifyOnPost] = useState(user.notifyOnPost);
  const [tz, setTz] = useState(user.audienceTimezone ?? "");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `klone-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    setPrefsSaved(false);
    try {
      const res = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notifyOnPost,
          audienceTimezone: tz || null,
        }),
      });
      if (res.ok) {
        setPrefsSaved(true);
        setTimeout(() => setPrefsSaved(false), 2000);
        router.refresh();
      }
    } finally {
      setSavingPrefs(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirm.trim() !== user.email) {
      setDeleteErr("Type your email exactly to confirm.");
      return;
    }
    setDeleting(true);
    setDeleteErr(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      router.push("/");
    } catch (err) {
      setDeleteErr(String(err instanceof Error ? err.message : err));
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardTitle>Profile</CardTitle>
        <CardDescription className="mb-4">Account details</CardDescription>
        <div className="space-y-4">
          <Input label="Name" defaultValue={user.name} disabled />
          <Input label="Email" defaultValue={user.email} type="email" disabled />
          <p className="text-xs text-muted-foreground">
            Profile editing coming soon. Plan: <strong>{user.plan}</strong>
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle>Preferences</CardTitle>
        <CardDescription className="mb-4">
          How and when Klone communicates with you
        </CardDescription>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyOnPost}
              onChange={(e) => setNotifyOnPost(e.target.checked)}
              className="accent-accent mt-1"
            />
            <div>
              <p className="text-sm font-medium">
                Email me when scheduled posts publish
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                One email per scheduled post that goes live, with the
                published links.
              </p>
            </div>
          </label>
          <div>
            <label className="text-sm font-medium block mb-1.5">
              Audience timezone
            </label>
            <select
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            >
              {TZ_PRESETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">
              Used by Auto-distribute to pick the best posting times for your
              audience (not your timezone). Default: your browser timezone.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={savePrefs} disabled={savingPrefs}>
              {savingPrefs ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save preferences
            </Button>
            {prefsSaved && (
              <span className="text-xs text-success">Saved ✓</span>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Export your data</CardTitle>
        <CardDescription className="mb-4">
          Download everything we have on you as JSON — account, connected
          social profiles, posts, clip jobs.
        </CardDescription>
        <Button size="sm" onClick={exportData} disabled={exporting}>
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Download JSON
            </>
          )}
        </Button>
      </Card>

      <Card>
        <CardTitle className="text-error">Delete account</CardTitle>
        <CardDescription className="mb-4">
          Permanently deletes your account, all connected social accounts,
          posts, scheduled jobs, clips, and uploaded files. <strong>Cannot be undone.</strong>
        </CardDescription>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Type <strong className="text-foreground">{user.email}</strong> to confirm:
          </p>
          <Input
            placeholder={user.email}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
          />
          {deleteErr && <p className="text-xs text-error">{deleteErr}</p>}
          <Button
            variant="danger"
            size="sm"
            onClick={deleteAccount}
            disabled={deleting || deleteConfirm.trim() !== user.email}
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete my account
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
