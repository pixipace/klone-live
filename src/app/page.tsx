import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { prisma } from "@/lib/prisma";
import {
  ArrowRight,
  Scissors,
  Wand2,
  Calendar,
  Share2,
  Sparkles,
  Clock,
  Type,
  Music,
  Maximize2,
  Globe,
} from "lucide-react";

const platforms = [
  { name: "TikTok", color: "#00f2ea" },
  { name: "Instagram", color: "#e4405f" },
  { name: "YouTube", color: "#ff0000" },
  { name: "Facebook", color: "#1877f2" },
  { name: "LinkedIn", color: "#0077b5" },
];

const clipperFeatures = [
  {
    icon: <Scissors className="w-4 h-4" />,
    title: "AI picks the best moments",
    body: "Paste a YouTube URL. We transcribe, score viral potential, and cut 30-60s vertical clips automatically.",
  },
  {
    icon: <Maximize2 className="w-4 h-4" />,
    title: "Speaker stays centred",
    body: "Face tracking keeps the talking head in frame on a true 9:16 crop — not just a center crop.",
  },
  {
    icon: <Type className="w-4 h-4" />,
    title: "Word-by-word captions",
    body: "Karaoke-style captions burned in with proper timing. No re-typing. No third-party caption tool.",
  },
  {
    icon: <Music className="w-4 h-4" />,
    title: "Mood-matched music + SFX",
    body: "AI reads the clip's energy, picks a fitting track, ducks under speech, and lifts a punch zoom on emphasis.",
  },
  {
    icon: <Sparkles className="w-4 h-4" />,
    title: "Hook variants ready to swap",
    body: "Three hook titles per clip so you can A/B without re-editing. Promotional tone, not descriptive.",
  },
  {
    icon: <Wand2 className="w-4 h-4" />,
    title: "Re-pick without re-rendering",
    body: "Don't like the picks? Re-run the AI on the cached transcript in seconds — no fresh download or whisper pass.",
  },
];

const distributionFeatures = [
  {
    icon: <Calendar className="w-4 h-4" />,
    title: "Best-time auto-distribute",
    body: "Pick days, pick platforms — Klone schedules each clip at the slot most likely to land on each one.",
  },
  {
    icon: <Share2 className="w-4 h-4" />,
    title: "One queue, five platforms",
    body: "Connect once. Push the same clip to TikTok, Instagram, YouTube, Facebook, and LinkedIn from one place.",
  },
  {
    icon: <Globe className="w-4 h-4" />,
    title: "Audience-timezone aware",
    body: "Set your audience's timezone — schedules use their local prime time, not yours.",
  },
];

const faq = [
  {
    q: "What does it cost?",
    a: "Free during beta. Klone is built and run by a solo founder — pricing kicks in once the core feature set is locked.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Paste a YouTube URL in your browser. Clips render server-side and land in your dashboard, ready to schedule.",
  },
  {
    q: "Which platforms can I post to?",
    a: "TikTok, Instagram (Reels), YouTube (Shorts), Facebook, and LinkedIn. Connect once via OAuth, post forever.",
  },
  {
    q: "How long does a clip take?",
    a: "A 20-minute video typically renders 5–8 clips in around 6–12 minutes depending on options.",
  },
  {
    q: "Can I edit a clip after Klone makes it?",
    a: "You can rewrite the hook, swap captions on/off, change the music mood, and re-pick clips from a cached transcript without re-rendering the whole job.",
  },
  {
    q: "Will my account get flagged for posting the same clip to many platforms?",
    a: "Each platform receives a clean, native upload — not a cross-share. Best-time scheduling spaces them out so it doesn't look like a bot blast.",
  },
];

// Re-fetch platform-wide stats once an hour. Marketing numbers don't
// need real-time freshness and we don't want to hammer the DB on every
// homepage hit.
export const revalidate = 3600;

