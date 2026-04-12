import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  size = "default",
  className,
}: {
  size?: "small" | "default" | "large";
  className?: string;
}) {
  const sizes = {
    small: { width: 24, height: 24, text: "text-base" },
    default: { width: 32, height: 32, text: "text-lg" },
    large: { width: 40, height: 40, text: "text-xl" },
  };

  const s = sizes[size];

  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <Image
        src="/logo-icon.png"
        alt="Klone"
        width={s.width}
        height={s.height}
        className="rounded"
      />
      <span className={cn("font-semibold tracking-tight", s.text)}>
        KLONE
      </span>
    </Link>
  );
}
