import Link from "next/link";
import Image from "next/image";

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-b border-border">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-14">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Image src="/logo-icon.png" alt="Klone" width={22} height={22} />
          <span className="text-sm font-semibold tracking-tight">Klone</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7">
          <Link
            href="/how-it-works"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/#features"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
        </nav>
        <div className="flex items-center gap-1">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
          >
            Log in
          </Link>
          {/* CTA: black, not blue. EL pattern — accent reserved for emphasis,
              not for every CTA. Active scale gives tactile feedback. */}
          <Link
            href="/signup"
            className="text-sm font-medium bg-foreground hover:bg-foreground-secondary text-background px-4 py-1.5 rounded-md transition-all active:scale-[0.98]"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
