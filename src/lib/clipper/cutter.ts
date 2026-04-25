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

export type SfxAtTime = {
  path: string;
  /** Output-timeline seconds when the SFX should fire. */
  startSec: number;
  /** Volume in dB. Default -12. */
  volumeDb?: number;
};

export type EditOptions = {
  hookOverlay?: { text: string; durationSec: number };
  musicPath?: string;
  musicVolumeDb?: number;
  /** SFX one-shots scheduled at specific output-timeline times. */
  sfxs?: SfxAtTime[];
  zoom?: boolean;
  /** Apply cinematic color grade (subtle teal-orange split + lifted blacks). */
  cinematic?: boolean;
  /** Apply soft vignette darkening at corners. */
  vignette?: boolean;
  /** Punch-zoom moments — sudden zoom in to 1.15 over 0.3s, hold 0.0s, out
   * over 0.3s. Times are output-timeline seconds. */
  punchZooms?: Array<{ atSec: number }>;
  /** Source-pixel x-offset for the 9:16 crop window (face-tracking). If
   * omitted, the strip is centered on the source frame. */
  cropX?: number;
  /** Comma-separated time ranges to remove from the clip (silence trim).
   * Times are in clip-local seconds. */
  removeRanges?: Array<{ startSec: number; endSec: number }>;
  /** Word-by-word caption PNG sequence overlay. */
  captions?: { framePattern: string; fps: number };
  /** B-roll corner PiP overlays — each is a full-frame transparent PNG with
   * the rounded-corner thumbnail rendered top-right. Time-gated, fades in/out. */
  brollOverlays?: Array<{
    framePath: string;
    startSec: number;
    endSec: number;
  }>;
  /** Optional end card PNG shown over the last 1.5s of the clip (full-frame
   * transparent with the user's branded card rendered bottom). */
  endCardPath?: string;
  /** Caption style key — passed through to the renderer. Default "classic". */
  captionStyle?: "classic" | "bold" | "minimal";
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

  // Step 3 — zoom: subtle Ken Burns + optional punch zooms layered on top.
  // zoompan uses `on` (output frame index), not seconds; we convert with on/fps.
  // Each punch ramps 1.0 → 1.15 over 0.3s, back over 0.3s.
  if (options.zoom || (options.punchZooms && options.punchZooms.length > 0)) {
    const fps = 30;
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const baseDelta = options.zoom ? (0.06 / totalFrames).toFixed(6) : "0";
    // Cap base zoom at 1.06 so it doesn't keep accumulating
    const baseExpr = options.zoom
      ? `min(1.06\\,1+${baseDelta}*on)`
      : `1`;

    const punches = (options.punchZooms ?? []).filter(
      (p) => p.atSec >= 0 && p.atSec < duration
    );

    let zoomExpr = baseExpr;
    for (const p of punches) {
      const peak = (p.atSec + 0.3).toFixed(3);
      // Triangular bump: 0.15 max amplitude, 0.3s ramp each side
      zoomExpr = `${zoomExpr}+max(0\\,0.15*(1-abs(on/${fps}-${peak})/0.3))`;
    }

    vfChain.push(
      `zoompan=z='${zoomExpr}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${TARGET_W}x${TARGET_H}:fps=${fps}`
    );
  }

  // Step 4 — cinematic color grade (subtle teal-orange split, lifted blacks).
  // colorbalance: shift midtones slightly green-cyan, highlights warm; curves
  // adds a tiny S-curve for contrast + lifts blacks toward dark teal.
  if (options.cinematic) {
    vfChain.push(
      "colorbalance=rs=-0.05:gs=0.02:bs=0.06:rm=-0.04:gm=0.01:bm=0.02:rh=0.06:gh=0.01:bh=-0.04",
      "curves=master='0/0.04 0.4/0.38 0.6/0.62 1/0.98'",
      "eq=saturation=1.05:contrast=1.04"
    );
  }

  // Step 5 — soft vignette
  if (options.vignette) {
    vfChain.push("vignette=PI/5");
  }

  // Step 6 — silence-trim via select + setpts (re-time)
  if (options.removeRanges && options.removeRanges.length > 0) {
    const expr = buildSelectExpr(options.removeRanges);
    vfChain.push(`select='${expr}'`, `setpts=N/FRAME_RATE/TB`);
  }

  const vf = vfChain.join(",");

  // Audio filter chain — mirror the silence trim, then normalize loudness
  // so clips from different sources end up at consistent volume. Uses
  // dynaudnorm (single-pass, streaming-friendly) — a podcast recorded at
  // -28 LUFS and an interview at -14 LUFS both come out around -18 LUFS.
  // g=11 is moderate gating window; m=4 limits max gain so quiet rooms
  // don't get pumped to noise.
  const afChain: string[] = [];
  if (options.removeRanges && options.removeRanges.length > 0) {
    const expr = buildSelectExpr(options.removeRanges);
    afChain.push(`aselect='${expr}'`, `asetpts=N/SR/TB`);
  }
  afChain.push("dynaudnorm=g=11:m=4:r=0.95");

  // Build ffmpeg command. Music + hook overlay both require filter_complex
  // since they need additional input streams.
  // -t and -ss MUST go BEFORE -i for the source so they apply to source.mp4
  // and don't get clobbered by the next input's own -t (e.g., the hook PNG).
  const args: string[] = [
    "-y",
    "-ss",
    startSec.toFixed(2),
    "-t",
    duration.toFixed(2),
    "-i",
    sourceVideo,
  ];

  let hookPngPath: string | null = null;
  let hookInputIdx: number | null = null;
  if (options.hookOverlay && options.hookOverlay.text.trim().length > 0) {
    hookPngPath = path.join(outDir, `${basename}.hook.png`);
    await renderHookPng(options.hookOverlay.text.trim(), hookPngPath);
  }

  let musicInputIdx: number | null = null;
  let captionsInputIdx: number | null = null;
  let endCardInputIdx: number | null = null;
  const sfxInputs: Array<{ idx: number; sfx: SfxAtTime }> = [];
  const brollInputs: Array<{
    idx: number;
    overlay: { framePath: string; startSec: number; endSec: number };
  }> = [];
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
  if (options.endCardPath) {
    // End card spans full clip duration (overlay enable= time-gates it
    // to the last 1.5s). Using full duration keeps the input alive
    // through the fade window.
    args.push("-loop", "1", "-t", duration.toFixed(2), "-i", options.endCardPath);
    endCardInputIdx = nextInputIdx++;
  }
  if (options.captions) {
    args.push(
      "-framerate",
      String(options.captions.fps),
      "-i",
      options.captions.framePattern
    );
    captionsInputIdx = nextInputIdx++;
  }
  if (options.brollOverlays) {
    for (const ov of options.brollOverlays) {
      // -t must be >= overlay.endSec so input frames exist at the moment
      // the overlay needs to display them (overlay pulls frames at the
      // OUTPUT timestamp via default sync). Pad +0.5s for safety.
      // PREVIOUS BUGS:
      //   v1 (-t (endSec - startSec)): too short — fade fired at output
      //   t=startSec but input had ended at input t=(endSec-startSec).
      //   v2 (-loop 1, no -t): infinite input → encoder ran forever,
      //   produced multi-GB files past the main video's end.
      const tCap = (ov.endSec + 0.5).toFixed(2);
      args.push("-loop", "1", "-t", tCap, "-i", ov.framePath);
      brollInputs.push({ idx: nextInputIdx++, overlay: ov });
    }
  }
  if (options.musicPath) {
    args.push("-stream_loop", "-1", "-i", options.musicPath);
    musicInputIdx = nextInputIdx++;
  }
  if (options.sfxs) {
    for (const sfx of options.sfxs) {
      args.push("-i", sfx.path);
      sfxInputs.push({ idx: nextInputIdx++, sfx });
    }
  }

  const useFilterComplex =
    hookInputIdx !== null ||
    captionsInputIdx !== null ||
    endCardInputIdx !== null ||
    brollInputs.length > 0 ||
    musicInputIdx !== null ||
    sfxInputs.length > 0;

  if (useFilterComplex) {
    const parts: string[] = [];
    parts.push(`[0:v]${vf}[v0]`);

    let lastVideoLabel = "v0";

    // B-roll FIRST (full-screen cutaway frames sit ON the speaker video).
    // Then captions and hook layer ON TOP of B-roll — otherwise full-screen
    // B-roll would block the captions and the user wouldn't see them
    // during the cutaway moment.
    for (let bi = 0; bi < brollInputs.length; bi++) {
      const { idx, overlay } = brollInputs[bi];
      const fadeOutStart = Math.max(
        overlay.startSec,
        overlay.endSec - 0.25
      ).toFixed(3);
      parts.push(
        `[${idx}:v]format=rgba,fade=t=in:st=${overlay.startSec.toFixed(3)}:d=0.25:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.25:alpha=1[brollFaded${bi}]`
      );
      const outLabel = `vBroll${bi}`;
      parts.push(
        `[${lastVideoLabel}][brollFaded${bi}]overlay=x=0:y=0:enable='between(t,${overlay.startSec.toFixed(3)},${overlay.endSec.toFixed(3)})'[${outLabel}]`
      );
      lastVideoLabel = outLabel;
    }

    if (captionsInputIdx !== null) {
      // Scale captions sequence to match output, overlay full-frame
      parts.push(
        `[${captionsInputIdx}:v]format=rgba,scale=${TARGET_W}:${TARGET_H}[capScaled]`
      );
      parts.push(`[${lastVideoLabel}][capScaled]overlay=x=0:y=0[vCap]`);
      lastVideoLabel = "vCap";
    }

    if (hookInputIdx !== null && options.hookOverlay) {
      const dur = options.hookOverlay.durationSec;
      const fadeOutStart = Math.max(0, dur - 0.4).toFixed(2);
      parts.push(
        `[${hookInputIdx}:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.4:alpha=1[hookFaded]`
      );
      const hookOutLabel = endCardInputIdx !== null ? "vHook" : "v";
      parts.push(
        `[${lastVideoLabel}][hookFaded]overlay=x=0:y=H*0.08:enable='lt(t,${dur.toFixed(2)})'[${hookOutLabel}]`
      );
      lastVideoLabel = hookOutLabel;
    } else if (endCardInputIdx !== null) {
      parts.push(`[${lastVideoLabel}]null[vHook]`);
      lastVideoLabel = "vHook";
    } else {
      parts.push(`[${lastVideoLabel}]null[v]`);
      lastVideoLabel = "v";
    }

    // End card: shows over the last 1.5s of the clip with a 0.4s fade-in.
    if (endCardInputIdx !== null) {
      const endCardDur = 1.5;
      const endCardStart = Math.max(0, duration - endCardDur);
      parts.push(
        `[${endCardInputIdx}:v]format=rgba,fade=t=in:st=${endCardStart.toFixed(3)}:d=0.4:alpha=1[endCardFaded]`
      );
      parts.push(
        `[${lastVideoLabel}][endCardFaded]overlay=x=0:y=0:enable='gte(t,${endCardStart.toFixed(3)})'[v]`
      );
    }

    const audioInChain = afChain.length > 0 ? afChain.join(",") : "anull";
    parts.push(`[0:a]${audioInChain}[a0]`);

    // Split speaker audio so we can use one branch as the sidechain key
    // (for ducking music) AND another as the actual mix input.
    const needsSplit = musicInputIdx !== null;
    if (needsSplit) {
      parts.push(`[a0]asplit=2[aMixIn][aDuckKey]`);
    } else {
      parts.push(`[a0]anull[aMixIn]`);
    }

    const audioMixInputs: string[] = ["[aMixIn]"];

    if (musicInputIdx !== null) {
      const volDb = options.musicVolumeDb ?? -22;
      // Sidechain compression: when speaker (key) gets loud, music ducks.
      // threshold=0.05, ratio=8, attack=20ms, release=300ms — quick duck,
      // smooth lift back when speaker pauses.
      parts.push(`[${musicInputIdx}:a]volume=${volDb}dB,apad[aMusicRaw]`);
      parts.push(
        `[aMusicRaw][aDuckKey]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300:makeup=0[aMusic]`
      );
      audioMixInputs.push("[aMusic]");
    }

    for (const { idx, sfx } of sfxInputs) {
      const volDb = sfx.volumeDb ?? -12;
      const delayMs = Math.max(0, Math.round(sfx.startSec * 1000));
      const label = `aSfx${idx}`;
      // adelay shifts the SFX to the right output time. apad pads with
      // silence so amix's duration=first doesn't truncate.
      const delayPart = delayMs > 0 ? `adelay=${delayMs}|${delayMs},` : "";
      parts.push(`[${idx}:a]${delayPart}volume=${volDb}dB,apad[${label}]`);
      audioMixInputs.push(`[${label}]`);
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

  // Encoder: prefer Apple's hardware h264 encoder on Mac (offloads to media
  // engine, frees CPU for the heavy filter chain). Falls back to libx264
  // veryfast when FFMPEG_HW_ENCODE=false.
  const useHw = process.env.FFMPEG_HW_ENCODE !== "false";
  if (useHw) {
    args.push(
      "-c:v",
      "h264_videotoolbox",
      "-b:v",
      "6M",
      "-maxrate",
      "8M",
      "-bufsize",
      "12M",
      "-pix_fmt",
      "yuv420p"
    );
  } else {
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p"
    );
  }
  args.push(
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    // Hard cap output to source-slice duration. Belt-and-suspenders against
    // any future filter-graph misconfiguration that could let an infinite
    // input run the encoder past the intended end.
    "-t",
    duration.toFixed(2),
    videoPath
  );

  await run("ffmpeg", args);

  // Smart thumbnail: ffmpeg's `thumbnail` filter scores each frame within a
  // window for visual distinctness vs the average and picks the most
  // representative one. Much better than grabbing the middle frame, which
  // often catches a blink/transition. Skip the first 0.4s and last 0.4s
  // (avoids fade-in artifacts and the end card).
  const skipHead = 0.4;
  const skipTail = 0.4;
  const trimmedDur = Math.max(1, duration - skipHead - skipTail);
  await run("ffmpeg", [
    "-y",
    "-ss",
    skipHead.toFixed(2),
    "-t",
    trimmedDur.toFixed(2),
    "-i",
    videoPath,
    "-vf",
    "thumbnail=200",
    "-frames:v",
    "1",
    "-q:v",
    "3",
    thumbnailPath,
  ]);

  return { videoPath, thumbnailPath };
}
