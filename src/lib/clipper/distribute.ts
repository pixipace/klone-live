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
  /** User-defined hashtags always prepended to AI tags, deduped, capped
   * at platform max. Each item with or without leading #. */
  userHashtags?: string[];
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

      // Caption: hook title + (optional) AI hashtags + (always) user tags.
      // Per-platform max comes from suggestHashtags itself; we cap the
      // combined list to the same number after dedupe.
      let caption = clip.hookTitle;
      const userTags = (opts.userHashtags ?? [])
        .map(normalizeTag)
        .filter((t): t is string => t !== null);

      if (opts.withAiHashtags || userTags.length > 0) {
        let aiTags: string[] = [];
        if (opts.withAiHashtags) {
          try {
            aiTags = await suggestHashtags(clip.hookTitle, platform, 8, {
              transcript: clip.transcript ?? undefined,
            });
          } catch (err) {
            console.warn(`[distribute] hashtag gen failed for ${clip.id}/${platform}:`, err);
          }
        }
        // Combine: user tags FIRST (always shown — they're the user's
        // explicit signal), AI tags fill remaining slots up to platform max.
        const combined = mergeTags(userTags, aiTags, platformTagCap(platform));
        if (combined.length > 0) caption = `${caption}\n\n${combined.join(" ")}`;
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

/** Normalize a user-typed hashtag: trim, drop spaces inside, ensure # prefix.
 *  Returns null for empty/junk so callers can filter. */
function normalizeTag(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, "");
  if (!cleaned) return null;
  const withHash = cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
  // Strip any non-tag chars (keep underscore + alphanum + #)
  const safe = withHash.replace(/[^#\w]/g, "");
  return safe.length > 1 ? safe : null;
}

function platformTagCap(platform: PlatformId): number {
  switch (platform) {
    case "facebook":
      return 2;
    case "linkedin":
      return 4;
    case "tiktok":
      return 5;
    case "youtube":
      return 5;
    case "instagram":
      return 10;
    default:
      return 5;
  }
}

/** Combine user tags + AI tags. User tags ALWAYS come first (user's
 *  explicit signal wins). Dedupe case-insensitively. Cap at platform max. */
function mergeTags(userTags: string[], aiTags: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of [...userTags, ...aiTags]) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}
