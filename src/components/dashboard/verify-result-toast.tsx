"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";

/**
 * Listens for ?verify=... search param set by /api/auth/verify-email
 * redirects, fires the appropriate toast, then strips the param so a
 * page refresh doesn't re-trigger.
 *
 * Must live INSIDE ToastProvider — that's why it's a separate component
 * mounted alongside EmailVerifyBanner in DashboardShell.
 */
export function VerifyResultToast() {
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const verify = sp.get("verify");
    if (!verify) return;

    if (verify === "success") {
      toast.success("Email verified", "Thanks — you're all set");
      // Stop the verify banner from re-appearing on this load. The
      // banner already mounted before this toast fires, so its
      // "show" state is sticky until next /api/auth/me call. Setting
      // the dismiss flag here keeps it gone on the inevitable nav.
      sessionStorage.setItem("klone:verify-banner-dismissed", "1");
    } else if (verify === "already") {
      toast.info("Already verified");
      sessionStorage.setItem("klone:verify-banner-dismissed", "1");
    } else if (verify === "expired") {
      toast.error(
        "Verification link expired",
        "Click 'Resend' on the banner to get a fresh one",
      );
    } else if (verify === "invalid") {
      toast.error(
        "Verification link invalid",
        "It may have already been used. Click 'Resend' to get a new one.",
      );
    }

    // Strip the param so a refresh doesn't fire the toast again
    const url = new URL(window.location.href);
    url.searchParams.delete("verify");
    router.replace(url.pathname + url.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  return null;
}
