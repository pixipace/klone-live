"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthShowcase } from "@/components/shared/auth-showcase";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
      {/* Left side - Form */}
      <div className="flex items-center justify-center px-6 py-12 relative">
        {/* Mobile-only background */}
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
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Log in to continue managing your social media.
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div>
              <Input
                label="Password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Link
                href="#"
                className="text-xs text-muted-foreground hover:text-foreground mt-2 inline-block"
              >
                Forgot password?
              </Link>
            </div>
            <Button className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Logging in...
                </>
              ) : (
                "Log in"
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted">New to Klone?</span>
            </div>
          </div>

          <Link href="/signup" className="block">
            <Button variant="outline" className="w-full" size="lg">
              Create an account
            </Button>
          </Link>
        </div>
      </div>

      {/* Right side - Showcase */}
      <AuthShowcase
        title="Welcome back to Klone"
        subtitle="Pick up where you left off. Manage and publish content across all your social media accounts."
        bullets={[
          "All your accounts in one dashboard",
          "Upload videos directly from your device",
          "Schedule for the perfect time",
          "Secure and private — your data, your control",
        ]}
      />
    </div>
  );
}
