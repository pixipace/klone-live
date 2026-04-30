"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export function DashboardShell({
  children,
  impersonationBanner,
}: {
  children: React.ReactNode;
  impersonationBanner?: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile nav when route changes
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Close on Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    // Toast + Confirm providers wrap every dashboard route. Toasts replace
    // the old browser alert() calls; ConfirmProvider replaces window.confirm.
    <ToastProvider>
      <ConfirmProvider>
        <div className="min-h-screen bg-background">
          {/* Backdrop — mobile only, when nav is open */}
          {navOpen && (
            <div
              onClick={() => setNavOpen(false)}
              className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 md:hidden"
              aria-hidden
            />
          )}

          <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

          <div className="md:ml-[220px]">
            {impersonationBanner}
            <Topbar onMenuClick={() => setNavOpen(true)} />
            <main className="p-4 md:p-6 max-w-6xl">{children}</main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
