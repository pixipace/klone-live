import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkRateLimit, resetRateLimit, getClientIp } from "@/lib/rate-limit";
import { uaFingerprint, maybeSendNewSignInAlert } from "@/lib/login-alert";
import bcrypt from "bcryptjs";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail =
      typeof email === "string" ? email.toLowerCase().trim() : "";

    const ip = getClientIp(request);
    const rateKey = `login:${ip}:${normalizedEmail}`;
    const limit = checkRateLimit(rateKey, MAX_ATTEMPTS, WINDOW_MS);

    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    resetRateLimit(rateKey);

    if (user.banned) {
      return NextResponse.json(
        { error: "Account is suspended. Contact support." },
        { status: 403 }
      );
    }

    await createSession({
      id: user.id,
      name: user.name || "",
      email: user.email,
      plan: user.plan,
      credits: user.credits,
      role: user.role,
    });

    // New-device alert + login fingerprint update.
    // - Compare incoming UA hash to stored one; if different (or first
    //   ever), email the user so they can spot account takeover.
    // - Geo lookup is best-effort with a 2s timeout — login completes
    //   even if the lookup hangs.
    // - Update fingerprint + last login fields regardless so the next
    //   login from the same device stays silent.
    const ua = request.headers.get("user-agent");
    const newHash = uaFingerprint(ua);
    // Fire alert + DB update in parallel; both await before response so
    // the user sees the success only AFTER state is consistent.
    await Promise.all([
      maybeSendNewSignInAlert({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          lastLoginUaHash: user.lastLoginUaHash,
        },
        newUaHash: newHash,
        newUa: ua,
        newIp: ip,
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginUaHash: newHash,
          lastLoginIp: ip,
          lastLoginAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