async function getPlatformStats() {
  try {
    const [clipsTotal, postsPublished, sourceMinutes] = await Promise.all([
      prisma.clip.count(),
      prisma.post.count({ where: { status: { in: ["POSTED", "PARTIAL"] } } }),
      // Sum of source video minutes processed (a fun "amount of footage
      // turned into clips" metric)
      prisma.clipJob.aggregate({
        where: { status: "DONE" },
        _sum: { sourceDuration: true },
      }),
    ]);
    return {
      clipsTotal,
      postsPublished,
      hoursProcessed: Math.round((sourceMinutes._sum.sourceDuration ?? 0) / 3600),
    };
  } catch {
    return { clipsTotal: 0, postsPublished: 0, hoursProcessed: 0 };
  }
}

export default async function HomePage() {
  const stats = await getPlatformStats();
  return (
    <>
      <Navbar />

      {/* Hero — ambient warm wash background lifts the page from "blank
          doc" to "studio." Massive typography (text-8xl) commands the
          fold. Serif-italic signature word for the unique Klone feel. */}
      <section className="relative hero-ambient pt-36 pb-24 px-6 overflow-hidden">
        {/* Subtle dot-grid texture — visible only on close inspection */}
        <div className="absolute inset-0 dot-grid opacity-50 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border text-[11px] text-muted-foreground mb-8 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Free during beta — no credit card
          </div>

          <h1 className="text-6xl md:text-8xl font-semibold tracking-tight leading-[0.98]">
            Long video in.
            <br />
            Short clips{" "}
            <span
              className="font-normal italic text-foreground-secondary"
              style={{ fontFamily: "var(--font-serif), serif" }}
            >
              out.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-foreground-secondary mt-8 max-w-2xl mx-auto leading-relaxed">
            Klone turns your long videos into vertical, captioned,
            cinematic short-form clips — then schedules them across TikTok,
            Instagram, YouTube, Facebook, and LinkedIn at the best time for each.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-12">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-foreground hover:bg-foreground-secondary text-background text-sm font-medium transition-all active:scale-[0.98] shadow-md"
            >
              Start clipping free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center px-6 py-3 rounded-md bg-card border border-border hover:border-border-hover text-sm font-medium transition-all shadow-sm"
            >
              See how it works
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-12 flex-wrap">
            <span className="text-[11px] uppercase tracking-wider text-muted mr-2">Posts to</span>
            {platforms.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-xs text-foreground-secondary shadow-sm"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Clip preview visual — sits on the hero ambient, gets a beefy
          shadow so it lifts off the page like a real product still. */}
      <section className="hero-ambient px-6 pb-32 -mt-4 relative">
        <div className="max-w-5xl mx-auto relative">
          {/* Browser-chrome mock — beefier shadow, sharper definition. */}
          <div className="relative rounded-xl bg-card border border-border p-1 shadow-2xl shadow-foreground/10">
            <div className="relative rounded-lg bg-background border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-error/30" />
                  <div className="w-2.5 h-2.5 rounded-full bg-warning/30" />
                  <div className="w-2.5 h-2.5 rounded-full bg-success/30" />
                </div>
                <span className="text-[10px] text-muted ml-2 font-mono">
                  klone.live/dashboard/clips
                </span>
              </div>

              {/* Clipper canvas mock */}
              <div className="grid grid-cols-12 gap-4 p-6">
                {/* Source video */}
                <div className="col-span-7 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted font-medium">
                    Source video
                  </div>
                  <div className="aspect-video rounded-md bg-card border border-border relative overflow-hidden flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-foreground/10 flex items-center justify-center">
                      <div className="w-0 h-0 border-l-[10px] border-l-foreground/60 border-y-[7px] border-y-transparent ml-1" />
                    </div>
                    <div className="absolute bottom-2 left-2 right-2 h-1 bg-foreground/10 rounded-full overflow-hidden">
                      <div className="h-full w-1/3 bg-foreground/40" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-accent-soft text-accent font-medium">
                      Transcribing
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground">
                      Picking 6 clips
                    </span>
                  </div>
                </div>

                {/* Generated clips */}
                <div className="col-span-5 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted font-medium">
                    Generated clips
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { score: 92, label: "Hook" },
                      { score: 87, label: "Insight" },
                      { score: 81, label: "Story" },
                    ].map((c, i) => (
                      <div
                        key={i}
                        className="aspect-[9/16] rounded-md bg-foreground/5 border border-border relative overflow-hidden"
                      >
                        <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-foreground text-background text-[8px] font-medium">
                          {c.score}
                        </div>
                        <div className="absolute bottom-1 left-1 right-1 text-[7px] text-foreground-secondary font-medium leading-tight">
                          {c.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md bg-card border border-border p-2.5 space-y-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted font-medium">
                      Schedule
                    </div>
                    {platforms.slice(0, 3).map((p) => (
                      <div
                        key={p.name}
                        className="flex items-center justify-between text-[10px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="text-foreground-secondary">
                            {p.name}
                          </span>
                        </div>
                        <span className="text-muted font-mono tabular-nums">9:00 AM</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clipper features — pure white section. The white pop after warm
          ambient hero gives a clean reset for content. Bento layout: first
          card spans 2 columns for visual rhythm. */}
      <section id="features" className="py-24 px-6 bg-section-soft">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5 text-foreground-secondary text-[10px] font-medium uppercase tracking-wider mb-5">
              <Scissors className="w-3 h-3" />
              The clipper
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
              An editor,{" "}
              <span
                className="font-normal italic text-foreground-secondary"
                style={{ fontFamily: "var(--font-serif), serif" }}
              >
                in a box.
              </span>
            </h2>
            <p className="text-foreground-secondary mt-5 text-base max-w-lg leading-relaxed">
              Klone does what a freelance editor would do — face tracking,
              captions, music, hook titles — without the back-and-forth.
            </p>
          </div>
          {/* Bento grid: first card double-width, rest standard. The
              asymmetry breaks the "six identical squares" monotony. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-fr">
            {clipperFeatures.map((f, i) => (
              <div
                key={f.title}
                className={`rounded-xl bg-card border border-border p-6 card-glow ${
                  i === 0 ? "md:col-span-2 md:row-span-1" : ""
                }`}
              >
                <div className="w-9 h-9 rounded-md bg-foreground/5 flex items-center justify-center text-foreground mb-4">
                  {f.icon}
                </div>
                <h3 className={`font-semibold mb-1.5 tracking-tight ${i === 0 ? "text-lg" : "text-sm"}`}>{f.title}</h3>
                <p className={`text-foreground-secondary leading-relaxed ${i === 0 ? "text-sm" : "text-xs"}`}>
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Distribution features — warm beige section. The tonal shift
          breaks the "all white" monotony and signals a topic change. */}
      <section className="py-24 px-6 bg-section-warm grain relative">
        <div className="max-w-6xl mx-auto relative">
          <div className="mb-16 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5 text-foreground-secondary text-[10px] font-medium uppercase tracking-wider mb-5">
              <Share2 className="w-3 h-3" />
              The distribution
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
              Five platforms.{" "}
              <span
                className="font-normal italic text-foreground-secondary"
                style={{ fontFamily: "var(--font-serif), serif" }}
              >
                One queue.
              </span>
            </h2>
            <p className="text-foreground-secondary mt-5 text-base max-w-lg leading-relaxed">
              When the clips are ready, they go where your audience already
              scrolls — at the time they actually scroll.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {distributionFeatures.map((f) => (
              <div
                key={f.title}
                className="rounded-xl bg-card border border-border p-6 card-glow"
              >
                <div className="w-9 h-9 rounded-md bg-foreground/5 flex items-center justify-center text-foreground mb-4">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold mb-1.5 tracking-tight">{f.title}</h3>
                <p className="text-xs text-foreground-secondary leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live platform stats — social proof. Pure white pop again. */}
      {(stats.clipsTotal > 0 || stats.postsPublished > 0) && (
        <section className="py-20 px-6 bg-section-soft">
          <div className="max-w-4xl mx-auto">
            <p className="text-center text-[10px] uppercase tracking-[0.2em] text-muted mb-8">
              Built by creators, used by creators
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatTile
                value={formatStat(stats.clipsTotal)}
                label="cinematic clips made"
                accent
              />
              <StatTile
                value={formatStat(stats.postsPublished)}
                label="posts published to social"
              />
              <StatTile
                value={
                  stats.hoursProcessed > 0
                    ? `${formatStat(stats.hoursProcessed)} hr`
                    : "—"
                }
                label="of source video clipped"
              />
            </div>
          </div>
        </section>
      )}

      {/* How it works (compact) — back to off-white default */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
              Three steps.{" "}
              <span
                className="font-normal italic text-foreground-secondary"
                style={{ fontFamily: "var(--font-serif), serif" }}
              >
                No editor required.
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                n: "01",
                title: "Paste a URL",
                body: "Drop in a YouTube link. Klone downloads, transcribes, and reads the room.",
                icon: <Wand2 className="w-4 h-4" />,
              },
              {
                n: "02",
                title: "Get cinematic clips",
                body: "Vertical 9:16, face-tracked, captioned, scored. Three hook variants per clip.",
                icon: <Scissors className="w-4 h-4" />,
              },
              {
                n: "03",
                title: "Auto-schedule",
                body: "Pick platforms and a date range — Klone fans the clips out at each platform's best time.",
                icon: <Clock className="w-4 h-4" />,
              },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-lg bg-card border border-border p-6 card-glow"
              >
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="text-3xl font-normal italic text-muted tabular-nums leading-none"
                    style={{ fontFamily: "var(--font-serif), serif" }}
                  >
                    {s.n}
                  </span>
                  <div className="w-7 h-7 rounded-md bg-foreground/5 flex items-center justify-center text-foreground">
                    {s.icon}
                  </div>
                </div>
                <h3 className="text-sm font-semibold mb-1.5 tracking-tight">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:opacity-80 transition-opacity"
            >
              See the full walkthrough
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ — cool stone bg, slightly different from the warm beige
          earlier. Cool tone reads "informational" vs the warm "emphasis." */}
      <section className="py-24 px-6 bg-section-cool">
        <div className="max-w-3xl mx-auto">
          <div className="mb-12">
            <h2 className="text-4xl font-semibold tracking-tight">
              Common questions
            </h2>
          </div>
          <div className="space-y-3">
            {faq.map((item) => (
              <details
                key={item.q}
                className="group rounded-lg bg-card border border-border px-5 py-4 open:border-border-hover transition-colors"
              >
                <summary className="cursor-pointer text-sm font-medium flex items-center justify-between gap-4 list-none">
                  {item.q}
                  <span className="text-muted-foreground text-xs group-open:rotate-180 transition-transform">
                    ▾
                  </span>
                </summary>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — closes the loop with the same warm ambient as the hero.
          Visually links the start and end of the page. */}
      <section className="hero-ambient py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Stop editing. Start{" "}
            <span
              className="font-normal italic text-muted-foreground"
              style={{ fontFamily: "var(--font-serif), serif" }}
            >
              posting.
            </span>
          </h2>
          <p className="text-muted-foreground mt-4 text-base">
            Free during beta. Sign up, paste a URL, watch it work.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-5 py-2.5 mt-8 rounded-md bg-foreground hover:bg-foreground-secondary text-background text-sm font-medium transition-all active:scale-[0.98]"
          >
            Start clipping free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </>
  );
}

function StatTile({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  /** Highlighted middle tile — uses serif numerals for visual rhythm. */
  accent?: boolean;
}) {
  return (
    <div className="relative rounded-lg border border-border bg-card p-8 text-center card-glow">
      <p
        className="text-5xl md:text-6xl font-normal tracking-tight tabular-nums leading-none"
        style={accent ? { fontFamily: "var(--font-serif), serif" } : undefined}
      >
        {value}
      </p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-3 font-medium">
        {label}
      </p>
    </div>
  );
}

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
