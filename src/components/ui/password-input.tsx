"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
  hint?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, error, hint, ...props }, ref) => {
    const [show, setShow] = useState(false);
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-sm font-medium text-muted-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={show ? "text" : "password"}
            className={cn(
              "w-full bg-card border border-border rounded-lg px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted",
              "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent",
              "transition-colors",
              error && "border-error focus:ring-error/50 focus:border-error",
              className
            )}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export function scorePassword(pw: string): {
  score: number;
  label: PasswordStrength;
  hint: string;
} {
  if (pw.length === 0) return { score: 0, label: "weak", hint: "" };

  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (pw.length >= 16) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 1;

  // Penalty for very common patterns
  if (/^[a-z]+$/i.test(pw) || /^\d+$/.test(pw)) score = Math.max(0, score - 2);
  if (/^password|qwerty|12345|abc123/i.test(pw)) score = 0;

  let label: PasswordStrength;
  let hint: string;
  if (score <= 1) {
    label = "weak";
    hint =
      pw.length < 8
        ? `${8 - pw.length} more character${8 - pw.length === 1 ? "" : "s"} needed`
        : "Add numbers, symbols, or mixed case";
  } else if (score <= 3) {
    label = "fair";
    hint = "Decent — longer + symbols would be stronger";
  } else if (score <= 4) {
    label = "good";
    hint = "Good password";
  } else {
    label = "strong";
    hint = "Strong password ✓";
  }

  return { score, label, hint };
}

export function StrengthMeter({ password }: { password: string }) {
  if (password.length === 0) return null;
  const { label, hint } = scorePassword(password);
  const colors: Record<PasswordStrength, string> = {
    weak: "bg-error",
    fair: "bg-warning",
    good: "bg-accent",
    strong: "bg-success",
  };
  const widths: Record<PasswordStrength, string> = {
    weak: "w-1/4",
    fair: "w-2/4",
    good: "w-3/4",
    strong: "w-full",
  };
  return (
    <div className="space-y-1">
      <div className="h-1 bg-card rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-300 ease-out",
            colors[label],
            widths[label]
          )}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        <span
          className={cn(
            "font-medium",
            label === "weak" && "text-error",
            label === "fair" && "text-warning",
            label === "good" && "text-accent",
            label === "strong" && "text-success"
          )}
        >
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </span>
        {" — "}
        {hint}
      </p>
    </div>
  );
}
