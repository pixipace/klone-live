import { spawn } from "child_process";
import { mkdir, stat } from "fs/promises";
import path from "path";
import type { SourceSegment } from "./explainer-segments";

/** A time-windowed overlay — used for stat callouts, pull quotes,
 *  title cards, lower-thirds, anything that should appear during a
 *  specific window of the explainer. Either a static PNG OR a frame
 *  sequence (for animated overlays like number-counter stats). */
export type CustomOverlay = {
  /** Absolute path to a 1080x1920 transparent PNG. Use this for static
   *  overlays (title cards, pull quotes). */
  pngPath?: string;
  /** ffmpeg glob pattern for a frame sequence (e.g. "/abs/dir/stat_%06d.png").
   *  Use this for animated overlays (count-up stat counters, etc). */
  framePattern?: string;
  /** Frame rate of the sequence (only used when framePattern is set). */
  fps?: number;
  /** When the overlay first appears (seconds, relative to explainer start). */
  startSec: number;
  /** When the overlay disappears. */
  endSec: number;
  /** Optional fade in/out duration in seconds. Default 0.2. */
  fadeSec?: number;
};

/** Optional pre-rendered overlay assets attached after the base video.
 *  Rendered separately (PNGs) so the composer doesn't need to know about
 *  caption styling or font config. */
export type ComposeOverlays = {
  /** Glob pattern for caption PNG frame sequence (cap_%06d.png), as
   *  produced by renderCaptionFrames(). */
  captionsFramePattern?: string;
  /** Frames-per-second the caption sequence was rendered at. */
  captionsFps?: number;
  /** Optional always-on PNG overlay for source attribution (rendered
   *  once per job, displayed across the whole video). */
  attributionPngPath?: string;
  /** Optional end-card PNG. Shown over the final ~2.5s of the video
   *  as a branding/CTA outro (mirrors the clip-mode end card behaviour). */
  endCardPngPath?: string;
  /** Time-windowed overlays — title cards, stat callouts, pull quotes,
   *  lower thirds. Layered ON TOP of captions in declaration order so
   *  each generation can add new graphic types without changing this
   *  composer. */
  customOverlays?: CustomOverlay[];
  /** Optional cinematic music bed mixed under the narration. Sidechain-
   *  ducked when narration is loud so dialogue stays intelligible. Without
   *  music, silent narration explainers feel like dead air. */
  musicPath?: string;
  /** Music bed volume in dB. Default -22 (under speech). */
  musicVolumeDb?: number;
  /** Optional pre-built SFX bed WAV — should contain whooshes at cut
   *  timestamps and silence everywhere else. Mixed into the audio chain
   *  at full volume (no ducking). Built by buildCutWhooshTrack(). */
  sfxPath?: string;
};

/** Seconds the end card stays on screen at the end of the video. */
const END_CARD_DUR = 2.5;

/** Speaker-face crop offset in source pixels. When provided, all
 *  cutaways crop horizontally around this X instead of dead-center —
 *  keeps the speaker in frame on 16:9 → 9:16 conversion. Detected
 *  ONCE per source video by the pipeline (face.ts). */
export type ComposeFaceCrop = {
  /** X offset in source pixels for the crop window's LEFT edge. */
  cropX: number;
  /** Source video width (used to clamp cropX). */
  imgW: number;
  /** Source video height (used to compute crop strip width = imgH * 9/16). */
  imgH: number;
};

/**
 * One narration line + the source-video segment it plays under + the path
 * to the TTS audio file generated for this line. The composer stitches
 * these into a single 9:16 explainer video.
 */
