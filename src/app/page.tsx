import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
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

export default function HomePage() {
  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-accent/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-40 left-1/4 w-[300px] h-[300px] bg-accent/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border/60 text-[11px] text-muted-foreground mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Free during beta — no credit card
          </div>

          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.02]">
            Long video in.
            <br />
            <span className="text-muted-foreground font-light">
              Short clips out.
            </span>
          </h1>

          <p className="text-base text-muted-foreground mt-6 max-w-xl mx-auto leading-relaxed">
            Klone turns your YouTube videos into vertical, captioned, scored
            short-form clips — then schedules them across TikTok, Instagram,
            YouTube, Facebook, and LinkedIn at the best time for each.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Start clipping free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center px-6 py-3 rounded-xl bg-card border border-border/60 hover:border-border-hover text-sm font-medium transition-colors"
            >
              See how it works
            </Link>
          </div>

          <div className="flex items-center justify-center gap-2 mt-10 flex-wrap">
            <span className="text-[11px] text-muted">Posts to</span>
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
        </div>
      </section>

      {/* Clip preview visual */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-2xl bg-card border border-border/60 p-1 shadow-2xl shadow-black/30">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-b from-accent/20 to-transparent pointer-events-none" />
            <div className="relative rounded-xl bg-background border border-border/40 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-error/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-warning/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-success/40" />
                </div>
                <span className="text-[10px] text-muted ml-2 font-mono">
                  klone.live/dashboard/clipper
                </span>
              </div>

              {/* Clipper canvas mock */}
              <div className="grid grid-cols-12 gap-4 p-6">
                {/* Source video */}
                <div className="col-span-7 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted">
                    Source video
                  </div>
                  <div className="aspect-video rounded-lg bg-gradient-to-br from-accent/15 via-card to-card border border-border/40 relative overflow-hidden flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                      <div className="w-0 h-0 border-l-[10px] border-l-white/80 border-y-[7px] border-y-transparent ml-1" />
                    </div>
                    <div className="absolute bottom-2 left-2 right-2 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full w-1/3 bg-accent/70" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                      Transcribing
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-card border border-border/60">
                      Picking 6 clips
                    </span>
                  </div>
                </div>

                {/* Generated clips */}
                <div className="col-span-5 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted">
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
                        className="aspect-[9/16] rounded-md bg-gradient-to-b from-accent/10 to-card border border-border/40 relative overflow-hidden"
                      >
                        <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/60 text-[8px] text-white font-medium">
                          {c.score}
                        </div>
                        <div className="absolute bottom-1 left-1 right-1 text-[7px] text-white/80 font-medium leading-tight">
                          {c.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md bg-card border border-border/40 p-2 space-y-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted">
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
                          <span className="text-muted-foreground">
                            {p.name}
                          </span>
                        </div>
                        <span className="text-muted font-mono">9:00 AM</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clipper features */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-medium uppercase tracking-wider mb-4">
              <Scissors className="w-3 h-3" />
              The clipper
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              An editor, in a box.
            </h2>
            <p className="text-muted-foreground mt-3 text-sm max-w-lg mx-auto">
              Klone does what a freelance editor would do — face tracking,
              captions, music, hook titles — without the back-and-forth.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {clipperFeatures.map((f) => (
              <div
                key={f.title}
                className="rounded-xl bg-card border border-border/60 p-5 hover:border-border-hover transition-all card-glow"
              >
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-3">
                  {f.icon}
                </div>
                <h3 className="text-sm font-medium mb-1.5">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Distribution features */}
      <section className="py-20 px-6 border-t border-border/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-medium uppercase tracking-wider mb-4">
              <Share2 className="w-3 h-3" />
              The distribution
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Five platforms. One queue.
            </h2>
            <p className="text-muted-foreground mt-3 text-sm max-w-lg mx-auto">
              When the clips are ready, they go where your audience already
              scrolls — at the time they actually scroll.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {distributionFeatures.map((f) => (
              <div
                key={f.title}
                className="rounded-xl bg-card border border-border/60 p-5 hover:border-border-hover transition-all card-glow"
              >
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-3">
                  {f.icon}
                </div>
                <h3 className="text-sm font-medium mb-1.5">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works (compact) */}
      <section className="py-20 px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Three steps. No editor required.
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
                className="rounded-xl bg-card border border-border/60 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-mono text-muted">{s.n}</span>
                  <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center text-accent">
                    {s.icon}
                  </div>
                </div>
                <h3 className="text-sm font-medium mb-1.5">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
            >
              See the full walkthrough
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 border-t border-border/30">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-semibold tracking-tight">
              Common questions
            </h2>
          </div>
          <div className="space-y-3">
            {faq.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl bg-card border border-border/60 px-5 py-4 open:border-border-hover transition-colors"
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

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center relative">
          <div className="absolute inset-0 -m-20 bg-accent/5 rounded-full blur-[80px] pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Stop editing. Start posting.
            </h2>
            <p className="text-muted-foreground mt-3 text-sm">
              Free during beta. Sign up, paste a URL, watch it work.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 mt-8 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Start clipping free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
