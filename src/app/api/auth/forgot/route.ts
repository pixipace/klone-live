import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min

export async function POST(request: NextRequest) {
  // Throttle aggressive guessing
  const ip = getClientIp(request);
  const limit = checkRateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }

  const { email } = (await request.json()) as { email?: string };
  const normalized =
    typeof email === "string" ? email.toLowerCase().trim() : "";

  if (!normalized) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  // ALWAYS respond with success to prevent email enumeration. Quietly skip
  // if no account matches.
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (user && !user.banned) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL || "https://klone.live"}/reset-password?token=${token}`;
    const tmpl = passwordResetEmail(user.name || "", resetUrl);
    await sendEmail({
      to: user.email,
      subject: tmpl.subject,
      html: tmpl.html,
    });
  }

  return NextResponse.json({ success: true });
}