export type ExplainerShot = {
  /** TTS audio file path (WAV/MP3). For QUOTE shots (useSourceAudio=true)
   *  this can be empty — the composer pulls audio from the source segment
   *  directly. */
  narrationAudioPath: string;
  /** Spoken text — used to render burn-in captions. For NARRATION shots
   *  this is the TTS line; for QUOTE shots this is the speaker's actual
   *  transcript words. */
  text: string;
  /** Visual to play during this narration line. Either a SOURCE segment
   *  (silent video clip from the source — used for opening/middle/close
   *  anchors so viewers know it's a real interview), or an IMAGE (a
   *  topic-relevant photo from Wikipedia/Pexels/Pixabay/AI — illustrates
   *  the FACT being discussed instead of showing the host on repeat). */
  visual:
    | { kind: "source"; segment: SourceSegment }
    | { kind: "image"; filePath: string; attribution?: string | null };
  /** When true, this shot gets a rapid PUNCH-IN zoom (1.0→1.15→1.0)
   *  instead of the standard variable Ken Burns rotation. Mark the
   *  punchiest line per insight to give the eye a beat to land on. */
  punch?: boolean;
  /** When true, this shot's AUDIO comes from the SOURCE VIDEO segment
   *  (not the TTS narration). Used for "key quote" shots where we let
   *  the speaker's real voice cut in — the documentary anchor. The
   *  visual MUST be kind="source" when this is true. The shot's
   *  duration becomes the source segment's duration (not narration). */
  useSourceAudio?: boolean;
};

export type ComposeResult = {
  videoPath: string;
  thumbnailPath: string;
  durationSec: number;
};

const TARGET_W = 1080;
const TARGET_H = 1920;

async function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", () => resolve(parseFloat(out.trim()) || 0));
    child.on("error", () => resolve(0));
  });
}

/**
 * Compose an explainer video from the per-shot inputs.
 *
 * Pipeline:
 *   1. For each shot, cut the source video segment, scale-pad to 9:16,
 *      stretch/loop to match the narration audio's duration. Source audio
 *      is dropped entirely — the explainer is narration + (optional) music.
 *   2. Concatenate the shots in order (no transitions between — abrupt
 *      cuts are the documentary-style default; we can add 0.15s xfades
 *      later if requested).
 *   3. Mix the per-shot narration tracks back-to-back as the audio.
 *   4. Output a single 9:16 MP4 + a thumbnail jpg.
 *
 * Captions, hook overlay, and music can be layered in subsequent passes —
 * Phase 1 keeps this a clean single FFmpeg call so we can validate the
 * format before adding complexity.
 */
