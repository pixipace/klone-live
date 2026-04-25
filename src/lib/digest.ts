/**
 * Weekly digest email — runs ONCE per user per week, summarizing their
 * clips made + posts published + top performer in the last 7 days.
 *
 * Triggered by the scheduler tick. Runs only inside a narrow weekly send
 * window (Monday 09:00–11:00 UTC) to avoid re-sending if the worker
 * restarts mid-day. lastDigestSentAt persisted so we never double-send.
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "./email";
import { weeklyDigestEmail, type DigestStats } from "./email-templates";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Iterate all users opted into weekly digests, send the digest if it
 * hasn't been sent in the last ~6 days. Returns the count of digests sent.
 */
export async function sendWeeklyDigests(): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      weeklyDigestEnabled: true,
      banned: false,
    },
    select: {
      id: true,
      email: true,
      name: true,
      lastDigestSentAt: true,
    },
  });

  let sent = 0;
  const cutoff = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

  for (const user of users) {
    if (user.lastDigestSentAt && user.lastDigestSentAt > cutoff) continue;

    try {
      const stats = await computeDigestStats(user.id, user.name);
      // Skip users who didn't do anything this week AND have no lifetime
      // history — pure inactives don't need an "0 clips, 0 posts" email.
      if (
        stats.clipsThisWeek === 0 &&
        stats.postsPublished === 0 &&
        stats.postsScheduled === 0 &&
        stats.clipsTotal === 0 &&
        stats.postsTotal === 0
      ) {
        continue;
      }

      const { subject, html } = weeklyDigestEmail(stats);
      const ok = await sendEmail({
        to: user.email,
        subject,
        html,
      });
      if (ok) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastDigestSentAt: new Date() },
        });
        sent += 1;
      }
    } catch (err) {
      console.warn(`[digest] failed for user ${user.id}:`, err);
    }
  }

  return sent;
}

async function computeDigestStats(
  userId: string,
  name: string | null
): Promise<DigestStats> {
  const weekAgo = new Date(Date.now() - WEEK_MS);

  const [clipsThisWeek, postsPublished, postsScheduled, clipsTotal, postsTotal, recentPosts] =
    await Promise.all([
      prisma.clip.count({
        where: { job: { userId }, createdAt: { gte: weekAgo } },
      }),
      prisma.post.count({
        where: {
          userId,
          status: { in: ["POSTED", "PARTIAL"] },
          postedAt: { gte: weekAgo },
        },
      }),
      prisma.post.count({
        where: {
          userId,
          status: "SCHEDULED",
          scheduledFor: { gte: new Date() },
        },
      }),
      prisma.clip.count({ where: { job: { userId } } }),
      prisma.post.count({
        where: { userId, status: { in: ["POSTED", "PARTIAL"] } },
      }),
      prisma.post.findMany({
        where: {
          userId,
          status: { in: ["POSTED", "PARTIAL"] },
          postedAt: { gte: weekAgo },
          metrics: { not: null },
        },
        select: {
          caption: true,
          platforms: true,
          results: true,
          metrics: true,
        },
      }),
    ]);

  // Pick the top-performing post by view count across all platforms
  let topPost: DigestStats["topPost"] = null;
  let bestViews = -1;
  for (const p of recentPosts) {
    if (!p.metrics) continue;
    let parsedM: Record<string, { views?: number; likes?: number }> = {};
    try {
      parsedM = JSON.parse(p.metrics);
    } catch {
      continue;
    }
    for (const [platform, m] of Object.entries(parsedM)) {
      const views = typeof m.views === "number" ? m.views : 0;
      if (views > bestViews) {
        let url: string | null = null;
        try {
          const r = JSON.parse(p.results || "{}") as Record<
            string,
            { url?: string }
          >;
          url = r[platform]?.url ?? null;
        } catch {
          // ignore
        }
        bestViews = views;
        topPost = {
          caption: p.caption || "(no caption)",
          platform,
          url,
          views: typeof m.views === "number" ? m.views : null,
          likes: typeof m.likes === "number" ? m.likes : null,
        };
      }
    }
  }

  return {
    name,
    clipsThisWeek,
    postsPublished,
    postsScheduled,
    topPost,
    clipsTotal,
    postsTotal,
  };
}

/**
 * Should we attempt the digest send right now? True only on Monday
 * UTC between 09:00 and 11:00 — narrow enough that a misfiring scheduler
 * won't trigger us at the wrong time of day, wide enough to catch the
 * tick reliably (scheduler polls every 60s).
 */
export function isDigestSendWindow(now: Date = new Date()): boolean {
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday
  if (day !== 1) return false;
  const hour = now.getUTCHours();
  return hour === 9 || hour === 10;
}
