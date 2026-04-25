import { emailShell } from "./email";

const APP_URL = process.env.NEXTAUTH_URL || "https://klone.live";

export type DigestStats = {
  name: string | null;
  clipsThisWeek: number;
  postsPublished: number;
  postsScheduled: number;
  topPost: {
    caption: string;
    platform: string;
    url: string | null;
    views: number | null;
    likes: number | null;
  } | null;
  /** Total clips + posts ever — for the "to date" summary line. */
  clipsTotal: number;
  postsTotal: number;
};

export function weeklyDigestEmail(s: DigestStats) {
  const greeting = s.name ? `Hey ${s.name?.split(" ")[0]},` : "Hey,";
  const topPostBlock = s.topPost
    ? `
      <p style="margin:0 0 8px 0;"><strong>Top performer this week</strong></p>
      <div style="margin:0 0 20px 0;padding:12px 14px;background:#f8f8f8;border-radius:8px;">
        <p style="margin:0 0 6px 0;font-size:14px;color:#333;">${escape(s.topPost.caption.slice(0, 140))}${s.topPost.caption.length > 140 ? "…" : ""}</p>
        <p style="margin:0;font-size:13px;color:#666;">
          <strong style="color:#333;text-transform:capitalize;">${escape(s.topPost.platform)}</strong>
          ${s.topPost.views !== null ? ` · ${formatN(s.topPost.views)} views` : ""}
          ${s.topPost.likes !== null ? ` · ${formatN(s.topPost.likes)} likes` : ""}
          ${s.topPost.url ? ` · <a href="${s.topPost.url}" style="color:#a855f7;text-decoration:none;">view post</a>` : ""}
        </p>
      </div>`
    : "";

  return {
    subject: `Your Klone week: ${s.clipsThisWeek} clip${s.clipsThisWeek === 1 ? "" : "s"}, ${s.postsPublished} post${s.postsPublished === 1 ? "" : "s"}`,
    html: emailShell({
      preview: `${s.clipsThisWeek} clips made and ${s.postsPublished} posts published this week`,
      body: `
        <p style="margin:0 0 16px 0;font-size:18px;font-weight:600;">${greeting}</p>
        <p style="margin:0 0 20px 0;">Here's how your week went on Klone.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px 0;border-collapse:collapse;">
          <tr>
            <td style="padding:12px 14px;background:#f8f8f8;border-radius:8px;width:50%;vertical-align:top;">
              <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666;">Clips made</p>
              <p style="margin:6px 0 0 0;font-size:28px;font-weight:300;color:#111;">${s.clipsThisWeek}</p>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:12px 14px;background:#f8f8f8;border-radius:8px;width:50%;vertical-align:top;">
              <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666;">Posts published</p>
              <p style="margin:6px 0 0 0;font-size:28px;font-weight:300;color:#111;">${s.postsPublished}</p>
            </td>
          </tr>
        </table>
        ${
          s.postsScheduled > 0
            ? `<p style="margin:0 0 16px 0;font-size:14px;color:#666;">${s.postsScheduled} post${s.postsScheduled === 1 ? "" : "s"} scheduled to go out next week.</p>`
            : ""
        }
        ${topPostBlock}
        <p style="margin:0;font-size:13px;color:#666;">
          Lifetime: ${s.clipsTotal} clip${s.clipsTotal === 1 ? "" : "s"} · ${s.postsTotal} post${s.postsTotal === 1 ? "" : "s"} published.
        </p>
      `,
      ctaText: "Open my dashboard",
      ctaUrl: `${APP_URL}/dashboard`,
      footer: `You're getting this because weekly digests are on. <a href="${APP_URL}/dashboard/settings" style="color:#888;">Turn it off in Settings</a>.`,
    }),
  };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

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
