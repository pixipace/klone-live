/**
 * Best-time-to-post matrix per platform.
 * Hours are LOCAL to the audience timezone.
 * Days: 0=Sun, 1=Mon, ..., 6=Sat
 *
 * Sources: 2025-2026 industry research (Buffer, Sprout Social, Later)
 * — generally agree on these windows. Refine with real engagement data
 * later when we have it.
 */

import type { PlatformId } from "@/lib/platforms";

type Slot = { day: number; hour: number };

const ANY_WEEKDAY = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const PLATFORM_BEST_TIMES: Record<PlatformId, Slot[]> = {
  linkedin: ANY_WEEKDAY.flatMap((day) => [
    { day, hour: 8 },
    { day, hour: 12 },
    { day, hour: 17 },
  ]),
  facebook: ANY_WEEKDAY.flatMap((day) => [
    { day, hour: 9 },
    { day, hour: 13 },
  ]),
  instagram: ALL_DAYS.flatMap((day) => [
    { day, hour: 11 },
    { day, hour: 14 },
    { day, hour: 19 },
  ]),
  tiktok: ALL_DAYS.flatMap((day) => [
    { day, hour: 9 },
    { day, hour: 19 },
    { day, hour: 22 },
  ]),
  youtube: ALL_DAYS.flatMap((day) => [
    { day, hour: 12 },
    { day, hour: 20 },
  ]),
};

/**
 * Pick the next N posting slots for a platform after `after`, in the given
 * timezone. Adds ±15min jitter to each slot so it doesn't look automated.
 *
 * Returns Date objects in UTC (the browser/server can render in any TZ).
 */
export function nextSlots(
  platform: PlatformId,
  count: number,
  after: Date = new Date(),
  options: {
    timezone?: string;
    skipWeekends?: boolean;
    minIntervalHours?: number;
  } = {}
): Date[] {
  const slots = PLATFORM_BEST_TIMES[platform];
  if (!slots || slots.length === 0) return [];

  const { skipWeekends = false, minIntervalHours = 4 } = options;

  // Build candidate slots over the next 30 days
  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset < 30; dayOffset += 1) {
    const date = new Date(after.getTime() + dayOffset * 86400 * 1000);
    const dayOfWeek = date.getDay();
    if (skipWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

    for (const slot of slots) {
      if (slot.day !== dayOfWeek) continue;
      const candidate = new Date(date);
      // ±15min jitter
      const jitterMin = Math.floor(Math.random() * 30) - 15;
      candidate.setHours(slot.hour, jitterMin, 0, 0);
      if (candidate.getTime() > after.getTime() + 60 * 1000) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => a.getTime() - b.getTime());

  // Enforce min spacing
  const picked: Date[] = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    const last = picked[picked.length - 1];
    if (!last || c.getTime() - last.getTime() >= minIntervalHours * 3600 * 1000) {
      picked.push(c);
    }
  }

  return picked;
}

/**
 * Distribute N clips across `clipsPerDay` clips per day, returning the
 * day index assigned to each clip (0 = first day, 1 = second day, etc.)
 */
export function distributeClipsByDay(
  totalClips: number,
  clipsPerDay: number
): number[] {
  const result: number[] = [];
  for (let i = 0; i < totalClips; i += 1) {
    result.push(Math.floor(i / clipsPerDay));
  }
  return result;
}