export async function composeExplainer(
  sourceVideoPath: string,
  shots: ExplainerShot[],
  outDir: string,
  basename: string,
  overlays: ComposeOverlays = {},
  faceCrop?: ComposeFaceCrop,
): Promise<ComposeResult> {
  if (shots.length === 0) {
    throw new Error("composeExplainer: no shots");
  }
  await mkdir(outDir, { recursive: true });
  const videoPath = path.join(outDir, `${basename}.mp4`);
  const thumbnailPath = path.join(outDir, `${basename}.jpg`);

  // Per-shot duration:
  //   - Narration shot: TTS audio file's duration (we play visual for
  //     however long the narration takes).
  //   - QUOTE shot (useSourceAudio): the source segment's duration —
  //     play the speaker's real clip at real speed; the narration audio
  //     path here is just a silent placeholder of matching length.
  const narrationDurations: number[] = [];
  for (const s of shots) {
    if (s.useSourceAudio && s.visual.kind === "source") {
      const seg = s.visual.segment;
      narrationDurations.push(seg.endSec - seg.startSec);
    } else {
      narrationDurations.push(await probeDuration(s.narrationAudioPath));
    }
  }
  const totalDur = narrationDurations.reduce((a, b) => a + b, 0);

  // Build the FFmpeg command. Inputs (in order):
  //   0          — source video (cut into N segments for "source" shots)
  //   1..N       — per-line narration audio
  //   N+1..N+M   — image inputs (one per "image" shot — Wikipedia/Pexels/AI)
  //   then       — caption frames, attribution PNG, end card, custom overlays,
  //                music, sfx (all optional)
  const args: string[] = ["-y", "-i", sourceVideoPath];
  for (const s of shots) {
    args.push("-i", s.narrationAudioPath);
  }
  // Image inputs — one per "image" shot. Build a parallel array mapping
  // shotIdx → ffmpeg input index for the per-shot filter chain below.
  const shotImageInputIdx: (number | null)[] = new Array(shots.length).fill(null);
  let imgIdxCursor = 1 + shots.length;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (s.visual.kind === "image") {
      args.push("-loop", "1", "-i", s.visual.filePath);
      shotImageInputIdx[i] = imgIdxCursor++;
    }
  }
  let captionsInputIdx: number | null = null;
  let attributionInputIdx: number | null = null;
  let endCardInputIdx: number | null = null;
  let nextInputIdx = imgIdxCursor;
  if (overlays.captionsFramePattern && overlays.captionsFps) {
    args.push(
      "-framerate", String(overlays.captionsFps),
      "-i", overlays.captionsFramePattern,
    );
    captionsInputIdx = nextInputIdx++;
  }
  if (overlays.attributionPngPath) {
    args.push("-loop", "1", "-i", overlays.attributionPngPath);
    attributionInputIdx = nextInputIdx++;
  }
  if (overlays.endCardPngPath) {
    args.push("-loop", "1", "-i", overlays.endCardPngPath);
    endCardInputIdx = nextInputIdx++;
  }

  // Custom time-windowed overlays — title cards, stat callouts, pull
  // quotes, etc. Each gets its own input slot so the filter graph can
  // address them by index.
  const customOverlays = overlays.customOverlays ?? [];
  const customOverlayInputIdxs: number[] = [];
  for (const ov of customOverlays) {
    if (ov.framePattern && ov.fps) {
      // Animated PNG sequence — read at its native fps then loop the
      // last frame for the rest of the overlay window.
      args.push("-framerate", String(ov.fps), "-i", ov.framePattern);
    } else if (ov.pngPath) {
      args.push("-loop", "1", "-i", ov.pngPath);
    } else {
      throw new Error("CustomOverlay must have pngPath or framePattern");
    }
    customOverlayInputIdxs.push(nextInputIdx++);
  }

  // Music bed — looped + trimmed to total duration. Sidechain-ducked
  // against narration in the audio chain below so speech stays clear.
  let musicInputIdx: number | null = null;
  if (overlays.musicPath) {
    args.push("-stream_loop", "-1", "-i", overlays.musicPath);
    musicInputIdx = nextInputIdx++;
  }

  // Pre-built SFX bed (cut whooshes etc). Single input mixed at full
  // volume — already trimmed to totalDur by buildCutWhooshTrack.
  let sfxInputIdx: number | null = null;
  if (overlays.sfxPath) {
    args.push("-i", overlays.sfxPath);
    sfxInputIdx = nextInputIdx++;
  }

  // For each shot: crop source segment → scale-pad to 9:16 → setpts to
  // stretch/squeeze to narration duration → label.
  const vfParts: string[] = [];
  const aLabels: string[] = [];
  const vLabels: string[] = [];

  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const narrDur = narrationDurations[i];
    const isImage = s.visual.kind === "image";

    // Real-editor playback: source plays at NORMAL speed (no setpts
    // stretch — that visibly slow-mos people and looks AI-cheap).
    // For IMAGE shots: the input is a still PNG/JPG that we loop, so
    // playDur = narrDur exactly (no source-segment math needed).
    // For QUOTE shots (useSourceAudio): the segment duration IS the
    // shot duration — no stretching, no padding. Just play it raw.
    let playDur: number;
    let padDur: number;
    if (isImage) {
      playDur = narrDur;
      padDur = 0;
    } else if (s.useSourceAudio) {
      const seg = (s.visual as { kind: "source"; segment: SourceSegment }).segment;
      playDur = seg.endSec - seg.startSec;
      padDur = 0;
    } else {
      const seg = (s.visual as { kind: "source"; segment: SourceSegment }).segment;
      const sourceSegDur = seg.endSec - seg.startSec;
      playDur = Math.min(sourceSegDur, narrDur);
      padDur = Math.max(0, narrDur - playDur);
    }

    const fps = 30;
    const totalFrames = Math.max(1, Math.round(narrDur * fps));
    let zoompanExpr: string;
    if (s.useSourceAudio) {
      // QUOTE shots play the speaker raw — no zoom motion, no flash.
      // The point is documentary authenticity; viewers want to feel
      // they're watching the real interview, not an edit-heavy edit.
      zoompanExpr = `null`;
    } else if (s.punch) {
      // PUNCH-IN: rapid push from 1.0 → 1.15 over the first ~25% of the
      // shot, hold near peak for ~50%, ease back to 1.05 for the last
      // 25%. Lands the eye on this exact word/moment. Reserved for the
      // single highest-emphasis line per insight (overrides Ken Burns).
      const peakFrame = Math.max(1, Math.round(totalFrames * 0.25));
      const easeStart = Math.max(peakFrame + 1, Math.round(totalFrames * 0.75));
      // zoompan expression: piecewise based on output frame index `on`
      // - frame 0..peakFrame: lerp 1.00 → 1.15
      // - peakFrame..easeStart: hold 1.15
      // - easeStart..end: lerp 1.15 → 1.05
      const e1 = `(1.0+0.15*on/${peakFrame})`;
      const e2 = `1.15`;
      const e3 = `(1.15-0.10*(on-${easeStart})/(${totalFrames}-${easeStart}))`;
      zoompanExpr = `zoompan=z='if(lt(on\\,${peakFrame})\\,${e1}\\,if(lt(on\\,${easeStart})\\,${e2}\\,${e3}))':d=1:fps=${fps}:s=${TARGET_W}x${TARGET_H}`;
    } else {
      const zoomMode = i % 4; // 0: zoom-in, 1: zoom-out, 2: hold, 3: zoom-in stronger
      if (zoomMode === 0) {
        const delta = (0.05 / totalFrames).toFixed(7);
        zoompanExpr = `zoompan=z='min(zoom+${delta},1.05)':d=1:fps=${fps}:s=${TARGET_W}x${TARGET_H}`;
      } else if (zoomMode === 1) {
        const delta = (0.05 / totalFrames).toFixed(7);
        zoompanExpr = `zoompan=z='max(1.0\\,if(eq(on\\,0)\\,1.05\\,zoom-${delta}))':d=1:fps=${fps}:s=${TARGET_W}x${TARGET_H}`;
      } else if (zoomMode === 2) {
        zoompanExpr = `null`;
      } else {
        const delta = (0.08 / totalFrames).toFixed(7);
        zoompanExpr = `zoompan=z='min(zoom+${delta},1.08)':d=1:fps=${fps}:s=${TARGET_W}x${TARGET_H}`;
      }
    }
    const padFilter = padDur > 0
      ? `,tpad=stop_mode=clone:stop_duration=${padDur.toFixed(3)}`
      : "";
    // Punch shots get a 0.07s white fade-IN — physical impact pop that
    // viewers feel even before the punch-in zoom starts. Standard editor
    // move ("flash cut" / "white flash transition"). Quote shots NEVER
    // get this — too jarring against a real human voice cutting in.
    const flashFilter = s.punch && !s.useSourceAudio
      ? `,fade=in:st=0:d=0.07:color=white`
      : "";

    // Concat-compat suffix: every per-shot chain must end with the SAME
    // pixel format, SAR, and timebase or `concat=n=N` produces zero
    // packets and libx264 reports "Could not open encoder before EOF".
    // setsar=1, format=yuv420p, settb=AVTB normalize all three.
    const concatTail = `,setsar=1,format=yuv420p,settb=AVTB[v${i}]`;

    let vIn: string;
    if (isImage) {
      // IMAGE shot — load the looped image (input-level `-loop 1` already
      // produces the infinite stream), scale-pad to 9:16, trim to narration
      // duration, apply Ken Burns + grade + vignette + flash. No face-crop
      // (image is already a curated photo, not a wide source).
      const imgIdx = shotImageInputIdx[i]!;
      vIn =
        `[${imgIdx}:v]trim=duration=${playDur.toFixed(3)},setpts=PTS-STARTPTS,fps=${fps},` +
        `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,` +
        `crop=${TARGET_W}:${TARGET_H},` +
        `${zoompanExpr},` +
        `eq=contrast=1.08:saturation=1.10:gamma_r=1.02:gamma_b=0.98,` +
        `vignette=PI/4.5` +
        flashFilter +
        concatTail;
    } else {
      // SOURCE shot — speaker-tracking crop when faceCrop provided so
      // the speaker stays in frame on 16:9 → 9:16 conversion. Falls back
      // to scale+center-crop without faceCrop.
      const seg = (s.visual as { kind: "source"; segment: SourceSegment }).segment;
      let cropChain: string;
      if (faceCrop) {
        const stripW = Math.round((faceCrop.imgH * 9) / 16);
        const cx = Math.max(0, Math.min(faceCrop.imgW - stripW, faceCrop.cropX));
        cropChain =
          `crop=${stripW}:${faceCrop.imgH}:${cx}:0,` +
          `scale=${TARGET_W}:${TARGET_H}`;
      } else {
        cropChain =
          `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,` +
          `crop=${TARGET_W}:${TARGET_H}`;
      }
      vIn =
        `[0:v]trim=start=${seg.startSec.toFixed(3)}:duration=${playDur.toFixed(3)},setpts=PTS-STARTPTS,fps=${fps},` +
        cropChain +
        padFilter +
        `,${zoompanExpr},` +
        `eq=contrast=1.08:saturation=1.10:gamma_r=1.02:gamma_b=0.98,` +
        `vignette=PI/4.5` +
        flashFilter +
        concatTail;
    }
    vfParts.push(vIn);
    vLabels.push(`[v${i}]`);

    // Per-shot audio source — DIFFERENTIATED:
    //   - Narration shots: pull from TTS input (i+1):a
    //   - QUOTE shots (useSourceAudio): pull from source video [0:a] at
    //     the quote's timestamps. The speaker's REAL voice plays during
    //     these — that's the documentary anchor that makes the explainer
    //     feel real instead of "AI narrator over photos."
    // Both branches end with aresample=44100 so the per-shot audios are
    // mutually compatible for the final concat (timebase + sample rate).
    if (s.useSourceAudio && s.visual.kind === "source") {
      const seg = s.visual.segment;
      const segDur = seg.endSec - seg.startSec;
      vfParts.push(
        `[0:a]atrim=start=${seg.startSec.toFixed(3)}:duration=${segDur.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[aSeg${i}]`,
      );
    } else {
      vfParts.push(
        `[${i + 1}:a]asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[aSeg${i}]`,
      );
    }
    aLabels.push(`[aSeg${i}]`);
  }

  // Concat video into single base stream
  vfParts.push(
    `${vLabels.join("")}concat=n=${shots.length}:v=1:a=0[vbase]`,
  );

  // Audio chain. Layers (bottom to top):
  //   1. narration (concatenated TTS) — primary
  //   2. SFX bed (cut whooshes) — full volume, on top of narration
  //   3. music bed (sidechain-ducked under narration) — bottom
  // Built incrementally so any combination works (no music + sfx, etc).
  // Per-shot audio segments are normalized above (44.1kHz fltp stereo)
  // so this concat just stitches the prepared streams.
  let lastAudio = `${aLabels.join("")}concat=n=${shots.length}:v=0:a=1[aNarr]`;
  vfParts.push(lastAudio);
  let audioOut = "[aNarr]";

  if (sfxInputIdx !== null) {
    vfParts.push(
      `${audioOut}[${sfxInputIdx}:a]amix=inputs=2:duration=first:dropout_transition=0:weights=1 1[aWithSfx]`,
    );
    audioOut = "[aWithSfx]";
  }

  if (musicInputIdx !== null) {
    const volDb = overlays.musicVolumeDb ?? -22;
    vfParts.push(
      // Split current audio so we can use one branch as sidechain key
      `${audioOut}asplit=2[aMain][aDuckKey]`,
      `[${musicInputIdx}:a]atrim=duration=${totalDur.toFixed(2)},volume=${volDb}dB,apad[aMusicRaw]`,
      `[aMusicRaw][aDuckKey]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300:makeup=0[aMusicDucked]`,
      `[aMain][aMusicDucked]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    );
  } else if (audioOut !== "[aout]") {
    // Rename whatever the last labeled stream is to [aout]
    vfParts.push(`${audioOut}anull[aout]`);
  }

  // Layer overlays on top of the concatenated base video. Order matters:
  // attribution (always-on, at the bottom) goes UNDER captions so the text
  // doesn't visually compete for the same screen real-estate.
  let lastVideo = "[vbase]";
  if (attributionInputIdx !== null) {
    vfParts.push(
      `[${attributionInputIdx}:v]format=rgba,scale=${TARGET_W}:-1[attribOv]`,
      `${lastVideo}[attribOv]overlay=0:H-h-40[v_attrib]`,
    );
    lastVideo = "[v_attrib]";
  }
  if (captionsInputIdx !== null) {
    vfParts.push(
      `${lastVideo}[${captionsInputIdx}:v]overlay=0:0:shortest=0[v_caps]`,
    );
    lastVideo = "[v_caps]";
  }
  // Custom overlays (title cards, stat callouts, pull quotes) layer
  // ABOVE captions but BELOW the end card. Each appears for its own time
  // window with a fade in/out so transitions feel intentional, not flashy.
  for (let oi = 0; oi < customOverlays.length; oi++) {
    const ov = customOverlays[oi];
    const inputIdx = customOverlayInputIdxs[oi];
    const fade = ov.fadeSec ?? 0.2;
    const dur = Math.max(0.05, ov.endSec - ov.startSec);
    const fadeOutStart = Math.max(0, dur - fade);
    // Pre-process: scale to canvas + apply fade in/out (alpha=1) so the
    // overlay can sit dormant outside its enable window without staying
    // fully opaque from the loop input.
    vfParts.push(
      `[${inputIdx}:v]format=rgba,scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,pad=${TARGET_W}:${TARGET_H}:-1:-1:color=#00000000,fade=in:st=0:d=${fade.toFixed(2)}:alpha=1,fade=out:st=${fadeOutStart.toFixed(2)}:d=${fade.toFixed(2)}:alpha=1,setpts=PTS-STARTPTS[ov${oi}]`,
      `${lastVideo}[ov${oi}]overlay=0:0:enable='between(t,${ov.startSec.toFixed(2)},${ov.endSec.toFixed(2)})'[v_ov${oi}]`,
    );
    lastVideo = `[v_ov${oi}]`;
  }
  // End card overlays for the final ~2.5s — branding/CTA outro. Goes ON
  // TOP of everything (covers source visuals + captions + attribution).
  if (endCardInputIdx !== null) {
    const startAt = Math.max(0, totalDur - END_CARD_DUR);
    vfParts.push(
      `[${endCardInputIdx}:v]format=rgba,scale=${TARGET_W}:${TARGET_H}[endCardScaled]`,
      `${lastVideo}[endCardScaled]overlay=0:0:enable='gte(t,${startAt.toFixed(2)})'[v_end]`,
    );
    lastVideo = "[v_end]";
  }
  // Final stream MUST be named [vout] for the mapping below.
  if (lastVideo !== "[vout]") {
    vfParts.push(`${lastVideo}null[vout]`);
  }

  args.push(
    "-filter_complex", vfParts.join(";"),
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "21",
    "-pix_fmt", "yuv420p",
    // iOS-safe encode profile — Safari < 16 chokes on High profile or
    // Level > 4.0. Main+4.0 covers everything from iPhone 6 onward.
    "-profile:v", "main",
    "-level", "4.0",
    "-c:a", "aac",
    "-b:a", "192k",      // bumped from 128k — narration is the centerpiece
    "-ar", "44100",      // some Safari builds prefer 44100 over 24000
    "-movflags", "+faststart",
    "-t", totalDur.toFixed(2),
    videoPath,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", async (code) => {
      if (code === 0) return resolve();
      // Persist the full command + stderr next to the broken output so we
      // can reproduce the failure manually instead of guessing from a
      // truncated log line.
      try {
        const { writeFile } = await import("fs/promises");
        const debugPath = path.join(outDir, `${basename}.ffmpeg-debug.txt`);
        await writeFile(
          debugPath,
          `# ffmpeg exit ${code}\n# command:\nffmpeg ${args.map((a) => (a.includes(" ") ? `'${a}'` : a)).join(" ")}\n\n# stderr:\n${stderr}`,
        );
      } catch {}
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`));
    });
    child.on("error", reject);
  });

  // Smart thumbnail from middle of the output
  await new Promise<void>((resolve) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-ss", (totalDur / 2).toFixed(2),
      "-i", videoPath,
      "-vframes", "1",
      "-vf", "thumbnail=200",
      "-q:v", "3",
      thumbnailPath,
    ]);
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });

  // Sanity-check output exists
  await stat(videoPath);

  return {
    videoPath,
    thumbnailPath,
    durationSec: totalDur,
  };
}
