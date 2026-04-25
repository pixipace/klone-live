import { Resend } from "resend";

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "Klone <onboarding@resend.dev>";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!RESEND_KEY) return null;
  if (!client) client = new Resend(RESEND_KEY);
  return client;
}

export type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

/**
 * Send an email via Resend. Returns { ok: true, id } on success or
 * { ok: false, error } on failure. Never throws — caller can decide
 * whether email failure should propagate.
 *
 * If RESEND_API_KEY is not set, logs a warning and returns ok=false.
 */
export async function sendEmail(
  payload: EmailPayload
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const c = getClient();
  if (!c) {
    console.warn("[email] RESEND_API_KEY not set — email skipped");
    return { ok: false, error: "Email not configured" };
  }
  try {
    const res = await c.emails.send({
      from: FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    if (res.error) {
      console.error("[email] resend error:", res.error);
      return { ok: false, error: res.error.message || "send failed" };
    }
    return { ok: true, id: res.data?.id || "" };
  } catch (err) {
    console.error("[email] unexpected error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * Wrap content in a brand-consistent shell. Inline styles only — most
 * email clients strip <style> tags.
 */
export function emailShell({
  preview,
  body,
  ctaText,
  ctaUrl,
  footer = "Klone — your social media on autopilot.",
}: {
  preview: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  footer?: string;
}): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${preview}</title>
<style>@media (prefers-color-scheme: dark){body{background:#0a0a0a;color:#fff}}</style>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:28px 32px 0 32px;">
        <div style="display:inline-flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:8px;background:#0A7CFF;display:inline-block;"></div>
          <span style="font-size:18px;font-weight:700;color:#111;letter-spacing:-0.01em;">KLONE</span>
        </div>
      </td></tr>
      <tr><td style="padding:24px 32px;color:#222;font-size:15px;line-height:1.55;">
        ${body}
        ${
          ctaText && ctaUrl
            ? `<div style="margin:28px 0 8px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#0A7CFF;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">${ctaText}</a></div>`
            : ""
        }
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;color:#888;font-size:12px;line-height:1.5;border-top:1px solid #eee;padding-top:18px;">
        ${footer}
      </td></tr>
    </table>
    <div style="color:#999;font-size:11px;margin-top:14px;">© ${new Date().getFullYear()} Klone</div>
  </td></tr>
</table>
</body></html>`;
}
