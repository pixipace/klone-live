import { spawn } from "child_process";
import type { WhisperSegment } from "./types";

/**
 * Run FFmpeg scene-change detection over the source. Returns a list of
 * timestamps (seconds) where the visual content materially changes — i.e.
 * shot boundaries. These are the most visually interesting moments to
 * cut TO because they're where the producer's eye already wanted to
 * draw the viewer's attention.
 *
 * Cheap: one full pass at ~5x realtime (60s for a 5-min source). Returned
 * timestamps are pre-jittered +0.4s past the boundary so we land mid-shot
 * rather than mid-transition.
 */
export async function detectSceneChanges(
  sourceVideoPath: string,
  threshold: number = 0.3,
): Promise<number[]> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", [
      "-i", sourceVideoPath,
      "-vf", `select='gt(scene,${threshold})',showinfo`,
      "-f", "null",
      "-",
    ]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", () => {
      const matches = stderr.matchAll(/pts_time:([\d.]+)/g);
      const ts: number[] = [];
      for (const m of matches) {
        const t = parseFloat(m[1]);
        if (!isNaN(t) && t > 0) ts.push(t + 0.4);
      }
      resolve(ts);
    });
    child.on("error", () => resolve([]));
  });
}

/**
 * One short silent video segment cut from the source. Multiple of these
 * may chain together to fill a single narration line — better than
 * stretching one source clip with setpts (which slows real motion and
 * looks AI-generated).
 */
export type SourceSegment = {
  /** Start timestamp in the source video (seconds). */
  startSec: number;
  /** End timestamp in the source video (seconds). */
  endSec: number;
  /** "aligned" = picked because it matches a script line's content (e.g.
   *  the moment the speaker actually said the thing we're paraphrasing).
   *  "filler" = picked for visual variety, not content-aligned. */
  kind: "aligned" | "filler";
};

const MIN_SHOT = 1.4;
const MAX_SHOT = 2.8;
/** A narration line longer than this gets BROKEN UP into multiple shots
 *  back-to-back instead of one stretched shot. Real editors rarely hold a
 *  single shot longer than ~3s in short-form video. */
const SHOT_TARGET = 2.3;
/** Two consecutive picks must be at least this far apart in source time
 *  to feel like distinct visual moments — closer = looks like one shot
 *  awkwardly cut twice. */
const MIN_GAP_SEC = 4.0;

function clampDuration(start: number, end: number): { start: number; end: number } | null {
  const dur = end - start;
  if (dur < MIN_SHOT) return null;
  if (dur <= MAX_SHOT) return { start, end };
  // Centre-trim long segments to MAX_SHOT
  const mid = (start + end) / 2;
  return { start: mid - MAX_SHOT / 2, end: mid + MAX_SHOT / 2 };
}

/**
 * Pick a stack of source-video segments to play under a narration script.
 * Hybrid strategy (per product decision):
 *   1. ALIGNED — for each script line, look for a transcript segment whose
 *      text overlaps with the line's keywords or visualHint. Use that
 *      moment, trimmed to MAX_SHOT.
 *   2. FILLER — when no good alignment is found OR we'd be reusing the
 *      same source moment twice, pick a visually-distinct timestamp from
 *      the source's "topic window" (Insight.startSec..endSec) instead.
 *
 * Returns one SourceSegment per script line. Total length should ≈ sum of
 * narration TTS audio durations + small breathing room.
 *
 * Note: source video is MUTED in the composer, so picks here only need
 * to be visually-distinct. We don't care if the source audio is talking
 * over the same paraphrased point — viewer never hears it.
 */
