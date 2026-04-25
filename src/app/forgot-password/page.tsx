"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthShowcase } from "@/components/shared/auth-showcase";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex items-center justify-center px-6 py-12 relative">
        <div className="lg:hidden absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-accent/10 to-transparent pointer-events-none" />
        <div className="w-full max-w-sm space-y-6 relative">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 mb-10">
              <div className="relative">
                <div className="absolute inset-0 bg-accent/20 blur-xl" />
                <div className="relative w-10 h-10 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center">
                  <Image src="/logo-icon.png" alt="Klone" width={24} height={24} />
                </div>
              </div>
              <span className="text-xl font-bold tracking-tight">KLONE</span>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Enter your email — we&apos;ll send you a link to set a new password.
            </p>
          </div>

          {sent ? (
            <div className="px-4 py-4 rounded-lg bg-success/10 border border-success/20 text-success text-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Check your inbox</p>
                <p className="text-xs mt-1 opacity-80">
                  If an account exists for {email}, we&apos;ve sent a reset link. The link expires in 30 minutes.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Button className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>
          )}

          <Link
            href="/login"
            className="block text-xs text-muted-foreground hover:text-foreground text-center"
          >
            ← Back to login
          </Link>
        </div>
      </div>
      <AuthShowcase
        title="Locked out?"
        subtitle="Happens. We'll get you back in within 30 seconds — just check your inbox."
        bullets={[
          "Reset link valid for 30 minutes",
          "Old password stays until you set a new one",
          "Check spam if you don't see it in 1-2 min",
        ]}
      />
    </div>
  );
}
