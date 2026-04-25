import { Cog, DollarSign, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ControlRoomSettingsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Global settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          App-wide configuration. Changes here affect all users.
        </p>
      </div>

      <Section icon={DollarSign} title="Pricing tiers">
        <Stub
          message="Stripe is not yet wired. Once it is, this section becomes a price editor for Free / Pro / Agency tiers including monthly/annual switches."
        />
      </Section>

      <Section icon={Cog} title="Default user limits">
        <Stub
          message="Defaults applied when a user has no per-user override (per-user override lives on the user detail page)."
          rows={[
            "Free: 3 clip jobs / month, 10 posts / day",
            "Pro: 50 clip jobs / month, unlimited posts",
            "Agency: 200 clip jobs / month, unlimited posts, 5 brands",
          ]}
        />
      </Section>

      <Section icon={Cog} title="System-wide feature flags">
        <Stub
          message="Toggle features for ALL users at once (e.g., turn off the clipper while you do maintenance). Currently each user has individual toggles on their detail page."
        />
      </Section>

      <Section icon={AlertCircle} title="Danger zone">
        <Stub
          message="Future: bulk export, bulk delete by criteria, force re-OAuth all users, broadcast email."
        />
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium mb-3 inline-flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Stub({
  message,
  rows,
}: {
  message: string;
  rows?: string[];
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-5">
      <p className="text-sm text-muted-foreground">{message}</p>
      {rows && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {rows.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <span className="text-muted">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted">Coming soon — placeholder for now</p>
    </div>
  );
}
