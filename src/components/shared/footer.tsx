import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-border py-10 px-6 mt-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Image
              src="/logo-icon.png"
              alt="Klone"
              width={20}
              height={20}
              className="opacity-60"
            />
            <span className="text-xs text-muted">&copy; 2026 Klone</span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link
              href="/how-it-works"
              className="text-xs text-muted hover:text-muted-foreground transition-colors"
            >
              How it works
            </Link>
            <Link
              href="/pricing"
              className="text-xs text-muted hover:text-muted-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/privacy"
              className="text-xs text-muted hover:text-muted-foreground transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-muted hover:text-muted-foreground transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/data-deletion"
              className="text-xs text-muted hover:text-muted-foreground transition-colors"
            >
              Data Deletion
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
