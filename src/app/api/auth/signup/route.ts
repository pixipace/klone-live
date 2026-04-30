import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { welcomeEmail, emailVerificationEmail } from "@/lib/email-templates";
import bcrypt from "bcryptjs";

const APP_URL = process.env.NEXTAUTH_URL || "https://klone.live";
const VERIFY_TTL_HOURS = 24;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limit = checkRateLimit(`signup:${ip}`, 10, 60 * 60 * 1000);
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many signups from this network. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { name, email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== "string" || !emailRe.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (password.length > 128) {
      return NextResponse.json(
        { error: "Password is too long" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Issue a single-use verification token. Stored on the User row
    // (not a separate table) — simpler since each user has at most one
    // pending verification at a time and we only ever look it up by
    // token from the email link.
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenExpires = new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        name: name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        passwordHash,
        emailVerifyToken: verifyToken,
        emailVerifyTokenExpires: verifyTokenExpires,
      },
    });

    // Create the session right away so the new user lands in the
    // dashboard. Sensitive ops (post publishing, account connect) can
    // gate on emailVerified later — for now we let them explore + show
    // an "Verify your email" banner on the dashboard.
    await createSession({
      id: user.id,
      name: user.name || "",
      email: user.email,
      plan: user.plan,
      credits: user.credits,
      role: user.role,
    });

    // Send verification email FIRST (the important one), then welcome.
    // Both are best-effort — failure doesn't block signup since user can
    // request a fresh verification link from the dashboard banner.
    const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${verifyToken}`;
    const verifyTmpl = emailVerificationEmail(user.name || "", verifyUrl);
    sendEmail({ to: user.email, subject: verifyTmpl.subject, html: verifyTmpl.html }).catch(
      (err) => console.warn("[signup] verification email failed:", err),
    );
    const tmpl = welcomeEmail(user.name || "");
    sendEmail({ to: user.email, subject: tmpl.subject, html: tmpl.html }).catch(
      (err) => console.warn("[signup] welcome email failed:", err),
    );

    return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
