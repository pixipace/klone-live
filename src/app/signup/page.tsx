"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthShowcase } from "@/components/shared/auth-showcase";
import { Loader2 } from "lucide-react";

export default function SignupPage() {
  const [name, setName] = useState("");
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
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Signup failed");
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
            <h1 className="text-3xl font-bold tracking-tight">
              Create your account
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Get started with Klone in seconds. No credit card required.
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full name"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <p className="text-xs text-muted text-center">
            By signing up, you agree to our{" "}
            <a href="/terms" className="text-accent hover:underline">Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>
          </p>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted">
                Already a member?
              </span>
            </div>
          </div>

          <Link href="/login" className="block">
            <Button variant="outline" className="w-full" size="lg">
              Log in instead
            </Button>
          </Link>
        </div>
      </div>

      {/* Right side - Showcase */}
      <AuthShowcase
        title="One dashboard. Every platform."
        subtitle="Connect your social accounts and start publishing content across all of them from a single, simple interface."
        bullets={[
          "Connect TikTok, X, LinkedIn, Instagram & more",
          "Upload videos and images directly",
          "Schedule posts in advance",
          "Track everything in one place",
        ]}
      />
    </div>
  );
}
