import { ReactNode } from "react";
import Link from "next/link";

/**
 * Empty-state pattern. Replaces the "No X yet" plain-text scattered
 * across dashboard pages. Three slots:
 *   - icon (required) — visual anchor, use a lucide icon
 *   - title (required) — one-line "what's missing"
 *   - description (optional) — 1-2 sentences explaining why / what next
 *   - action (optional) — primary CTA href + label
 *
 * Use sparingly — empty states are easy to over-decorate. The default
 * style is intentionally restrained: muted icon in a soft pill,
 * sentence-case title, minimal CTA. Resist the urge to add illustrations
 * unless the page truly benefits.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center text-foreground-secondary mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center justify-center mt-5 px-4 py-2 rounded-md bg-foreground hover:bg-foreground-secondary text-background text-sm font-medium transition-all active:scale-[0.98]"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
