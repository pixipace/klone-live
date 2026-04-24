"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Trash2, Loader2 } from "lucide-react";

export function SettingsClient({
  user,
}: {
  user: { id: string; name: string; email: string; plan: string };
}) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

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
        <CardDescription className="mb-4">
          Account details
        </CardDescription>
        <div className="space-y-4">
          <Input label="Name" defaultValue={user.name} disabled />
          <Input label="Email" defaultValue={user.email} type="email" disabled />
          <p className="text-xs text-muted-foreground">
            Profile editing coming soon. Plan: <strong>{user.plan}</strong>
          </p>
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
          {deleteErr && (
            <p className="text-xs text-error">{deleteErr}</p>
          )}
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
