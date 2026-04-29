import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-sm font-medium text-muted-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            // White surface, sharp 6px radius, refined hover state
            "w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted",
            "hover:border-border-hover",
            // Focus: subtle accent ring, NOT chunky
            "focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent",
            "transition-all",
            error && "border-error focus:ring-error focus:border-error",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
