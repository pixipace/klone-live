import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secretValue = process.env.NEXTAUTH_SECRET;
if (!secretValue || secretValue.length < 32) {
  throw new Error(
    "NEXTAUTH_SECRET must be set and at least 32 chars. Generate with: openssl rand -base64 32"
  );
}
const secret = new TextEncoder().encode(secretValue);

// Public routes a logged-in user should be auto-redirected away from.
// Marketing homepage + auth pages are useless once you're in. /pricing
// and /how-it-works stay reachable so users can still review them.
const REDIRECT_TO_DASHBOARD = new Set(["/", "/login", "/signup"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect dashboard + control-room routes
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/control-room")) {
    const token = request.cookies.get("session")?.value;

    if (!token) {
      // Preserve the intended destination so the user lands back here
      // after login (instead of always dumping them on /dashboard).
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  // Auto-redirect logged-in users away from public landing pages.
  // Catches the case where someone bookmarks klone.live, lands there,
  // and has to manually click "Dashboard" — now they go straight in.
  if (REDIRECT_TO_DASHBOARD.has(pathname)) {
    const token = request.cookies.get("session")?.value;
    if (token) {
      try {
        await jwtVerify(token, secret);
        return NextResponse.redirect(new URL("/dashboard", request.url));
      } catch {
        // Invalid/expired session — let them through to login or the
        // public homepage instead of bouncing them in a loop.
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/control-room/:path*", "/login", "/signup"],
};
