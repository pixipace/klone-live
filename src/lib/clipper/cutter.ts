import { spawn } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";
import { renderHookPng } from "./hook-png";

const TARGET_W = 1080;
const TARGET_H = 1920;

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`));
    });
    child.on("error", reject);
  });
}

export type EditOptions = {
  hookOverlay?: { text: string; durationSec: number };
  musicPath?: string;
  musicVolumeDb?: number;
  /** Optional one-shot SFX played at t=0 (synced to hook overlay fade-in). */
  hookSfxPath?: string;
  hookSfxVolumeDb?: number;
  zoom?: boolean;
  /** Source-pixel x-offset for the 9:16 crop window (face-tracking). If
   * omitted, the strip is centered on the source frame. */
  cropX?: number;
  /** Comma-separated time ranges to remove from the clip (silence trim).
   * Times are in clip-local seconds. */
  removeRanges?: Array<{ startSec: number; endSec: number }>;
};

export type CutResult = {
  videoPath: string;
  thumbnailPath: string;
};

function buildSelectExpr(
  ranges: Array<{ startSec: number; endSec: number }>
): string {
  const conds = ranges
    .map((r) => `between(t,${r.startSec.toFixed(3)},${r.endSec.toFixed(3)})`)
    .join("+");
  return `not(${conds})`;
}

export async function cutVerticalClip(
  sourceVideo: string,
  startSec: number,
  endSec: number,
  outDir: string,
  basename: string,
  options: EditOptions = {}
): Promise<CutResult> {
  await mkdir(outDir, { recursive: true });
  const videoPath = path.join(outDir, `${basename}.mp4`);
  const thumbnailPath = path.join(outDir, `${basename}.jpg`);
  const duration = endSec - startSec;

  // Build video filter chain.
  // Step 1 — vertical strip from source. cropX selects horizontal offset
  // (face-tracking), else centered.
  const cropOffset =
    typeof options.cropX === "number" ? options.cropX.toFixed(0) : "(in_w-out_w)/2";
  const vfChain: string[] = [`crop=ih*9/16:ih:${cropOffset}:0`];

  // Step 2 — scale to target with cover
  vfChain.push(
    `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase`,
    `crop=${TARGET_W}:${TARGET_H}`
  );

  // Step 3 — subtle Ken Burns zoom (1.00 → 1.06 over duration)
  if (options.zoom) {
    const fps = 30;
    const totalFrames = Math.max(1, Math.round(duration * fps));
    vfChain.push(
      `zoompan=z='min(zoom+${(0.06 / totalFrames).toFixed(6)},1.06)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${TARGET_W}x${TARGET_H}:fps=${fps}`
    );
  }

  // Step 4 — silence-trim via select + setpts (re-time)
  if (options.removeRanges && options.removeRanges.length > 0) {
    const expr = buildSelectExpr(options.removeRanges);
    vfChain.push(`select='${expr}'`, `setpts=N/FRAME_RATE/TB`);
  }

  const vf = vfChain.join(",");

  // Audio filter chain — mirror the silence trim
  const afChain: string[] = [];
  if (options.removeRanges && options.removeRanges.length > 0) {
    const expr = buildSelectExpr(options.removeRanges);
    afChain.push(`aselect='${expr}'`, `asetpts=N/SR/TB`);
  }

  // Build ffmpeg command. Music + hook overlay both require filter_complex
  // since they need additional input streams.
  const args: string[] = [
    "-y",
    "-ss",
    startSec.toFixed(2),
    "-i",
    sourceVideo,
    "-t",
    duration.toFixed(2),
  ];

  let hookPngPath: string | null = null;
  let hookInputIdx: number | null = null;
  if (options.hookOverlay && options.hookOverlay.text.trim().length > 0) {
    hookPngPath = path.join(outDir, `${basename}.hook.png`);
    await renderHookPng(options.hookOverlay.text.trim(), hookPngPath);
  }

  let musicInputIdx: number | null = null;
  let sfxInputIdx: number | null = null;
  let nextInputIdx = 1;
  if (hookPngPath && options.hookOverlay) {
    args.push(
      "-loop",
      "1",
      "-t",
      options.hookOverlay.durationSec.toFixed(2),
      "-i",
      hookPngPath
    );
    hookInputIdx = nextInputIdx++;
  }
  if (options.musicPath) {
    args.push("-stream_loop", "-1", "-i", options.musicPath);
    musicInputIdx = nextInputIdx++;
  }
  if (options.hookSfxPath) {
    args.push("-i", options.hookSfxPath);
    sfxInputIdx = nextInputIdx++;
  }

  const useFilterComplex =
    hookInputIdx !== null || musicInputIdx !== null || sfxInputIdx !== null;

  if (useFilterComplex) {
    const parts: string[] = [];
    parts.push(`[0:v]${vf}[v0]`);

    if (hookInputIdx !== null && options.hookOverlay) {
      const dur = options.hookOverlay.durationSec;
      const fadeOutStart = Math.max(0, dur - 0.4).toFixed(2);
      parts.push(
        `[${hookInputIdx}:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.4:alpha=1[hookFaded]`
      );
      parts.push(
        `[v0][hookFaded]overlay=x=0:y=H*0.08:enable='lt(t,${dur.toFixed(2)})'[v]`
      );
    } else {
      parts.push(`[v0]null[v]`);
    }

    const audioInChain = afChain.length > 0 ? afChain.join(",") : "anull";
    parts.push(`[0:a]${audioInChain}[a0]`);

    const audioMixInputs: string[] = ["[a0]"];

    if (musicInputIdx !== null) {
      const volDb = options.musicVolumeDb ?? -25;
      parts.push(`[${musicInputIdx}:a]volume=${volDb}dB,apad[aMusic]`);
      audioMixInputs.push("[aMusic]");
    }

    if (sfxInputIdx !== null) {
      const sfxVolDb = options.hookSfxVolumeDb ?? -12;
      // SFX plays once at t=0; pad it to clip duration so amix doesn't
      // truncate the mix, but only its own duration carries audio.
      parts.push(`[${sfxInputIdx}:a]volume=${sfxVolDb}dB,apad[aSfx]`);
      audioMixInputs.push("[aSfx]");
    }

    if (audioMixInputs.length > 1) {
      parts.push(
        `${audioMixInputs.join("")}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0[a]`
      );
    } else {
      parts.push(`[a0]anull[a]`);
    }

    args.push("-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[a]");
  } else {
    args.push("-vf", vf);
    if (afChain.length > 0) args.push("-af", afChain.join(","));
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    videoPath
  );

  await run("ffmpeg", args);

  // Thumbnail from middle of the clip (use the actual output, not source)
  const midOffset = duration / 2;
  await run("ffmpeg", [
    "-y",
    "-ss",
    midOffset.toFixed(2),
    "-i",
    videoPath,
    "-vframes",
    "1",
    "-q:v",
    "3",
    thumbnailPath,
  ]);

  return { videoPath, thumbnailPath };
}
