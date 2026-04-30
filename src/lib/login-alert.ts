import crypto from "crypto";
import { sendEmail } from "@/lib/email";
import { newSignInEmail } from "@/lib/email-templates";

/** Hash the user-agent into a stable per-device fingerprint. We don't
 *  store the raw UA — long, leaky, useless. SHA-256 → 16 hex chars
 *  is plenty unique across the user's typical 2-3 devices. */
export function uaFingerprint(userAgent: string | null | undefined): string {
  if (!userAgent) return "";
  return crypto
    .createHash("sha256")
    .update(userAgent)
    .digest("hex")
    .slice(0, 16);
}

/** Pretty-format the user-agent into "Chrome on macOS" style for
 *  the alert email. Doesn't pretend to be perfect — covers ~95% of
 *  real-world browsers. The fallback "a browser" is fine. */
export function describeUa(userAgent: string | null | undefined): string {
  if (!userAgent) return "a browser";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
    ? "Opera"
    : /Chrome\//.test(userAgent) && !/Chromium/.test(userAgent)
    ? "Chrome"
    : /Safari\//.test(userAgent) && !/Chrome/.test(userAgent)
    ? "Safari"
    : /Firefox\//.test(userAgent)
    ? "Firefox"
    : "a browser";
  const os = /Windows NT/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent) || /Macintosh/.test(userAgent)
    ? "macOS"
    : /iPhone|iPad|iPod/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
    ? "Android"
    : /Linux/.test(userAgent)
    ? "Linux"
    : "a device";
  return `${browser} on ${os}`;
}

/** Look up city + country for an IP. Best-effort — failure returns
 *  "Unknown location" without throwing so login still completes.
 *  Uses ip-api.com (free, no key, 45 req/min — fine for login traffic).
 *  Skips local IPs (127.0.0.1, 192.x, 10.x) which return junk. */
export async function lookupGeo(ip: string): Promise<string> {
  if (!ip) return "Unknown location";
  // Private + localhost ranges — geo lookup returns nothing useful
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip === "unknown"
  ) {
    return "Local network";
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,country`, {
      // 2s budget — login should never block on geo lookup
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return "Unknown location";
    const data = (await res.json()) as { status?: string; city?: string; country?: string };
    if (data.status !== "success") return "Unknown location";
    const parts = [data.city, data.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Unknown location";
  } catch {
    return "Unknown location";
  }
}

/** Fire a "new sign-in" alert email if this device is unfamiliar.
 *  Compares the new UA fingerprint to the user's stored one.
 *  Sends nothing on first-ever login (lastLoginUaHash null) only if
 *  options.skipFirstLogin is true — by default we DO alert so the
 *  user sees the system working from day one. */
export async function maybeSendNewSignInAlert(opts: {
  user: { id: string; email: string; name: string | null; lastLoginUaHash: string | null };
  newUaHash: string;
  newUa: string | null;
  newIp: string;
  skipFirstLogin?: boolean;
}): Promise<boolean> {
  const { user, newUaHash, newUa, newIp, skipFirstLogin = false } = opts;

  // Same device as last time → quietly succeed.
  if (user.lastLoginUaHash === newUaHash && newUaHash !== "") return false;

  // First login on a fresh account — opt-out via skipFirstLogin (e.g.
  // the signup flow itself, where the welcome email is enough).
  if (!user.lastLoginUaHash && skipFirstLogin) return false;

  const device = describeUa(newUa);
  const location = await lookupGeo(newIp);
  const tmpl = newSignInEmail({
    name: user.name || "",
    device,
    location,
    ip: newIp || "unknown",
    at: new Date(),
  });
  try {
    await sendEmail({ to: user.email, subject: tmpl.subject, html: tmpl.html });
    return true;
  } catch (err) {
    console.warn("[login-alert] send failed:", err);
    return false;
  }
}
