import type { Clip } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type PlatformId,
  ALL_PLATFORMS,
} from "@/lib/platforms";
import { nextSlots, distributeClipsByDay } from "@/lib/posting-times";
import { suggestHashtags } from "@/lib/ai";

const PLATFORM_SET = new Set<PlatformId>(ALL_PLATFORMS);

export type DistributeOptions = {
  userId: string;
  clips: Clip[];
  platforms: PlatformId[];
  clipsPerDay: number;
  skipWeekends: boolean;
  /** ISO 8601 date-time string for when to start scheduling. */
  startAt?: Date;
  /** Add AI hashtags per (clip × platform). Slower but better captions. */
  withAiHashtags?: boolean;
};

export type DistributeResult = {
  scheduled: number;
  firstAt: Date | null;
  lastAt: Date | null;
  postIds: string[];
};

/**
 * Schedule posts for each (clip × platform) combo, picking each platform's
 * best time slot on the assigned day. Returns the created Post row IDs and
 * the schedule range.
 */
export async function autoDistributeClips(
  opts: DistributeOptions
): Promise<DistributeResult> {
  const platforms = opts.platforms.filter((p) => PLATFORM_SET.has(p));
  if (platforms.length === 0 || opts.clips.length === 0) {
    return { scheduled: 0, firstAt: null, lastAt: null, postIds: [] };
  }

  const startAt = opts.startAt ?? new Date(Date.now() + 30 * 60 * 1000); // 30min from now
  const dayAssignment = distributeClipsByDay(opts.clips.length, Math.max(1, opts.clipsPerDay));

  // For each platform, compute enough slots upfront. Total needed =
  // unique-days the clips span. We over-provision by 5 to be safe.
  const totalSlotsNeeded = (Math.max(...dayAssignment) + 1) * 3 + 5;
  const platformSlots: Record<string, Date[]> = {};
  for (const platform of platforms) {
    platformSlots[platform] = nextSlots(platform, totalSlotsNeeded, startAt, {
      skipWeekends: opts.skipWeekends,
    });
  }

  // Track per-platform slot pointer (which slot we're using next)
  const cursors: Record<string, number> = {};
  for (const p of platforms) cursors[p] = 0;

  const created: { id: string; scheduledFor: Date }[] = [];

  for (let i = 0; i < opts.clips.length; i += 1) {
    const clip = opts.clips[i];
    const dayIndex = dayAssignment[i];

    for (const platform of platforms) {
      // Find next slot for this platform that's at least on the assigned day
      const slots = platformSlots[platform];
      const targetDay = new Date(startAt);
      targetDay.setDate(targetDay.getDate() + dayIndex);
      targetDay.setHours(0, 0, 0, 0);

      let chosen: Date | undefined;
      while (cursors[platform] < slots.length) {
        const candidate = slots[cursors[platform]];
        if (candidate.getTime() >= targetDay.getTime()) {
          chosen = candidate;
          cursors[platform] += 1;
          break;
        }
        cursors[platform] += 1;
      }

      if (!chosen) {
        // Fallback: schedule N days out
        chosen = new Date(targetDay);
        chosen.setHours(12, 0, 0, 0);
      }

      // Caption: hook title + (optional) AI hashtags
      let caption = clip.hookTitle;
      if (opts.withAiHashtags) {
        try {
          const tags = await suggestHashtags(clip.hookTitle, platform, 5);
          if (tags.length > 0) caption = `${caption}\n\n${tags.join(" ")}`;
        } catch (err) {
          console.warn(`[distribute] hashtag gen failed for ${clip.id}/${platform}:`, err);
        }
      }

      const post = await prisma.post.create({
        data: {
          userId: opts.userId,
          caption,
          mediaUrl: clip.videoPath,
          mediaType: "video",
          platforms: platform,
          status: "SCHEDULED",
          scheduledFor: chosen,
        },
      });
      created.push({ id: post.id, scheduledFor: chosen });
    }
  }

  if (created.length === 0) {
    return { scheduled: 0, firstAt: null, lastAt: null, postIds: [] };
  }

  created.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

  return {
    scheduled: created.length,
    firstAt: created[0].scheduledFor,
    lastAt: created[created.length - 1].scheduledFor,
    postIds: created.map((c) => c.id),
  };
}
