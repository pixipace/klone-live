"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";

export function ExitImpersonationButton() {
  const [busy, setBusy] = useState(false);

  const exit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/control-room/impersonate/exit", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = data.redirectTo || "/control-room";
      } else {
        alert(data.error || "Failed to exit impersonation");
        setBusy(false);
      }
    } catch (err) {
      alert(String(err).slice(0, 200));
      setBusy(false);
    }
  };

  return (
    <button
      onClick={exit}
      disabled={busy}
      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-warning/25 hover:bg-warning/35 text-warning shrink-0 disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <LogOut className="w-3 h-3" />
      )}
      Exit impersonation
    </button>
  );
}
