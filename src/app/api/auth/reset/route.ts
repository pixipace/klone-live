import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/email";

const APP_URL = process.env.NEXTAUTH_URL || "https://klone.live";

export async function POST(request: NextRequest) {
  const { token, password } = (await request.json()) as {
    token?: string;
    password?: string;
  };

  if (typeof token !== "string" || token.length < 32) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (password.length > 128) {
    return NextResponse.json({ error: "Password is too long" }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  }
  if (record.usedAt) {
    return NextResponse.json({ error: "This link was already used" }, { status: 400 });
  }
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: "This link has expired. Request a new one." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Capture user info for the post-reset alert email BEFORE the
  // password hash changes (we need the email + name).
  const targetUser = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { email: true, name: true },
  });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        lastSecurityEventAt: new Date(),
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate any other unused tokens for this user
    prisma.passwordResetToken.updateMany({
      where: {
        userId: record.userId,
        usedAt: null,
        id: { not: record.id },
      },
      data: { usedAt: new Date() },
    }),
  ]);

  // CONFIRMATION email — best-effort, doesn't block the response.
  // Standard security practice: alert the user any time the password
  // changes, so an attacker who reset the password CAN'T do it
  // silently. Even if attacker took over the email too, this is
  // deliberately redundant defense.
  if (targetUser) {
    const greeting = targetUser.name ? `Hey ${targetUser.name},` : "Hey,";
    const when = new Date().toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    const html = emailShell({
      preview: "Your Klone password was just changed.",
      body: `
        <p style="margin:0 0 16px 0;font-size:16px;font-weight:600;">${greeting}</p>
        <p style="margin:0 0 16px 0;">Your Klone password was just changed at <strong>${when}</strong>.</p>
        <p style="margin:0 0 16px 0;color:#c14545;font-size:14px;"><strong>Wasn't you?</strong> Reset it again immediately and review your connected social accounts. Reply to this email if you need help.</p>
      `,
      ctaText: "Open Klone",
      ctaUrl: `${APP_URL}/dashboard/settings`,
    });
    sendEmail({
      to: targetUser.email,
      subject: "Your Klone password was changed",
      html,
    }).catch((err) => console.warn("[reset] confirmation email failed:", err));
  }

  return NextResponse.json({ success: true });
}
