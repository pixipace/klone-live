import { rm, mkdir } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { prisma } from "@/lib/prisma";
import { CLIPPER_DIRS } from "./types";
import { downloadYouTube } from "./youtube";
import { transcribe } from "./whisper";
import { extractInsights, writeExplainerScript, planLineVisuals, pickKeyQuotes } from "@/lib/ai";
import { renderNarration } from "./explainer-tts";
import { pickSourceSegments, detectSceneChanges } from "./explainer-segments";
import { composeExplainer, type ExplainerShot } from "./explainer-compose";
import { renderCaptionFrames, type CaptionWord } from "./captions";
import { renderInsightOverlays, pickPunchiestLine } from "./explainer-graphics";
import { pickMusicTrack } from "./music";
import { buildCutWhooshTrack } from "./explainer-sfx";
import { detectFaceForClip, cropXForFace } from "./face";
import { resolveVisuals } from "./explainer-visuals";

/**
 * Render the small "VIA <source>" PNG used as an always-on attribution
 * overlay across every explainer in this job. Rendered ONCE, reused for
 * every insight so we don't pay the Pillow cost per video.
 */
function renderAttributionPng(sourceTitle: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      // Brew python is where Pillow is installed (launchd-spawned worker
      // resolves `python3` differently from interactive shells — see memory).
      process.env.PYTHON_BIN || "/opt/homebrew/bin/python3",
      [path.join(process.cwd(), "scripts", "render-attribution.py")],
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`render-attribution.py exited ${code}: ${stderr.slice(-200)}`)),
    );
    child.on("error", reject);
    child.stdin.write(
      JSON.stringify({ sourceTitle, outPath, targetWidth: 1080 }),
    );
    child.stdin.end();
  });
}

/**
 * EXPLAINER_NO_AUDIO mode: produce silent WAV placeholders sized by the
 * "natural reading time" of each line (0.05s/char floor + 1s minimum,
 * capped at 4s). Lets the visual pipeline run end-to-end without paying
 * the F5-TTS cost during iteration.
 */
/** Probe an audio file's duration in seconds. */
async function probeAudioDur(filePath: string): Promise<number> {
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

/** Split an audio file at the midpoint into two parts. Used for the
 *  multi-shot-per-line trick — long narration lines (>3.5s) get split
 *  in half so a SECOND visual can show during the back half. Real
 *  documentary channels cut every 1-3s, not every 5-7s. */
async function splitAudioInHalf(
  inputPath: string,
  durationSec: number,
  outPart1: string,
  outPart2: string,
): Promise<void> {
  const half = durationSec / 2;
  await mkdir(path.dirname(outPart1), { recursive: true });
  // Re-encode to PCM for both halves so the composer's per-shot audio
  // chain treats them identically (no codec switch mid-stream).
  for (const [start, dur, out] of [
    [0, half, outPart1],
    [half, durationSec - half, outPart2],
  ] as const) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", [
        "-y",
        "-ss", String(start),
        "-i", inputPath,
        "-t", String(dur),
        "-c:a", "pcm_s16le",
        "-ar", "44100",
        "-ac", "1",
        out,
      ]);
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`audio split failed: ${stderr.slice(-200)}`)),
      );
      child.on("error", reject);
    });
  }
}

/** Generate a single silent WAV of the given duration. Used for QUOTE
 *  shots — they need a narrationAudioPath slot in the shot list (the
 *  composer's input layout assumes one audio input per shot) but the
 *  audio chain ignores it and pulls from the source video instead. */
async function renderSilentWav(durationSec: number, outPath: string): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i", "anullsrc=r=44100:cl=mono",
      "-t", durationSec.toFixed(3),
      "-c:a", "pcm_s16le",
      outPath,
    ]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`silent wav gen failed: ${stderr.slice(-200)}`)),
    );
    child.on("error", reject);
  });
}

