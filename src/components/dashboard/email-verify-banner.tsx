"use client";

import { useEffect, useState } from "react";
import { Mail, X, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/**
 * Top-of-dashboard banner shown to users who haven't verified their
 * email yet. Single "Resend verification" action + dismiss button.
 *
 * Renders nothing when:
 *   - The user is already verified
 *   - The /api/auth/me check is still in flight (avoid layout flash)
 *   - The user has dismissed the banner this session (localStorage)
 *
 * The dismiss is per-session (sessionStorage) NOT permanent — we want
 * the banner to come back on the next visit so users don't forget to
 * verify entirely.
 */
export function EmailVerifyBanner() {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Skip the fetch if user dismissed it this session.
    if (sessionStorage.getItem("klone:verify-banner-dismissed") === "1") {
      return;
    }
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.user && d.user.emailVerified === false) {
          setShow(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const resend = async () => {
    setResending(true);
    try {
      const res = await fetch("/api/auth/verify-email", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't send", data.error || "Try again in a moment");
        return;
      }
      if (data.alreadyVerified) {
        toast.success("You're already verified");
        setShow(false);
        return;
      }
      toast.success("Verification email sent", "Check your inbox + spam folder");
    } finally {
      setResending(false);
    }
  };

  const dismiss = () => {
    sessionStorage.setItem("klone:verify-banner-dismissed", "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="bg-warning-soft border-b border-warning/30 px-4 py-2.5">
      <div className="max-w-6xl mx-auto flex items-center gap-3">
        <Mail className="w-4 h-4 text-warning shrink-0" />
        <p className="text-xs text-foreground flex-1 truncate">
          <span className="font-medium">Verify your email.</span>{" "}
          <span className="text-foreground-secondary">
            We sent a link when you signed up — check inbox or click resend.
          </span>
        </p>
        <button
          onClick={resend}
          disabled={resending}
          className="text-xs font-medium text-warning hover:text-warning/80 disabled:opacity-50 inline-flex items-center gap-1 shrink-0"
        >
          {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Resend
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-muted hover:text-foreground transition-colors shrink-0 -mr-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
