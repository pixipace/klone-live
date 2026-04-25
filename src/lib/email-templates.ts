import { emailShell } from "./email";

const APP_URL = process.env.NEXTAUTH_URL || "https://klone.live";

export function welcomeEmail(name: string) {
  const greeting = name ? `Hey ${name},` : "Hey,";
  return {
    subject: "Welcome to Klone 👋",
    html: emailShell({
      preview: "You're in. Three steps to your first viral clip.",
      body: `
        <p style="margin:0 0 16px 0;font-size:18px;font-weight:600;">${greeting}</p>
        <p style="margin:0 0 16px 0;">You're in. Klone turns long videos into cinematic short clips ready for every platform — and now schedules them automatically.</p>
        <p style="margin:0 0 8px 0;"><strong>Three steps to your first clip:</strong></p>
        <ol style="margin:0 0 20px 0;padding-left:20px;">
          <li style="margin-bottom:6px;">Connect a social account (LinkedIn, IG, Facebook)</li>
          <li style="margin-bottom:6px;">Paste a YouTube URL — Klone picks viral moments + auto-edits cinematic 9:16 vertical clips</li>
          <li>Hit "Auto-distribute" → walk away. Klone schedules each clip across platforms at the best times</li>
        </ol>
        <p style="margin:0;color:#666;font-size:14px;">Reply to this email if you get stuck — I read everything.</p>
      `,
      ctaText: "Open my dashboard",
      ctaUrl: `${APP_URL}/dashboard`,
    }),
  };
}

export function passwordResetEmail(name: string, resetUrl: string) {
  const greeting = name ? `Hey ${name},` : "Hey,";
  return {
    subject: "Reset your Klone password",
    html: emailShell({
      preview: "Click the button to set a new password.",
      body: `
        <p style="margin:0 0 16px 0;font-size:16px;font-weight:600;">${greeting}</p>
        <p style="margin:0 0 16px 0;">Someone asked to reset the password for your Klone account. If that was you, click the button below to set a new password.</p>
        <p style="margin:0 0 16px 0;color:#666;font-size:14px;">This link expires in 30 minutes. If you didn't request this, you can ignore this email — your password stays the same.</p>
      `,
      ctaText: "Set a new password",
      ctaUrl: resetUrl,
    }),
  };
}

export function postPublishedEmail(
  name: string,
  caption: string,
  platforms: string[],
  links: Array<{ platform: string; url?: string }>
) {
  const platformList = platforms.join(", ");
  const linkRows = links
    .filter((l) => l.url)
    .map(
      (l) =>
        `<li style="margin-bottom:6px;"><a href="${l.url}" style="color:#0A7CFF;text-decoration:none;">View on ${l.platform}</a></li>`
    )
    .join("");

  return {
    subject: `Your post just published to ${platformList}`,
    html: emailShell({
      preview: "Your scheduled post just went live.",
      body: `
        <p style="margin:0 0 16px 0;font-size:16px;font-weight:600;">${name ? `Hey ${name},` : "Hey,"}</p>
        <p style="margin:0 0 16px 0;">Your scheduled post just published to <strong>${platformList}</strong>:</p>
        <blockquote style="margin:0 0 16px 0;padding:14px 18px;background:#f7f7f7;border-left:3px solid #0A7CFF;border-radius:6px;color:#333;font-size:14px;">${caption.slice(0, 280)}${caption.length > 280 ? "…" : ""}</blockquote>
        ${linkRows ? `<p style="margin:0 0 8px 0;"><strong>View it live:</strong></p><ul style="margin:0;padding-left:20px;">${linkRows}</ul>` : ""}
      `,
      ctaText: "See all my posts",
      ctaUrl: `${APP_URL}/dashboard/posts`,
    }),
  };
}
