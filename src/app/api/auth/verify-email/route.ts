import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailVerificationEmail } from "@/lib/email-templates";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const APP_URL = process.env.NEXTAUTH_URL || "https://klone.live";
const VERIFY_TTL_HOURS = 24;

/**
 * GET /api/auth/verify-email?token=...
 *
 * Email-link landing — single click consumes the token, marks the user
 * verified, and redirects to /dashboard with a success flash. Failures
 * redirect to /dashboard with an error flash so the user can ask for a
 * new email via the resend button there.
 *
 * Token lookup is constant-time-ish (Prisma index on emailVerifyToken)
 * and the token itself is 32 random bytes (256 bits) so brute force
 * isn't feasible. Token is cleared on success to prevent replay.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token.length < 32) {
    return NextResponse.redirect(
      new URL("/dashboard?verify=invalid", APP_URL),
    );
  }

  const user = await prisma.user.findUnique({
    where: { emailVerifyToken: token },
  });

  if (!user) {
    return NextResponse.redirect(new URL("/dashboard?verify=invalid", APP_URL));
  }

  // Already verified — idempotent success (helps users who click the
  // link twice or refresh the success page).
  if (user.emailVerified) {
    return NextResponse.redirect(
      new URL("/dashboard?verify=already", APP_URL),
    );
  }

  if (user.emailVerifyTokenExpires && user.emailVerifyTokenExpires.getTime() < Date.now()) {
    return NextResponse.redirect(new URL("/dashboard?verify=expired", APP_URL));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: new Date(),
      emailVerifyToken: null,
      emailVerifyTokenExpires: null,
      lastSecurityEventAt: new Date(),
    },
  });

  return NextResponse.redirect(new URL("/dashboard?verify=success", APP_URL));
}

/**
 * POST /api/auth/verify-email
 *
 * Resend the verification email. Rate-limited per session AND per IP so
 * neither a logged-in user nor an attacker can flood Resend by mashing
 * the resend button. Issues a fresh token (invalidates the previous).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ip = getClientIp(request);
  // 3 resends per hour per (user, ip) — generous enough for typos + email
  // delivery delays, tight enough to prevent abuse.
  const userLimit = checkRateLimit(`verify-resend:user:${session.id}`, 3, 60 * 60 * 1000);
  const ipLimit = checkRateLimit(`verify-resend:ip:${ip}`, 10, 60 * 60 * 1000);
  if (!userLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many resend requests. Try again in an hour." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.emailVerified) {
    return NextResponse.json({
      success: true,
      alreadyVerified: true,
    });
  }

  const newToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyToken: newToken,
      emailVerifyTokenExpires: new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${newToken}`;
  const tmpl = emailVerificationEmail(user.name || "", verifyUrl);
  try {
    await sendEmail({ to: user.email, subject: tmpl.subject, html: tmpl.html });
  } catch (err) {
    console.error("[verify-email resend] send failed:", err);
    return NextResponse.json(
      { error: "Could not send the verification email — try again in a few minutes" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
