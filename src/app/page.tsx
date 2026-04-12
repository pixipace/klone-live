import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/shared/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FEATURES } from "@/lib/constants";
import {
  ArrowRight,
  Share2,
  Upload,
  Clock,
  Users,
  Eye,
  Shield,
} from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  share2: <Share2 className="w-6 h-6" />,
  upload: <Upload className="w-6 h-6" />,
  clock: <Clock className="w-6 h-6" />,
  users: <Users className="w-6 h-6" />,
  eye: <Eye className="w-6 h-6" />,
  shield: <Shield className="w-6 h-6" />,
};

export default function HomePage() {
  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-sm text-muted-foreground mb-6">
            All your social media in one place
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Publish content to
            <br />
            <span className="text-accent">all your platforms</span>
            <br />
            from one dashboard.
          </h1>
          <p className="text-lg text-muted-foreground mt-6 max-w-2xl mx-auto">
            Manage and publish posts to X, TikTok, LinkedIn, Instagram, Facebook,
            and YouTube — all from a single, simple dashboard.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8">
            <Link href="/signup">
              <Button size="lg">
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">
                Log in
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted mt-4">
            Free to use. No credit card required.
          </p>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-xl border border-border bg-card p-2 shadow-2xl shadow-accent/5">
            <div className="rounded-lg bg-background border border-border p-12 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Image
                  src="/logo-icon.png"
                  alt="Klone"
                  width={48}
                  height={48}
                />
                <span className="text-2xl font-semibold tracking-tight">
                  KLONE
                </span>
              </div>
              <p className="text-muted-foreground text-sm mt-2">
                A clean, focused dashboard for all your social media publishing
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Everything you need to post</h2>
            <p className="text-muted-foreground mt-3">
              Simple, powerful tools to manage your social media presence.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <Card
                key={feature.title}
                className="hover:border-border-hover transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-4">
                  {iconMap[feature.icon]}
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold">
            Ready to start posting?
          </h2>
          <p className="text-muted-foreground mt-3">
            Create your free Klone account and connect your social media in
            minutes.
          </p>
          <Link href="/signup" className="inline-block mt-6">
            <Button size="lg">
              Get Started Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo-icon.png"
              alt="Klone"
              width={24}
              height={24}
            />
            <span className="text-sm text-muted-foreground">
              &copy; 2026 Klone. All rights reserved.
            </span>
          </div>
          <div className="flex gap-6">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
