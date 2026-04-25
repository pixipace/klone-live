import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const secretValue = process.env.NEXTAUTH_SECRET;
if (!secretValue || secretValue.length < 32) {
  throw new Error(
    "NEXTAUTH_SECRET must be set and at least 32 chars. Generate with: openssl rand -base64 32"
  );
}
const secret = new TextEncoder().encode(secretValue);

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  credits: number;
  role?: string;
}

/**
 * Owner-only check — reads OWNER_EMAIL env var and matches against the
 * session's email. Even a DB-promoted ADMIN role is blocked unless the
 * email matches. Set OWNER_EMAIL in .env.local.
 *
 * Also re-reads banned status from DB so a banned owner is still blocked
 * (defense-in-depth — shouldn't happen but).
 */
export async function requireAdmin(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  const ownerEmail = (process.env.OWNER_EMAIL || "").toLowerCase().trim();
  if (!ownerEmail) {
    console.error(
      "[requireAdmin] OWNER_EMAIL env var not set — admin access disabled"
    );
    return null;
  }
  if (session.email.toLowerCase() !== ownerEmail) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { banned: true },
  });
  if (!user || user.banned) return null;

  return session;
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret);

  (await cookies()).set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload as { user: SessionUser }).user;
  } catch {
    return null;
  }
}

export async function deleteSession() {
  (await cookies()).delete("session");
}
