import { spawn } from "child_process";
import path from "path";
import type { WhisperSegment } from "./types";

const SCRIPT_PATH = path.join(process.cwd(), "scripts", "render-captions.py");

export type CaptionWord = {
  start: number;
  end: number;
  text: string;
};

export type RenderResult = {
  framesDir: string;
  framePattern: string;
  fps: number;
  frames: number;
};

/** Drop consecutive duplicate words that Whisper sometimes hallucinates
 *  (especially with -sow/-dtw on noisy audio). */
function dedupeConsecutive(words: CaptionWord[]): CaptionWord[] {
  const out: CaptionWord[] = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.text.toLowerCase().replace(/[^\w]/g, "") ===
        w.text.toLowerCase().replace(/[^\w]/g, "") &&
      w.start - prev.end < 0.3
    ) {
      prev.end = w.end; // extend the previous occurrence
      continue;
    }
    out.push({ ...w });
  }
  return out;
}

/**
 * Convert clip-relative Whisper word segments into the caption PNG sequence.
 * Returns the path glob ffmpeg can consume + the fps used.
 */
export async function renderCaptionFrames(
  words: CaptionWord[],
  durationSec: number,
  outDir: string,
  fps: number = 8,
  targetWidth: number = 1080,
  targetHeight: number = 1920
): Promise<RenderResult> {
  const framesDir = path.join(outDir, "caps");
  const cleanWords = dedupeConsecutive(words);
  const cfg = JSON.stringify({
    words: cleanWords,
    durationSec,
    outDir: framesDir,
    fps,
    targetWidth,
    targetHeight,
  });

  return new Promise((resolve, reject) => {
    const child = spawn("python3", [SCRIPT_PATH]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`render-captions.py exited ${code}: ${stderr}`));
      }
      try {
        const result = JSON.parse(stdout) as { frames: number; fps: number };
        resolve({
          framesDir,
          framePattern: path.join(framesDir, "cap_%06d.png"),
          fps: result.fps,
          frames: result.frames,
        });
      } catch (err) {
        reject(new Error(`render-captions.py bad output: ${stdout} (${err})`));
      }
    });
    child.on("error", reject);
    child.stdin.write(cfg);
    child.stdin.end();
  });
}

/**
 * Filter segments down to a single clip's window, normalizing timestamps to
 * be relative to clip start (0 = clip start).
 */
export function wordsForClip(
  wordSegments: WhisperSegment[],
  clipStart: number,
  clipEnd: number
): CaptionWord[] {
  return wordSegments
    .filter((s) => s.end > clipStart && s.start < clipEnd)
    .map((s) => ({
      start: Math.max(0, s.start - clipStart),
      end: Math.min(clipEnd - clipStart, s.end - clipStart),
      text: s.text.replace(/^\s+|\s+$/g, ""),
    }))
    .filter((w) => w.text.length > 0 && w.end > w.start);
}
