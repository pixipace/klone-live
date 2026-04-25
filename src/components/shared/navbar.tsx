import Link from "next/link";
import Image from "next/image";

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/60 backdrop-blur-xl border-b border-border/30">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-14">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-icon.png" alt="Klone" width={22} height={22} />
          <span className="text-sm font-semibold tracking-tight">KLONE</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/how-it-works"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/#features"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-xs font-medium bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