async function renderSilentPlaceholders(
  lines: string[],
  outDir: string,
): Promise<{ files: string[]; totalDurationSec: number }> {
  await mkdir(outDir, { recursive: true });
  const files: string[] = [];
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const dur = Math.min(4, Math.max(1.2, text.length * 0.05));
    const out = path.join(outDir, `line_${String(i + 1).padStart(3, "0")}.wav`);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", [
        "-y",
        "-f", "lavfi",
        "-i", `anullsrc=r=24000:cl=mono`,
        "-t", dur.toFixed(2),
        "-c:a", "pcm_s16le",
        out,
      ]);
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`silent placeholder gen failed: ${stderr.slice(-200)}`)),
      );
      child.on("error", reject);
    });
    files.push(out);
    total += dur;
  }
  return { files, totalDurationSec: Math.round(total * 100) / 100 };
}

/** Reuses the same Pillow renderer the clip pipeline uses, so explainer
 *  end cards look identical to clip end cards (consistent branding). */
function renderEndCardPng(text: string, outPng: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON_BIN || "/opt/homebrew/bin/python3",
      [path.join(process.cwd(), "scripts", "render-endcard.py"), text, outPng],
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`render-endcard exited ${code}: ${stderr.slice(-200)}`)),
    );
    child.on("error", reject);
  });
}

/**
 * EXPLAINER MODE pipeline: generate original narration videos from a source.
 *
 * Unlike CLIP mode (which extracts source segments and re-publishes them),
 * EXPLAINER mode:
 *   1. Reads the source transcript
 *   2. Asks Gemma for the top N "insights" worth explaining
 *   3. For each insight, writes a 30-60s narration script in OUR voice
 *   4. Generates TTS audio with F5-TTS-MLX (or another engine)
 *   5. Picks short silent source-video cutaways aligned to the script
 *   6. Composes the final video — narration audio + silent source visuals
 *
 * Source audio is NEVER used in the output, so Content ID's music/voice
 * matchers can't fire. Only the visual fingerprint could match, and at
 * 2-3s rotating cutaways under continuous original narration that's the
 * same fair-use commentary pattern news/reaction channels already use.
 */
