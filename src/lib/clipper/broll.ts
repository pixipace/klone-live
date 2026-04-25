import { spawn } from "child_process";
import { readFile, mkdir } from "fs/promises";
import path from "path";
import { pickBrollMoments, scoreBrollImageMatch, type BrollMomentPick } from "@/lib/ai";
import { searchBroll, downloadToCache, type BrollImageHit } from "./broll-search";

export type BrollOverlayInput = {
  /** Output-timeline seconds when the overlay appears. */
  startSec: number;
  /** Output-timeline seconds when it disappears. */
  endSec: number;
  /** Path to the rendered PiP-ready PNG (full 1080x1920 transparent canvas). */
  framePath: string;
  /** What was searched (kept for debug + saved on Clip). */
  query: string;
  /** Where the source image came from. */
  source: string;
  /** Attribution string to surface in UI / clip caption (or null). */
  attribution: string | null;
};

const QUALITY_THRESHOLD = 6;
const MIN_DURATION = 2.0;

/**
 * Resolve B-roll moments for one clip:
 *   1. Ask Gemma which moments deserve a visual reference.
 *   2. For each moment, search free sources for candidate images.
 *   3. Quality-gate each candidate via Gemma vision (skip below threshold).
 *   4. Render the corner PiP frame as a transparent PNG ready for ffmpeg overlay.
 *
 * Returns an empty array if anything fails — B-roll is purely additive, never
 * blocks a clip from rendering.
 */
export async function resolveClipBroll(opts: {
  segments: Array<{ start: number; end: number; text: string }>;
  clipStart: number;
  clipEnd: number;
  /** Output (post-silence-trim) duration. We must clamp to this. */
  outputDur: number;
  workDir: string;
  clipId: string;
  /** Cumulative seconds of silence removed before each input-time t.
   *  Used to convert moment times from input-relative → output-relative. */
  silenceMappingFn?: (inputT: number) => number;
}): Promise<BrollOverlayInput[]> {
  const {
    segments,
    clipStart,
    clipEnd,
    outputDur,
    workDir,
    clipId,
    silenceMappingFn,
  } = opts;

  let picks: BrollMomentPick[] = [];
  try {
    picks = await pickBrollMoments(segments, clipStart, clipEnd, 3);
  } catch (err) {
    console.warn(`[broll] pickBrollMoments failed for ${clipId}:`, err);
    return [];
  }
  if (picks.length === 0) return [];

  const brollDir = path.join(workDir, `broll-${clipId}`);
  await mkdir(brollDir, { recursive: true });

  const overlays: BrollOverlayInput[] = [];
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];

    // Convert pick times (clip-input-relative) to output-relative.
    const outStart = silenceMappingFn
      ? Math.max(4.5, pick.startSec - silenceMappingFn(pick.startSec))
      : pick.startSec;
    const outEnd = silenceMappingFn
      ? Math.max(outStart + MIN_DURATION, pick.endSec - silenceMappingFn(pick.endSec))
      : pick.endSec;
    const clampedEnd = Math.min(outEnd, outputDur - 0.3);
    if (clampedEnd - outStart < MIN_DURATION) continue;

    let chosen: { hit: BrollImageHit; cachedPath: string } | null = null;

    let candidates: BrollImageHit[] = [];
    try {
      candidates = await searchBroll(pick.query, pick.type);
    } catch (err) {
      console.warn(`[broll] search failed for "${pick.query}":`, err);
      continue;
    }

    for (const hit of candidates) {
      const cached = await downloadToCache(hit.url);
      if (!cached) continue;

      // Quality gate via Gemma vision
      let score = 0;
      try {
        const buf = await readFile(cached);
        const b64 = buf.toString("base64");
        score = await scoreBrollImageMatch(b64, pick.query);
      } catch (err) {
        console.warn(`[broll] score failed for ${hit.url}:`, err);
        continue;
      }
      if (score >= QUALITY_THRESHOLD) {
        chosen = { hit, cachedPath: cached };
        break;
      }
    }

    if (!chosen) continue;

    // Render the corner PiP frame
    const framePath = path.join(brollDir, `frame-${i + 1}.png`);
    try {
      await renderBrollFrame(chosen.cachedPath, framePath);
    } catch (err) {
      console.warn(`[broll] render failed for ${chosen.hit.url}:`, err);
      continue;
    }

    overlays.push({
      startSec: outStart,
      endSec: clampedEnd,
      framePath,
      query: pick.query,
      source: chosen.hit.source,
      attribution: chosen.hit.attribution,
    });
  }

  return overlays;
}

const PYTHON_BIN = process.env.PYTHON_BIN || "/opt/homebrew/bin/python3";
const RENDER_SCRIPT = path.join(process.cwd(), "scripts", "render-broll-frame.py");

function renderBrollFrame(srcImage: string, outPng: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [RENDER_SCRIPT, srcImage, outPng]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`render-broll-frame exited ${code}: ${stderr.slice(-300)}`));
    });
    child.on("error", reject);
  });
}