export function pickSourceSegments(
  scriptLines: { text: string; visualHint: string }[],
  transcriptSegments: WhisperSegment[],
  topicWindow: { startSec: number; endSec: number },
  sourceDurationSec: number,
  /** Optional pre-detected scene-change timestamps from FFmpeg. When
   *  available, these become the PRIORITY filler pool — landing the cut
   *  on a producer-chosen shot boundary looks much more intentional than
   *  evenly-spaced filler that might be mid-action or mid-pan. */
  sceneChangeTimestamps: number[] = [],
): SourceSegment[] {
  const used: { startSec: number; endSec: number }[] = [];
  const out: SourceSegment[] = [];

  // Pre-filter transcript to the topic window — we never want a cutaway
  // from a totally unrelated chapter of the source.
  const inWindow = transcriptSegments.filter(
    (s) => s.end > topicWindow.startSec && s.start < topicWindow.endSec,
  );

  // Build the filler pool, in order of preference:
  //   1) Scene-change timestamps WITHIN the topic window — visually
  //      interesting + topically relevant
  //   2) Scene-change timestamps OUTSIDE the topic window — visually
  //      interesting fallback
  //   3) Evenly-spaced timestamps across the source (last resort)
  const fillerCenters: number[] = [];
  const safeStart = 1.0;
  const safeEnd = Math.max(safeStart + 5, sourceDurationSec - 1.0);

  const inWinScenes = sceneChangeTimestamps.filter(
    (t) => t >= Math.max(safeStart, topicWindow.startSec) && t <= Math.min(safeEnd, topicWindow.endSec),
  );
  const outOfWinScenes = sceneChangeTimestamps.filter(
    (t) => t >= safeStart && t <= safeEnd && (t < topicWindow.startSec || t > topicWindow.endSec),
  );
  for (const t of inWinScenes) fillerCenters.push(t);
  for (const t of outOfWinScenes) fillerCenters.push(t);

  // Even-spacing fallback only kicks in if scene detection found very few.
  if (fillerCenters.length < scriptLines.length) {
    const winStart = Math.max(safeStart, topicWindow.startSec);
    const winEnd = Math.min(safeEnd, topicWindow.endSec);
    const winDur = Math.max(0, winEnd - winStart);
    const winCount = Math.min(scriptLines.length, 8);
    if (winDur > MIN_SHOT) {
      for (let i = 0; i < winCount; i++) {
        const c = winStart + (winDur * (i + 0.5)) / winCount;
        if (!fillerCenters.some((e) => Math.abs(e - c) < MIN_GAP_SEC)) fillerCenters.push(c);
      }
    }
    const fullCount = Math.max(scriptLines.length * 2, 12);
    const fullDur = safeEnd - safeStart;
    if (fullDur > MIN_SHOT) {
      for (let i = 0; i < fullCount; i++) {
        const c = safeStart + (fullDur * (i + 0.5)) / fullCount;
        if (!fillerCenters.some((e) => Math.abs(e - c) < MIN_GAP_SEC)) fillerCenters.push(c);
      }
    }
  }
  let fillerCursor = 0;

  function tooClose(s: number, e: number): boolean {
    return used.some((u) => Math.abs((u.startSec + u.endSec) / 2 - (s + e) / 2) < MIN_GAP_SEC);
  }

  function nextFiller(): SourceSegment | null {
    // Two passes — first respecting the MIN_GAP_SEC dedupe, then loosening
    // it if we still have lines to fill (better visual variety than reusing
    // the same hardcoded fallback for every remaining line).
    for (const respectGap of [true, false]) {
      let cursor = respectGap ? fillerCursor : 0;
      while (cursor < fillerCenters.length) {
        const c = fillerCenters[cursor++];
        const start = Math.max(safeStart, c - MAX_SHOT / 2);
        const end = Math.min(safeEnd, start + MAX_SHOT);
        if (end - start < MIN_SHOT) continue;
        if (respectGap && tooClose(start, end)) continue;
        if (respectGap) fillerCursor = cursor;
        used.push({ startSec: start, endSec: end });
        return { startSec: start, endSec: end, kind: "filler" };
      }
    }
    return null;
  }

  for (const line of scriptLines) {
    // Build a small set of keywords to look for: nouns/proper nouns from
    // the line + the visualHint. Naive — split, lowercase, drop stopwords.
    const text = `${line.text} ${line.visualHint}`.toLowerCase();
    const keywords = text
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

    let aligned: SourceSegment | null = null;
    if (keywords.length > 0) {
      // Score each transcript segment by how many keywords appear.
      let best: { seg: WhisperSegment; score: number } | null = null;
      for (const seg of inWindow) {
        const segText = seg.text.toLowerCase();
        let score = 0;
        for (const k of keywords) {
          if (segText.includes(k)) score++;
        }
        if (score === 0) continue;
        const clamped = clampDuration(seg.start, seg.end);
        if (!clamped) continue;
        if (tooClose(clamped.start, clamped.end)) continue;
        if (!best || score > best.score) best = { seg, score };
      }
      if (best) {
        const clamped = clampDuration(best.seg.start, best.seg.end);
        if (clamped) {
          used.push({ startSec: clamped.start, endSec: clamped.end });
          aligned = { startSec: clamped.start, endSec: clamped.end, kind: "aligned" };
        }
      }
    }

    // Last-resort fallback: if even the loosened nextFiller exhausted, jitter
    // the topic window center so duplicates at least look slightly different
    // (different millisecond offset → different first frame).
    const jitter = (out.length * 0.7) % Math.max(0.1, sourceDurationSec - safeStart - MAX_SHOT);
    out.push(
      aligned ?? nextFiller() ?? {
        startSec: safeStart + jitter,
        endSec: safeStart + jitter + MAX_SHOT,
        kind: "filler",
      },
    );
  }

  return out;
}

const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "they",
  "their",
  "them",
  "then",
  "than",
  "what",
  "which",
  "when",
  "where",
  "while",
  "would",
  "could",
  "should",
  "about",
  "really",
  "thing",
  "things",
  "people",
  "going",
  "because",
  "actually",
  "literally",
  "always",
  "never",
  "still",
  "every",
  "whole",
  "other",
  "another",
  "different",
  "important",
  "doing",
  "being",
  "after",
  "before",
  "during",
  "between",
  "through",
]);
