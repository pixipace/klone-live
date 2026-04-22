import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secretValue = process.env.NEXTAUTH_SECRET;
if (!secretValue || secretValue.length < 32) {
  throw new Error(
    "NEXTAUTH_SECRET must be set and at least 32 chars. Generate with: openssl rand -base64 32"
  );
}
const secret = new TextEncoder().encode(secretValue);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect dashboard routes
  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get("session")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Redirect logged-in users away from login/signup
  if (pathname === "/login" || pathname === "/signup") {
    const token = request.cookies.get("session")?.value;
    if (token) {
      try {
        await jwtVerify(token, secret);
        return NextResponse.redirect(new URL("/dashboard", request.url));
      } catch {
        // Invalid token, let them through to login
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