export async function runExplainerPipeline(jobId: string): Promise<void> {
  const job = await prisma.clipJob.findUnique({
    where: { id: jobId },
    include: {
      user: {
        select: {
          f5RefAudioPath: true,
          f5RefAudioText: true,
          clipperEndCardText: true,
        },
      },
    },
  });
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.mode !== "EXPLAINER") {
    throw new Error(`runExplainerPipeline called on non-EXPLAINER job ${jobId} (mode=${job.mode})`);
  }

  await prisma.clipJob.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      error: null,
      progress: 0,
      stageDetail: null,
    },
  });

  const workDir = path.join(CLIPPER_DIRS.workRoot, jobId);
  // Final output directory mirrors CLIP mode's layout so the same
  // /api/uploads/clips/... routes work for explainer videos too.
  const outDir = path.join(process.cwd(), ".uploads", "clips", jobId);

  try {
    // ----- 1. DOWNLOAD -----
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        stage: "DOWNLOADING",
        stageDetail: "Downloading source video",
        progress: 5,
      },
    });
    const dl = await downloadYouTube(job.sourceUrl, jobId);

    // ----- 2. TRANSCRIBE -----
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        stage: "TRANSCRIBING",
        stageDetail: "Transcribing speech",
        progress: 15,
        sourceTitle: dl.title,
        sourceDuration: Math.round(dl.durationSec),
      },
    });
    const wantTranslate = job.optTranslateCaptions === true;
    let transcript: Awaited<ReturnType<typeof transcribe>>;
    if (job.cachedTranscript) {
      try {
        transcript = JSON.parse(job.cachedTranscript);
      } catch {
        transcript = await transcribe(dl.audioPath, { translate: wantTranslate });
      }
    } else {
      transcript = await transcribe(dl.audioPath, { translate: wantTranslate });
    }
    if (transcript.segments.length === 0) {
      throw new Error("Transcript empty — likely silent or unsupported audio");
    }
    if (!job.cachedTranscript) {
      await prisma.clipJob.update({
        where: { id: jobId },
        data: { cachedTranscript: JSON.stringify(transcript) },
      });
    }

    // Concatenate transcript segments into a single readable text for Gemma.
    const fullTranscript = transcript.segments
      .map((s) => `[${s.start.toFixed(0)}s] ${s.text}`)
      .join(" ");

    // ----- 3. EXTRACT INSIGHTS -----
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        stage: "PICKING",
        stageDetail: "Finding insights worth explaining",
        progress: 30,
      },
    });
    // Cap at 4. Most podcast hours have 1-3 truly viral conclusions —
    // five is a pad. Gemma is told to return FEWER better ones, not pad
    // to the cap. Quality over quantity.
    const insights = await extractInsights(fullTranscript, dl.title, 4);
    if (insights.length === 0) {
      throw new Error("No insights extracted — source may be too short or not substantive enough");
    }
    console.log(`[explainer] ${insights.length} insights extracted for ${jobId}`);

    // ----- 4. PER-INSIGHT GENERATE -----
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        stage: "CUTTING",
        stageDetail: `Generating ${insights.length} explainer videos`,
        progress: 45,
      },
    });

    // Pre-render the source-attribution PNG once per job. Always-on
    // overlay across every explainer = consistent branding + fair-use signal.
    let attributionPngPath: string | undefined;
    try {
      const attribDir = path.join(workDir, "attribution");
      await mkdir(attribDir, { recursive: true });
      attributionPngPath = path.join(attribDir, "via.png");
      await renderAttributionPng(dl.title ?? "YouTube", attributionPngPath);
    } catch (err) {
      console.warn(`[explainer] attribution render failed for ${jobId}:`, err);
      attributionPngPath = undefined;
    }

    // Pre-detect scene changes ONCE per job — feeds the per-insight segment
    // picker so cuts land on visually-interesting shot boundaries instead
    // of evenly-spaced timestamps that might be mid-pan or mid-blur.
    let sceneChangeTs: number[] = [];
    try {
      const t0 = Date.now();
      sceneChangeTs = await detectSceneChanges(dl.videoPath, 0.3);
      console.log(
        `[explainer] scene detection: ${sceneChangeTs.length} cuts in ${Date.now() - t0}ms for ${jobId}`,
      );
    } catch (err) {
      console.warn(`[explainer] scene detection failed for ${jobId}:`, err);
    }

    // Pick a cinematic music bed ONCE per job so all explainers in this
    // source share the same musical identity. "neutral" mood works for
    // documentary-style explainer voice; falls back to any available track.
    // Returns null if assets/music/ dirs are empty — gracefully no music.
    let musicTrackPath: string | undefined;
    try {
      const pick = await pickMusicTrack("neutral");
      if (pick) {
        musicTrackPath = pick.path;
        console.log(`[explainer] music: ${path.basename(pick.path)} for ${jobId}`);
      } else {
        console.log(`[explainer] no music tracks in assets/music/, silent bed`);
      }
    } catch (err) {
      console.warn(`[explainer] music pick failed for ${jobId}:`, err);
    }

    // Detect the speaker's face position ONCE for the whole source video
    // (samples 7 frames across the duration via YuNet). Reuses the same
    // detector that clip mode uses. The same face X is then applied to
    // every explainer cutaway crop so the speaker stays in frame on
    // 16:9 → 9:16 conversion. Reasonable assumption: podcasts/interviews
    // have one main speaker who stays in roughly the same screen position.
    let faceCrop: { cropX: number; imgW: number; imgH: number } | undefined;
    try {
      const faceWorkDir = path.join(workDir, "face-detect");
      const face = await detectFaceForClip(
        dl.videoPath,
        0,
        Math.min(dl.durationSec, 600), // cap sample window at 10min for speed
        faceWorkDir,
      );
      if (face) {
        const stripW = Math.round((face.imgH * 9) / 16);
        const cropX = cropXForFace(face, stripW);
        faceCrop = { cropX, imgW: face.imgW, imgH: face.imgH };
        console.log(`[explainer] face cropX=${cropX} (${face.imgW}x${face.imgH})`);
      } else {
        console.log(`[explainer] no face detected — center-crop fallback`);
      }
    } catch (err) {
      console.warn(`[explainer] face detection failed for ${jobId}:`, err);
    }

    // Pre-render the end card if the user has set clipperEndCardText.
    // Same field powers the clip-mode end card so users get one consistent
    // outro across both pipelines.
    const endCardText = job.user.clipperEndCardText?.trim() ?? "";
    let endCardPngPath: string | undefined;
    if (endCardText.length > 0) {
      try {
        const endCardDir = path.join(workDir, "endcard");
        await mkdir(endCardDir, { recursive: true });
        endCardPngPath = path.join(endCardDir, "endcard.png");
        await renderEndCardPng(endCardText, endCardPngPath);
      } catch (err) {
        console.warn(`[explainer] end card render failed for ${jobId}:`, err);
        endCardPngPath = undefined;
      }
    }

    const captionsEnabled = job.optCaptions !== false;

    let i = 0;
    for (const insight of insights) {
      i++;
      try {
        // Write the narration script with Gemma
        const ctxStart = Math.max(0, insight.startSec - 30);
        const ctxEnd = insight.endSec + 30;
        const ctxText = transcript.segments
          .filter((s) => s.end > ctxStart && s.start < ctxEnd)
          .map((s) => s.text)
          .join(" ");
        const scriptLines = await writeExplainerScript(insight, ctxText, "energetic");
        if (scriptLines.length < 3) {
          console.warn(`[explainer] insight ${i} script too short (${scriptLines.length} lines), skipping`);
          continue;
        }

        // Generate per-line TTS narration. If the user has uploaded a
        // voice reference, F5-TTS clones its prosody — energetic ref =
        // energetic narration. Otherwise the package's default is used.
        //
        // EXPLAINER_NO_AUDIO=1 swaps real TTS for silent placeholder WAVs
        // sized by natural reading time (0.05s/char). Used during visual
        // polish iteration so the dev loop is ~2 min instead of ~25 min.
        // Will be flipped back when ElevenLabs lands as the production TTS.
        const ttsDir = path.join(workDir, `explainer-${i}`, "tts");
        const skipAudio = process.env.EXPLAINER_NO_AUDIO === "1";
        let tts: { files: string[]; totalDurationSec: number };
        if (skipAudio) {
          tts = await renderSilentPlaceholders(
            scriptLines.map((l) => l.text),
            ttsDir,
          );
        } else {
          const hasUserRef = !!job.user.f5RefAudioPath && !!job.user.f5RefAudioText;
          tts = await renderNarration(
            scriptLines.map((l) => l.text),
            ttsDir,
            {
              steps: 32,
              speed: 0.94,
              refAudioPath: hasUserRef ? job.user.f5RefAudioPath ?? undefined : undefined,
              refAudioText: hasUserRef ? job.user.f5RefAudioText ?? undefined : undefined,
            },
          );
        }

        // SURVIVAL-MODE VISUAL LAYER:
        //   - Gemma plans per-line visuals (image / ai / source) — bias
        //     toward illustrating the FACT (subject mentioned), not the
        //     host's face. Showing the same talking head 8 times kills
        //     retention faster than anything else on Shorts.
        //   - resolveVisuals fetches actual file paths (Wikipedia/
        //     Pexels/Pixabay images, fal.ai for abstract concepts) AND
        //     enforces the anchor rule: shots[0], shots[mid], shots[N-1]
        //     are always source-video for authenticity.
        //   - Lines that fail resolution fall back to source segments.
        // Pass the source transcript context — Gemma needs to know what
        // the speaker actually said in this segment so it can pick "source"
        // for narration that's paraphrasing the speaker (more accurate
        // visual mapping = documentary feel) vs "image" for things only
        // mentioned indirectly.
        const visualPlans = await planLineVisuals(insight, scriptLines, ctxText);
        const resolved = await resolveVisuals(visualPlans);

        // Pick source segments for any "source" slot in the resolved
        // plan. Pass FULL source duration so the picker can pull filler
        // from anywhere, avoiding "same clip shown 8 times" when narration
        // has more source lines than the window has distinct moments.
        const segments = pickSourceSegments(
          scriptLines,
          transcript.segments,
          { startSec: insight.startSec, endSec: insight.endSec },
          dl.durationSec,
          sceneChangeTs,
        );

        // Identify the punchiest line so its shot gets a punch-in zoom
        // override (instead of the standard variable Ken Burns rotation).
        const punchPick = pickPunchiestLine(scriptLines);
        const punchIdx = punchPick?.lineIdx ?? -1;

        // Build shot list — image shots use resolved.filePath, source
        // shots use the picked segment.
        const shots: ExplainerShot[] = scriptLines.map((line, idx) => {
          const r = resolved[idx];
          const punch = idx === punchIdx;
          if (r.kind === "image" || r.kind === "ai") {
            return {
              narrationAudioPath: tts.files[idx],
              text: line.text,
              visual: { kind: "image", filePath: r.filePath, attribution: r.attribution },
              punch,
            };
          }
          return {
            narrationAudioPath: tts.files[idx],
            text: line.text,
            visual: { kind: "source", segment: segments[idx] },
            punch,
          };
        });

        // ────── MULTI-SHOT EXPANSION ──────
        // For each LONG narration line (>3.5s) that has a usable alternate
        // visual, split the audio in half and emit TWO shots back-to-back
        // with two DIFFERENT visuals. This is the documentary-channel
        // cut-every-1-to-3-seconds pattern — we were holding the same
        // image for 5-7s which felt static. With this expansion every
        // long line shows two related-but-distinct visuals.
        const MULTI_SHOT_THRESHOLD_SEC = 3.5;
        const expandedShots: ExplainerShot[] = [];
        let multiShotCount = 0;
        for (let si = 0; si < shots.length; si++) {
          const shot = shots[si];
          const r = resolved[si];
          const audioDur = await probeAudioDur(shot.narrationAudioPath);
          const canSplit =
            audioDur > MULTI_SHOT_THRESHOLD_SEC &&
            shot.visual.kind === "image" &&
            r &&
            r.kind === "image" &&
            r.alternateFilePath;
          if (canSplit && r.kind === "image" && r.alternateFilePath) {
            const dir = path.dirname(shot.narrationAudioPath);
            const base = path.basename(shot.narrationAudioPath, path.extname(shot.narrationAudioPath));
            const part1Path = path.join(dir, `${base}_a.wav`);
            const part2Path = path.join(dir, `${base}_b.wav`);
            try {
              await splitAudioInHalf(shot.narrationAudioPath, audioDur, part1Path, part2Path);
              expandedShots.push({ ...shot, narrationAudioPath: part1Path });
              expandedShots.push({
                ...shot,
                narrationAudioPath: part2Path,
                visual: {
                  kind: "image",
                  filePath: r.alternateFilePath,
                  attribution: r.alternateAttribution ?? null,
                },
                punch: false, // alternate sub-shot never punches
              });
              multiShotCount++;
            } catch {
              expandedShots.push(shot);
            }
          } else {
            expandedShots.push(shot);
          }
        }
        shots.splice(0, shots.length, ...expandedShots);
        console.log(`[explainer] insight ${i} multi-shot expansions: ${multiShotCount}`);

        // ────── DOCUMENTARY QUOTE INSERTION ──────
        // Pick 1-2 short moments where the speaker says THE most quotable
        // thing about this insight. These play with the speaker's REAL
        // voice + face cutting in — the documentary anchor that makes the
        // explainer feel real instead of "AI narrator over photos."
        // (ColdFusion / Vox / How Money Works channels lead with quotes
        //  like this; narration BRIDGES into and out of them.)
        const quoteSegments = transcript.segments.filter(
          (seg) =>
            seg.end > Math.max(0, insight.startSec - 60) &&
            seg.start < insight.endSec + 60,
        );
        const speakerHint = dl.title?.split(/[-–|]/)[0]?.trim().slice(0, 80) || "";
        const keyQuotes = await pickKeyQuotes(insight, quoteSegments, speakerHint);
        console.log(
          `[explainer] insight ${i} key quotes: ${keyQuotes.length}` +
          (keyQuotes.length > 0
            ? ` — ${keyQuotes.map((q) => `${q.startSec.toFixed(1)}-${q.endSec.toFixed(1)}s`).join(", ")}`
            : ""),
        );

        // Insert each quote into the shot sequence at strategic positions.
        // 1 quote → after ~30% of the script (post-hook, into tension)
        // 2 quotes → first at ~30%, second at ~70% (twin anchors)
        // Quote shot uses source AV directly; narrationAudioPath is a
        // silent placeholder of matching duration (composer ignores it).
        for (let qi = 0; qi < keyQuotes.length; qi++) {
          const q = keyQuotes[qi];
          const dur = q.endSec - q.startSec;
          const placeholderPath = path.join(
            workDir, `explainer-${i}`, "tts", `quote_${qi + 1}.wav`,
          );
          await renderSilentWav(dur, placeholderPath);
          const insertFraction = keyQuotes.length === 1 ? 0.30 : (qi === 0 ? 0.30 : 0.70);
          // Compute insert index against the CURRENT shots length so that
          // the second quote lands at 70% of the post-first-quote sequence.
          const insertIdx = Math.max(2, Math.min(shots.length - 1, Math.round(shots.length * insertFraction)));
          shots.splice(insertIdx, 0, {
            narrationAudioPath: placeholderPath,
            text: q.text,
            visual: {
              kind: "source",
              segment: { startSec: q.startSec, endSec: q.endSec, kind: "aligned" },
            },
            useSourceAudio: true,
          });
        }

        const imgCount = shots.filter((s) => s.visual.kind === "image").length;
        const quoteCount = shots.filter((s) => s.useSourceAudio).length;
        const srcCount = shots.length - imgCount - quoteCount;
        console.log(
          `[explainer] insight ${i} shot mix: ${imgCount} image / ${srcCount} source / ${quoteCount} QUOTE`,
        );

        // Probe per-SHOT durations (NOT per-script-line — quote shots
        // were spliced in above and add to the timeline). For narration
        // shots this is the TTS WAV duration; for quote shots it's the
        // silent placeholder which equals the source segment duration.
        const shotDurations: number[] = [];
        for (let k = 0; k < shots.length; k++) {
          const dur = await new Promise<number>((resolve) => {
            const child = spawn("ffprobe", [
              "-v", "error", "-show_entries", "format=duration",
              "-of", "default=noprint_wrappers=1:nokey=1", shots[k].narrationAudioPath,
            ]);
            let out = "";
            child.stdout.on("data", (d) => (out += d.toString()));
            child.on("close", () => resolve(parseFloat(out.trim()) || 1));
            child.on("error", () => resolve(1));
          });
          shotDurations.push(dur);
        }
        const totalNarrSec = shotDurations.reduce((a, b) => a + b, 0);

        // Map ORIGINAL script-line index → SHOT index. Used by graphics
        // overlay timing — those are still keyed off script lines.
        const scriptLineToShotIdx: number[] = [];
        for (let s = 0; s < shots.length; s++) {
          if (!shots[s].useSourceAudio) scriptLineToShotIdx.push(s);
        }

        // Pre-build the cut-whoosh SFX track. Cut timestamps are the
        // running shot durations between shots (skip the very last
        // boundary — no cut after the final shot). Quote shots produce a
        // cut whoosh on either side which adds to the documentary feel
        // — same as a real editor highlighting the moment.
        let sfxTrackPath: string | undefined;
        try {
          const cutTs: number[] = [];
          let acc = 0;
          for (let k = 0; k < shots.length - 1; k++) {
            acc += shotDurations[k];
            cutTs.push(acc);
          }
          if (cutTs.length > 0 || endCardPngPath) {
            const sfxDir = path.join(workDir, `explainer-${i}`, "sfx");
            // Outro swoosh ~0.5s before the end-card start (end card
            // overlays the last 2.5s, so outro at totalDur - 2.7s).
            const outroAt = endCardPngPath ? Math.max(0, totalNarrSec - 2.7) : undefined;
            const built = await buildCutWhooshTrack(cutTs, totalNarrSec, sfxDir, outroAt);
            sfxTrackPath = built ?? undefined;
          }
        } catch (err) {
          console.warn(`[explainer] SFX track build failed for insight ${i}:`, err);
        }

        // Build caption frames from the per-line narration durations.
        // Each script line is split into 2-3-word CHUNKS that each get a
        // proportional slice of the line's audio duration — gives a tight
        // word-by-word feel even though we don't have whisper-aligned
        // word timestamps for the AI-generated narration. Forcing whole
        // sentences through the per-word renderer produced unreadable
        // shrunk-to-fit blocks; chunking fixes that.
        const CHUNK_WORDS = 3;
        let captionFramesDir: string | undefined;
        let captionFps: number | undefined;
        // Per-shot timestamps in the composed video. Captions iterate over
        // shots so quote shots show the speaker's actual words; graphics
        // step receives the slice of these that maps back to script lines.
        const shotTimestamps: { start: number; end: number }[] = [];
        let cursorOuter = 0;
        if (captionsEnabled) {
          let cursor = 0;
          const captionWords: CaptionWord[] = [];
          for (let k = 0; k < shots.length; k++) {
            const dur = shotDurations[k];

            // Split this shot's text into CHUNK_WORDS-sized chunks. Each
            // chunk's duration is proportional to its character count so
            // longer chunks linger longer and short ones flash by — same
            // pacing the human voice naturally takes.
            const words = shots[k].text.split(/\s+/).filter(Boolean);
            const chunks: string[] = [];
            for (let w = 0; w < words.length; w += CHUNK_WORDS) {
              chunks.push(words.slice(w, w + CHUNK_WORDS).join(" "));
            }
            shotTimestamps.push({ start: cursor, end: cursor + dur });
            if (chunks.length === 0) {
              cursor += dur;
              continue;
            }
            const totalChars = chunks.reduce((s, c) => s + c.length, 0) || 1;
            let chunkCursor = cursor;
            for (const chunk of chunks) {
              const chunkDur = (chunk.length / totalChars) * dur;
              captionWords.push({
                start: chunkCursor,
                end: chunkCursor + chunkDur,
                text: chunk,
              });
              chunkCursor += chunkDur;
            }
            cursor += dur;
          }
          cursorOuter = cursor;
          if (captionWords.length > 0 && cursor > 0) {
            try {
              const capDir = path.join(workDir, `explainer-${i}`, "caps");
              const cap = await renderCaptionFrames(
                captionWords,
                cursor,
                capDir,
                8,            // fps — enough for sentence-level captions
                1080,
                1920,
                "bold",
              );
              captionFramesDir = cap.framesDir;
              captionFps = cap.fps;
            } catch (err) {
              console.warn(`[explainer] caption render failed for insight ${i}:`, err);
            }
          }
        } else {
          // Captions disabled — still need shotTimestamps for graphics.
          let cursor = 0;
          for (let k = 0; k < shots.length; k++) {
            shotTimestamps.push({ start: cursor, end: cursor + shotDurations[k] });
            cursor += shotDurations[k];
          }
          cursorOuter = cursor;
        }

        // Slice shotTimestamps down to ONLY the script-line shots — the
        // graphics renderer expects one entry per scriptLine, not per shot.
        const lineTimestamps = scriptLineToShotIdx.map((shotIdx) => shotTimestamps[shotIdx]);

        // Render the "real vlogger editing" overlay set: title card +
        // stat callouts + pull quote. Each is a PNG with its own time
        // window — composer layers them above captions, below end-card.
        let customOverlays: Awaited<ReturnType<typeof renderInsightOverlays>> = [];
        try {
          customOverlays = await renderInsightOverlays({
            insightTitle: insight.title,
            insightIdx: i,
            insightCount: insights.length,
            scriptLines,
            lineTimestamps,
            outDir: path.join(workDir, `explainer-${i}`, "graphics"),
          });
        } catch (err) {
          console.warn(`[explainer] graphics render failed for insight ${i}:`, err);
        }
        // Avoid unused-var warning if cursorOuter stays 0 (e.g. empty scriptLines)
        void cursorOuter;

        const basename = `explainer-${String(i).padStart(2, "0")}-${insight.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 30)}`;
        const composed = await composeExplainer(
          dl.videoPath, shots, outDir, basename,
          {
            captionsFramePattern: captionFramesDir
              ? path.join(captionFramesDir, "cap_%06d.png")
              : undefined,
            captionsFps: captionFps,
            attributionPngPath,
            endCardPngPath,
            customOverlays,
            musicPath: musicTrackPath,
            musicVolumeDb: -22,
            sfxPath: sfxTrackPath,
          },
          faceCrop,
        );

        // Save Clip record (reusing CLIP table — semantic remap per ClipJob.mode):
        //   hookTitle      = insight title
        //   reason         = takeaway summary
        //   transcript     = full narration script (newline-joined)
        //   startSec/end   = 0..outputDuration (no source range concept here)
        //   videoPath      = output mp4 served via /api/uploads/clips/...
        await prisma.clip.create({
          data: {
            jobId,
            startSec: 0,
            endSec: composed.durationSec,
            durationSec: composed.durationSec,
            hookTitle: insight.title,
            reason: insight.takeaway,
            viralityScore: insight.punchScore,
            transcript: scriptLines.map((l) => l.text).join("\n"),
            videoPath: `/api/uploads/clips/${jobId}/${path.basename(composed.videoPath)}`,
            thumbnailPath: `/api/uploads/clips/${jobId}/${path.basename(composed.thumbnailPath)}`,
          },
        });

        // Cleanup per-insight TTS WAVs (output mp4 already has audio mixed in)
        await rm(ttsDir, { recursive: true, force: true }).catch(() => {});

        await prisma.clipJob.update({
          where: { id: jobId },
          data: {
            progress: Math.min(95, 45 + Math.round((50 * i) / insights.length)),
            stageDetail: `Generated ${i}/${insights.length} explainers`,
          },
        });
      } catch (err) {
        console.error(`[explainer] insight ${i} failed:`, err);
        // Don't fail the whole job — record what we have, skip this insight.
      }
    }

    // ----- 5. CLEANUP + DONE -----
    // Drop the source video to save disk (transcript is cached in DB).
    await rm(dl.videoPath, { force: true }).catch(() => {});
    await rm(dl.audioPath, { force: true }).catch(() => {});
    await rm(workDir, { recursive: true, force: true }).catch(() => {});

    const generated = await prisma.clip.count({ where: { jobId } });
    if (generated === 0) {
      throw new Error("All insights failed to render");
    }

    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        stage: "DONE",
        stageDetail: `Generated ${generated} explainer videos`,
        progress: 100,
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[explainer] pipeline failed for ${jobId}:`, msg);
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        stage: "FAILED",
        stageDetail: null,
        error: msg.slice(0, 500),
        finishedAt: new Date(),
      },
    });
    throw err;
  }
}
