import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/shared/navbar";
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
  share2: <Share2 className="w-5 h-5" />,
  upload: <Upload className="w-5 h-5" />,
  clock: <Clock className="w-5 h-5" />,
  users: <Users className="w-5 h-5" />,
  eye: <Eye className="w-5 h-5" />,
  shield: <Shield className="w-5 h-5" />,
};

const platforms = [
  { name: "TikTok", color: "#00f2ea" },
  { name: "Instagram", color: "#e4405f" },
  { name: "Facebook", color: "#1877f2" },
  { name: "YouTube", color: "#ff0000" },
  { name: "LinkedIn", color: "#0077b5" },
];

export default function HomePage() {
  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="relative pt-36 pb-24 px-6 overflow-hidden">
        {/* Background effects */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 left-1/4 w-[300px] h-[300px] bg-accent/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">
          {/* Platform pills */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {platforms.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border/60 text-xs text-muted-foreground"
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
              </div>
            ))}
          </div>

          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
            Post everywhere.
            <br />
            <span className="text-muted-foreground font-light">From one place.</span>
          </h1>

          <p className="text-base text-muted-foreground mt-6 max-w-lg mx-auto leading-relaxed">
            Upload once, publish to TikTok, Instagram, Facebook, YouTube, and
            LinkedIn. Simple as sending a message.
          </p>

          <div className="flex items-center justify-center gap-3 mt-10">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Get started free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center px-6 py-3 rounded-xl bg-card border border-border/60 hover:border-border-hover text-sm font-medium transition-colors"
            >
              Log in
            </Link>
          </div>

          <p className="text-xs text-muted mt-5">
            No credit card. No setup fee. Just start posting.
          </p>
        </div>
      </section>

      {/* Visual break — dashboard mock */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-2xl bg-card border border-border/60 p-1 shadow-2xl shadow-black/20">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-b from-accent/10 to-transparent pointer-events-none" />
            <div className="relative rounded-xl bg-background border border-border/40 overflow-hidden">
              {/* Mock topbar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-error/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-warning/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-success/40" />
                </div>
                <span className="text-[10px] text-muted ml-2 font-mono">
                  klone.live/dashboard
                </span>
              </div>
              {/* Mock content */}
              <div className="p-6 flex gap-4">
                {/* Mock sidebar */}
                <div className="w-36 space-y-2 shrink-0">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/8">
                    <div className="w-3 h-3 rounded bg-accent/30" />
                    <div className="w-12 h-2 rounded bg-accent/20" />
                  </div>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-2 py-1.5"
                    >
                      <div className="w-3 h-3 rounded bg-border" />
                      <div
                        className="h-2 rounded bg-border/60"
                        style={{ width: `${30 + i * 10}px` }}
                      />
                    </div>
                  ))}
                </div>
                {/* Mock main */}
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-card border border-border/40 p-3"
                      >
                        <div className="w-8 h-1.5 rounded bg-border/60 mb-2" />
                        <div className="w-12 h-4 rounded bg-muted/20" />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {platforms.map((p) => (
                      <div
                        key={p.name}
                        className="w-6 h-6 rounded-md"
                        style={{ backgroundColor: p.color, opacity: 0.3 }}
                      />
                    ))}
                  </div>
                  <div className="rounded-lg bg-card border border-border/40 p-3 h-16" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold tracking-tight">
              Simple tools, powerful results
            </h2>
            <p className="text-muted-foreground mt-3 text-sm">
              Everything you need to manage your social presence.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl bg-card border border-border/60 p-5 hover:border-border-hover transition-all card-glow"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/8 flex items-center justify-center text-accent mb-3">
                  {iconMap[feature.icon]}
                </div>
                <h3 className="text-sm font-medium mb-1.5">{feature.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center relative">
          <div className="absolute inset-0 -m-20 bg-accent/5 rounded-full blur-[80px] pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight">
              Ready to simplify your social?
            </h2>
            <p className="text-muted-foreground mt-3 text-sm">
              Create your free account and start publishing in minutes.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 mt-8 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Get started free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image
                src="/logo-icon.png"
                alt="Klone"
                width={20}
                height={20}
                className="opacity-60"
              />
              <span className="text-xs text-muted">
                &copy; 2026 Klone
              </span>
            </div>
            <div className="flex gap-5">
              <Link
                href="/privacy"
                className="text-xs text-muted hover:text-muted-foreground transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-xs text-muted hover:text-muted-foreground transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/data-deletion"
                className="text-xs text-muted hover:text-muted-foreground transition-colors"
              >
                Data Deletion
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
