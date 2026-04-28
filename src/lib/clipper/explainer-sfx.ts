import { spawn } from "child_process";
import { mkdir, readdir } from "fs/promises";
import path from "path";

const SFX_BUCKET = path.join(process.cwd(), "assets", "sfx", "hook-in");
const OUTRO_BUCKET = path.join(process.cwd(), "assets", "sfx", "hook-out");

/**
 * Pre-build a single audio track containing whooshes at every cut
 * timestamp + silence everywhere else, sized to total explainer duration.
 * Mixed into the explainer composer's audio chain as a single input —
 * cleaner than adding N whoosh inputs to the main FFmpeg call.
 *
 * Uses one randomly-picked whoosh from assets/sfx/hook-in/ for the whole
 * job (consistent identity across the explainer's cuts; varying SFX per
 * cut feels disjointed).
 *
 * Returns null if the SFX bucket is empty (silent — no SFX track added).
 */
export async function buildCutWhooshTrack(
  cutTimestamps: number[],
  totalDurSec: number,
  outDir: string,
  /** When set, also adds an outro swoosh starting at this timestamp
   *  (typically: totalDurSec - 2.5, to land at the end-card start). */
  outroAtSec?: number,
): Promise<string | null> {
  if (cutTimestamps.length === 0 && outroAtSec === undefined) return null;

  let whoosh: string;
  try {
    const files = (await readdir(SFX_BUCKET)).filter((f) =>
      f.toLowerCase().endsWith(".mp3") || f.toLowerCase().endsWith(".wav"),
    );
    if (files.length === 0) return null;
    whoosh = path.join(SFX_BUCKET, files[Math.floor(Math.random() * files.length)]);
  } catch {
    return null;
  }

  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "cut-whooshes.wav");

  // Optionally pick an outro file too (different bucket — descending
  // / reverse-whoosh sounds, vs the cut whooshes which are punchy
  // forward swooshes).
  let outro: string | null = null;
  if (outroAtSec !== undefined && outroAtSec > 0) {
    try {
      const ofiles = (await readdir(OUTRO_BUCKET)).filter((f) =>
        f.toLowerCase().endsWith(".mp3") || f.toLowerCase().endsWith(".wav"),
      );
      if (ofiles.length > 0) {
        outro = path.join(OUTRO_BUCKET, ofiles[Math.floor(Math.random() * ofiles.length)]);
      }
    } catch {
      // no outro bucket available — skip
    }
  }

  // Build filter graph: silent base + N delayed whooshes amix'd onto it.
  // Each whoosh is loaded once, volume-controlled, delayed, then mixed.
  const args: string[] = ["-y"];
  // Input 0 — silent base
  args.push("-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100:duration=${totalDurSec.toFixed(2)}`);
  // Inputs 1..N — whoosh files (cuts)
  for (const _ of cutTimestamps) {
    args.push("-i", whoosh);
  }
  // Outro input (last) — added only if outro requested + bucket non-empty
  let outroInputIdx: number | null = null;
  if (outro) {
    args.push("-i", outro);
    outroInputIdx = 1 + cutTimestamps.length;
  }

  const filterParts: string[] = [];
  const mixLabels: string[] = ["[0:a]"];
  cutTimestamps.forEach((t, i) => {
    // Whooshes start ~0.12s BEFORE the cut so the rising edge lands
    // exactly at the cut frame. -8dB so it's audible but not jarring.
    const delayMs = Math.max(0, Math.round((t - 0.12) * 1000));
    filterParts.push(
      `[${i + 1}:a]volume=-8dB,atrim=duration=0.6,asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[w${i}]`,
    );
    mixLabels.push(`[w${i}]`);
  });
  if (outroInputIdx !== null && outroAtSec !== undefined) {
    // Outro lands at outroAtSec, slightly earlier than the end-card so
    // the swoosh peaks as the visual flips to the card.
    const delayMs = Math.max(0, Math.round((outroAtSec - 0.2) * 1000));
    filterParts.push(
      `[${outroInputIdx}:a]volume=-6dB,atrim=duration=1.2,asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[outro]`,
    );
    mixLabels.push("[outro]");
  }
  filterParts.push(
    `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0,atrim=duration=${totalDurSec.toFixed(2)}[out]`,
  );

  args.push(
    "-filter_complex", filterParts.join(";"),
    "-map", "[out]",
    "-c:a", "pcm_s16le",
    "-ar", "44100",
    outPath,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`buildCutWhooshTrack: ffmpeg exited ${code}: ${stderr.slice(-300)}`)),
    );
    child.on("error", reject);
  });

  return outPath;
}
