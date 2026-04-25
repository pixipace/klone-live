import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import {
  ArrowRight,
  Link as LinkIcon,
  Mic,
  Brain,
  Scissors,
  Type,
  Music,
  Calendar,
  Send,
} from "lucide-react";

export const metadata: Metadata = {
  title: "How it works — Klone",
  description:
    "From a YouTube URL to scheduled clips on five platforms — every step Klone runs for you.",
};

const steps = [
  {
    icon: <LinkIcon className="w-4 h-4" />,
    title: "Paste a YouTube URL",
    body: "Drop a link in the dashboard. Klone downloads the source video in the background — you can close the tab.",
    detail: "Supports any public YouTube video. Long-form podcasts, talks, vlogs, lessons, interviews — anything with a clear speaker.",
  },
  {
    icon: <Mic className="w-4 h-4" />,
    title: "Transcribe every word",
    body: "Whisper large-v3-turbo runs locally and produces word-level timestamps — no per-minute API fees, no quotas.",
    detail: "We cache the transcript on the job, so re-picking clips is instant.",
  },
  {
    icon: <Brain className="w-4 h-4" />,
    title: "AI scores viral moments",
    body: "Gemma reads the transcript and picks 4–8 standalone moments — hooks, insights, story beats, payoffs.",
    detail: "Each pick gets a virality score, a mood tag, and three hook variants ready to swap.",
  },
  {
    icon: <Scissors className="w-4 h-4" />,
    title: "Cut to vertical with face tracking",
    body: "FFmpeg cuts the moment, OpenCV finds the speaker, and the crop follows the face — not the center of the frame.",
    detail: "Punch zooms lift on emphasis. A subtle color grade and vignette cinematicize the source footage.",
  },
  {
    icon: <Type className="w-4 h-4" />,
    title: "Burn in word-by-word captions",
    body: "Karaoke-style captions render at proper word timing. No third-party caption tool. No re-typing.",
    detail: "Hook title burns in for the first ~3 seconds with a subtle whoosh — exactly how Opus / Tally / hand-edited shorts look.",
  },
  {
    icon: <Music className="w-4 h-4" />,
    title: "Mood-matched music + SFX",
    body: "AI reads the clip's energy and picks a track from the matching mood folder. Sidechain compression ducks music under speech.",
    detail: "Attribution lines auto-append to the post caption when the track requires it.",
  },
  {
    icon: <Calendar className="w-4 h-4" />,
    title: "Auto-distribute across platforms",
    body: "Pick platforms and a date range. Klone schedules each clip at the slot that performs best on each one.",
    detail: "Audience-timezone aware. Optional weekend skipping. Optional minimum hours between posts on the same platform.",
  },
  {
    icon: <Send className="w-4 h-4" />,
    title: "Post and notify",
    body: "Background scheduler picks up due posts, uploads natively to each platform, and emails you when it's live.",
    detail: "Failed posts auto-retry. Connection-expired accounts get badged on /accounts so you can re-auth before it bites.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Navbar />

      <section className="relative pt-32 pb-12 px-6">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-accent/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-medium uppercase tracking-wider mb-5">
            How it works
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            URL in. Posts scheduled.
          </h1>
          <p className="text-base text-muted-foreground mt-5 max-w-xl mx-auto leading-relaxed">
            Eight steps run in the background after you paste a link. Here&apos;s
            what each one actually does.
          </p>
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="max-w-3xl mx-auto">
          <ol className="relative border-l border-border/40 ml-3 space-y-3">
            {steps.map((s, i) => (
              <li key={s.title} className="pl-8 relative">
                <div className="absolute -left-4 top-5 w-7 h-7 rounded-full bg-card border border-border/60 flex items-center justify-center text-accent">
                  {s.icon}
                </div>
                <div className="rounded-xl bg-card border border-border/60 p-5">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-[10px] font-mono text-muted">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2 className="text-sm font-medium">{s.title}</h2>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {s.body}
                  </p>
                  <p className="text-[11px] text-muted mt-2 leading-relaxed border-t border-border/30 pt-2">
                    {s.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What you control */}
      <section className="py-16 px-6 border-t border-border/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold tracking-tight mb-6 text-center">
            What you actually control
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                t: "Per-job toggles",
                b: "Captions on/off, music on/off, punch zooms on/off, max clips, max duration — all set when you submit the URL.",
              },
              {
                t: "Custom hook titles",
                b: "Don't like the AI's three options? Type your own — it'll re-render only the hook overlay, not the whole clip.",
              },
              {
                t: "Re-pick without re-rendering",
                b: "Cached transcript means re-running the AI on a new pick costs seconds, not minutes.",
              },
              {
                t: "Schedule overrides",
                b: "Auto-distribute is a default — every post is editable in the queue if you want to move it.",
              },
            ].map((b) => (
              <div
                key={b.t}
                className="rounded-xl bg-card border border-border/60 p-5"
              >
                <h3 className="text-sm font-medium mb-1.5">{b.t}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {b.b}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Ready to try it on your own video?
          </h2>
          <p className="text-muted-foreground mt-3 text-sm">
            Sign up and paste a URL. The first clip lands in your dashboard in
            minutes.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 mt-8 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
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
