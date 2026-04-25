"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { PasswordInput, StrengthMeter, scorePassword } from "@/components/ui/password-input";
import { AuthShowcase } from "@/components/shared/auth-showcase";
import { Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground p-8">Loading…</div>}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reset failed");
        return;
      }
      router.push("/login?reset=1");
    } catch {
      setError("Something went wrong");
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
            <h1 className="text-3xl font-bold tracking-tight">Set a new password</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Pick something strong. You&apos;ll be logged in once it&apos;s saved.
            </p>
          </div>

          {!token && (
            <div className="px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
              Missing or invalid link. <Link href="/forgot-password" className="underline">Request a new one</Link>.
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <PasswordInput
                label="New password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <div className="mt-2">
                <StrengthMeter password={password} />
              </div>
            </div>
            <PasswordInput
              label="Confirm new password"
              placeholder="Type it again"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Button
              className="w-full"
              size="lg"
              disabled={
                loading ||
                !token ||
                password.length < 8 ||
                scorePassword(password).label === "weak" ||
                password !== confirm
              }
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save new password"
              )}
            </Button>
          </form>
        </div>
      </div>
      <AuthShowcase
        title="Almost done"
        subtitle="Set a strong password and you'll be logged back in immediately."
        bullets={[
          "Mixed case + numbers + symbol = strong",
          "Use a password manager — your future self will thank you",
          "Old password is replaced everywhere",
        ]}
      />
    </div>
  );
}
