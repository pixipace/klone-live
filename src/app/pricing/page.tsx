import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { ArrowRight, Check, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing — Klone",
  description:
    "Klone is free during beta. Paid tiers ship once the core feature set is locked.",
};

const betaIncluded = [
  "Unlimited clip jobs from YouTube URLs",
  "Cinematic 9:16 crop with face tracking",
  "Word-by-word burned-in captions",
  "Mood-matched music + sound effects",
  "AI hook variants per clip",
  "5 connected social platforms",
  "Best-time auto-distribute scheduling",
  "Multi-account / multi-page support",
  "Email notifications on publish",
];

const proPreview = [
  "Higher monthly clip cap",
  "Priority render queue",
  "Custom brand presets (colors, fonts, intro/outro)",
  "Bulk URL submission",
  "Custom domain for shareable clip pages",
  "Team seats",
];

export default function PricingPage() {
  return (
    <>
      <Navbar />

      <section className="relative pt-32 pb-12 px-6">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-accent/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border/60 text-[11px] text-muted-foreground mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Beta pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Free while we&apos;re building.
          </h1>
          <p className="text-base text-muted-foreground mt-5 max-w-lg mx-auto leading-relaxed">
            Klone is built and run by a solo founder. Pricing kicks in once the
            core feature set is locked — for now, every account gets the full
            product, no card needed.
          </p>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Beta tier (current) */}
          <div className="relative rounded-2xl bg-card border-2 border-accent/40 p-7">
            <div className="absolute -top-3 left-7 px-2.5 py-0.5 rounded-full bg-accent text-white text-[10px] font-medium uppercase tracking-wider">
              Available now
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <h2 className="text-xl font-semibold">Beta</h2>
              <span className="text-xs text-muted-foreground">— for everyone</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-4">
              <span className="text-5xl font-semibold tracking-tight">$0</span>
              <span className="text-sm text-muted-foreground">/ month</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              No credit card. No trial limit. Cancel-not-required.
            </p>

            <Link
              href="/signup"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Start free
              <ArrowRight className="w-4 h-4" />
            </Link>

            <ul className="mt-6 space-y-2.5">
              {betaIncluded.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-xs">
                  <Check className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                  <span className="text-muted-foreground leading-relaxed">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro tier (coming) */}
          <div className="relative rounded-2xl bg-card/60 border border-border/40 p-7">
            <div className="absolute -top-3 left-7 px-2.5 py-0.5 rounded-full bg-card border border-border/60 text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
              Coming later
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                Pro
                <Sparkles className="w-4 h-4 text-accent/60" />
              </h2>
              <span className="text-xs text-muted-foreground">— for creators scaling up</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-4">
              <span className="text-5xl font-semibold tracking-tight text-muted-foreground">TBD</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              We&apos;ll grandfather every beta user with a discount when this
              launches.
            </p>

            <button
              disabled
              className="mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 rounded-xl bg-card border border-border/60 text-muted text-sm font-medium cursor-not-allowed"
            >
              Not yet
            </button>

            <p className="text-[10px] uppercase tracking-wider text-muted mt-6 mb-2">
              Everything in Beta, plus
            </p>
            <ul className="space-y-2.5">
              {proPreview.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-xs">
                  <Check className="w-3.5 h-3.5 text-muted shrink-0 mt-0.5" />
                  <span className="text-muted-foreground leading-relaxed">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Honest note */}
        <div className="max-w-3xl mx-auto mt-14 rounded-xl bg-card/60 border border-border/40 p-6">
          <h3 className="text-sm font-medium mb-2">Why is it free right now?</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Two reasons. First, every clip job runs on a Mac Mini in a closet —
            until that becomes a bottleneck, the marginal cost of one more user
            is a few cents of electricity. Second, the product is still being
            sharpened, and feedback from real users is worth more than what
            we&apos;d charge for it. When that changes, you&apos;ll see this page
            update — not your card.
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
}
