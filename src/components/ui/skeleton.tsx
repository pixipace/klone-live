/**
 * Skeleton loader primitive. Use INSTEAD of "Loading..." text — gives
 * the page structure to render into while data loads, so the layout
 * doesn't jump on hydration.
 *
 * Animated via CSS `animate-pulse` (Tailwind built-in). The pulse
 * opacity oscillates between 50%-100% so it reads as "loading" without
 * being flashy.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-foreground/8 rounded-md ${className}`}
      aria-hidden="true"
    />
  );
}

/** Common skeleton shapes — use these instead of hand-rolling sizes for
 *  consistency. */
export function SkeletonText({ lines = 1, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-5 ${className}`}>
      <Skeleton className="h-4 w-1/3 mb-3" />
      <SkeletonText lines={3} />
    </div>
  );
}
