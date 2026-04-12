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
          "inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-accent hover:bg-accent-hover text-white": variant === "primary",
            "bg-card hover:bg-card-hover text-foreground border border-border":
              variant === "secondary",
            "border border-border hover:border-border-hover text-foreground bg-transparent":
              variant === "outline",
            "text-muted-foreground hover:text-foreground bg-transparent":
              variant === "ghost",
            "bg-error/10 hover:bg-error/20 text-error border border-error/20":
              variant === "danger",
          },
          {
            "text-xs px-3 py-1.5": size === "sm",
            "text-sm px-4 py-2": size === "md",
            "text-base px-6 py-3": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
