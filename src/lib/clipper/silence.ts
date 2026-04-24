import type { WhisperSegment } from "./types";

export type Gap = { startSec: number; endSec: number };

const MIN_GAP_SEC = 0.5;
const TRIM_PADDING_SEC = 0.1;

/**
 * Find silent gaps in a clip (relative to clip start time).
 * Uses Whisper segments — gaps between segments where no speech detected.
 */
export function findSilentGaps(
  segments: WhisperSegment[],
  clipStart: number,
  clipEnd: number
): Gap[] {
  const inClip = segments
    .filter((s) => s.end > clipStart && s.start < clipEnd)
    .map((s) => ({
      start: Math.max(s.start, clipStart) - clipStart,
      end: Math.min(s.end, clipEnd) - clipStart,
    }))
    .sort((a, b) => a.start - b.start);

  const gaps: Gap[] = [];
  let prevEnd = 0;
  const clipDuration = clipEnd - clipStart;

  for (const seg of inClip) {
    const gap = seg.start - prevEnd;
    if (gap > MIN_GAP_SEC) {
      gaps.push({
        startSec: prevEnd + TRIM_PADDING_SEC,
        endSec: seg.start - TRIM_PADDING_SEC,
      });
    }
    prevEnd = seg.end;
  }

  // Trailing silence
  const trailing = clipDuration - prevEnd;
  if (trailing > MIN_GAP_SEC) {
    gaps.push({
      startSec: prevEnd + TRIM_PADDING_SEC,
      endSec: clipDuration - 0.05,
    });
  }

  return gaps.filter((g) => g.endSec > g.startSec + 0.1);
}

/**
 * Build a select filter expression that drops the given gaps.
 * Returns "1" (keep all) if no gaps.
 */
export function buildSelectExpr(gaps: Gap[]): string {
  if (gaps.length === 0) return "1";
  // Keep frames where the time is NOT inside any gap.
  const conditions = gaps
    .map((g) => `between(t,${g.startSec.toFixed(3)},${g.endSec.toFixed(3)})`)
    .join("+");
  return `not(${conditions})`;
}

export function totalRemovedSec(gaps: Gap[]): number {
  return gaps.reduce((sum, g) => sum + (g.endSec - g.startSec), 0);
}
