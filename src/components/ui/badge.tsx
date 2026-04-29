import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error" | "accent";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        // Tighter padding, smaller text — EL badges are subtle markers,
        // not buttons. Solid-tinted backgrounds (no borders) read cleaner
        // on light surfaces.
        "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium tracking-tight",
        {
          "bg-card text-muted-foreground border border-border":
            variant === "default",
          "bg-success-soft text-success": variant === "success",
          "bg-warning-soft text-warning": variant === "warning",
          "bg-error-soft text-error": variant === "error",
          "bg-accent-soft text-accent": variant === "accent",
        },
        className
      )}
      {...props}
    />
  );
}
