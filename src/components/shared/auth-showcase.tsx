import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

const platformIcons = [
  { name: "X", bg: "#000000", text: "𝕏" },
  { name: "TikTok", bg: "#00f2ea", text: "♪" },
  { name: "LinkedIn", bg: "#0077b5", text: "in" },
  { name: "Instagram", bg: "#e4405f", text: "📷" },
  { name: "Facebook", bg: "#1877f2", text: "f" },
  { name: "YouTube", bg: "#ff0000", text: "▶" },
];

export function AuthShowcase({
  title,
  subtitle,
  bullets,
}: {
  title: string;
  subtitle: string;
  bullets: string[];
}) {
  return (
    <div className="hidden lg:flex relative overflow-hidden bg-card border-l border-border">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-transparent to-transparent pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      {/* Dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative flex flex-col justify-between p-12 w-full">
        {/* Top: Big logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-accent/30 blur-2xl" />
            <div className="relative w-12 h-12 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center">
              <Image src="/logo-icon.png" alt="Klone" width={28} height={28} />
            </div>
          </div>
          <span className="text-xl font-bold tracking-tight">KLONE</span>
        </div>

        {/* Middle: Big visual element */}
        <div className="my-12">
          {/* Floating glow card */}
          <div className="relative max-w-md">
            {/* Outer glow */}
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-accent/40 to-accent/0 blur-xl" />

            {/* Main card */}
            <div className="relative rounded-2xl border border-border bg-background/80 backdrop-blur-sm p-6">
              <div className="flex items-center gap-2 pb-4 border-b border-border">
                <div className="w-2.5 h-2.5 rounded-full bg-error/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-warning/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-success/50" />
                <span className="ml-2 text-xs text-muted">klone.live/dashboard/create</span>
              </div>

              {/* Mock UI */}
              <div className="pt-4 space-y-3">
                <div className="text-xs text-muted-foreground">Select platforms</div>
                <div className="flex flex-wrap gap-2">
                  {platformIcons.map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-card text-xs"
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center text-[8px] text-white font-bold"
                        style={{ backgroundColor: p.bg }}
                      >
                        {p.text}
                      </div>
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-1.5">Caption</div>
                  <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
                    Sharing my journey of building a SaaS in public...
                    <span className="inline-block w-1 h-3 bg-accent ml-0.5 animate-pulse" />
                  </div>
                </div>

                <div className="pt-1">
                  <div className="rounded-md bg-accent text-white text-xs font-medium text-center py-2">
                    Post Now
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Text + bullets */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight leading-tight">
            {title}
          </h2>
          <p className="text-muted-foreground mt-3 max-w-md">{subtitle}</p>
          <ul className="space-y-2.5 mt-6">
            {bullets.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2.5 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
