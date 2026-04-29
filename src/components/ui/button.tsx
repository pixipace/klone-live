import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // Base — sharp 6px radius, semibold weight, snappy 150ms transitions
          "inline-flex items-center justify-center font-medium rounded-md transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
          {
            // PRIMARY: black-on-white aesthetic — solid foreground bg,
            // inverted text. EL-style restraint: accent reserved for
            // links + brand moments, not every CTA.
            "bg-foreground hover:bg-foreground-secondary text-background": variant === "primary",
            // SECONDARY: white card with subtle border, hovers to surface
            "bg-card hover:bg-card-hover text-foreground border border-border":
              variant === "secondary",
            // OUTLINE: transparent with border — for tertiary actions
            "border border-border hover:border-border-hover hover:bg-card text-foreground bg-transparent":
              variant === "outline",
            // GHOST: text-only, surfaces on hover. Toolbar-style.
            "text-muted-foreground hover:text-foreground hover:bg-card bg-transparent":
              variant === "ghost",
            // DANGER: muted red, reserved for destructive actions only
            "bg-error-soft hover:bg-error/15 text-error border border-error/20":
              variant === "danger",
          },
          {
            // Sharper, tighter sizing than before — EL uses small buttons
            "text-xs px-2.5 py-1.5 gap-1.5": size === "sm",
            "text-sm px-3.5 py-2 gap-2": size === "md",
            "text-sm px-5 py-2.5 gap-2": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
