import { rm, mkdir } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { prisma } from "@/lib/prisma";
import { CLIPPER_DIRS } from "./types";
import { downloadYouTube } from "./youtube";
import { transcribe, transcribeClipWords } from "./whisper";
import { pickClipsChunked } from "./picker";
import { cutVerticalClip, type EditOptions } from "./cutter";
import { renderCaptionFrames } from "./captions";
import { pickMusicTrack } from "./music";
import { pickHookInSfx, pickHookOutSfx, pickOutroSfx, pickImpactSfx } from "./sfx";
import { findSilentGaps, totalRemovedSec } from "./silence";
import { detectFaceForClip, cropXForFace } from "./face";
import { resolveClipBroll } from "./broll";
import { pickMood, pickEmphasisMoments } from "@/lib/ai";

const CLIP_OUTPUT_ROOT = path.join(process.cwd(), ".uploads", "clips");

function renderEndCard(text: string, outPng: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON_BIN || "/opt/homebrew/bin/python3",
      [path.join(process.cwd(), "scripts", "render-endcard.py"), text, outPng]
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`render-endcard exited ${code}: ${stderr.slice(-200)}`))
    );
    child.on("error", reject);
  });
}

export async function runPipeline(jobId: string): Promise<void> {
  const job = await prisma.clipJob.findUnique({
    where: { id: jobId },
    include: {
      user: {
        select: { clipperCaptionStyle: true, clipperEndCardText: true },
      },
    },
  });
  if (!job) throw new Error(`Job ${jobId} not found`);

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

  try {
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        stage: "DOWNLOADING",
        stageDetail: "Downloading source video",
        progress: 5,
      },
    });
    const dl = await downloadYouTube(job.sourceUrl, jobId);

    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        stage: "TRANSCRIBING",
        stageDetail: "Transcribing speech (this is the slow part)",
        progress: 15,
        sourceTitle: dl.title,
        sourceDuration: Math.round(dl.durationSec),
      },
    });
    // Use cached transcript if present (re-pick scenario) to skip the slow
    // 4-min whisper segment pass. yt-dlp re-download is unavoidable since
    // we delete source videos after each run to save disk.
    // Translation flag affects the source transcript (so Gemma sees English
    // even if speaker is in Hindi/etc) AND per-clip caption transcripts.
    const wantTranslate = job.optTranslateCaptions === true;
    let transcript: Awaited<ReturnType<typeof transcribe>>;
    if (job.cachedTranscript) {
      try {
        transcript = JSON.parse(job.cachedTranscript);
        console.log(`[clipper] using cached transcript for ${jobId}`);
      } catch {
        transcript = await transcribe(dl.audioPath, { translate: wantTranslate });
      }
    } else {
      transcript = await transcribe(dl.audioPath, { translate: wantTranslate });
    }

    if (transcript.segments.length === 0) {
      throw new Error("Transcript empty — likely silent or unsupported audio");
    }

    // Cache transcript for future re-picks
    if (!job.cachedTranscript) {
      await prisma.clipJob.update({
        where: { id: jobId },
        data: { cachedTranscript: JSON.stringify(transcript) },
      });
    }

    // Per-job toggles (set at submit time, falls back to env var, then default)
    const captionsEnabled =
      job.optCaptions !== false &&
      process.env.CAPTIONS_ENABLED !== "false";
    const musicEnabled = job.optMusic !== false;
    const punchZoomsEnabled = job.optPunchZooms !== false;
    const brollEnabled = job.optBroll === true;
    const translateCaptions = job.optTranslateCaptions === true;
    const guidance = job.pickerGuidance ?? undefined;
    // Allow the three styles render-captions.py understands. Anything else
    // (incl. legacy "minimal") falls through to "bold" — the new default.
    const captionStyle = (
      job.user.clipperCaptionStyle === "classic" ||
      job.user.clipperCaptionStyle === "yellow"
        ? job.user.clipperCaptionStyle
        : "bold"
    ) as "classic" | "bold" | "yellow";
    const endCardText = job.user.clipperEndCardText?.trim() ?? "";

    // Pre-render end card once per job (same PNG reused for every clip)
    let endCardPath: string | undefined;
    if (endCardText.length > 0) {
      try {
        const endCardDir = path.join(workDir, "endcard");
        await mkdir(endCardDir, { recursive: true });
        endCardPath = path.join(endCardDir, "endcard.png");
        await renderEndCard(endCardText, endCardPath);
      } catch (err) {
        console.warn(`[clipper] endcard render failed for ${jobId}:`, err);
        endCardPath = undefined;
      }
    }
    if (
      !captionsEnabled ||
      !musicEnabled ||
      !punchZoomsEnabled ||
      brollEnabled ||
      translateCaptions ||
      guidance
    ) {
      console.log(
        `[clipper] toggles for ${jobId}: captions=${captionsEnabled} music=${musicEnabled} punchZooms=${punchZoomsEnabled} broll=${brollEnabled} translate=${translateCaptions} guidance=${guidance ? `"${guidance.slice(0, 60)}…"` : "no"}`
      );
    }

    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        stage: "PICKING",
        stageDetail: "AI picking viral moments",
        progress: 45,
      },
    });
    // Chunked picker: short sources (<= 30 min) call Gemma once; long
    // sources are split into overlapping 30-min windows, each picked
    // independently, then merged + dedupe + capped. Keeps Gemma's prompt
    // small so quality stays high even on 3-hour sources.
    const picks = await pickClipsChunked(
      transcript.segments,
      dl.title,
      async (chunkIdx, totalChunks) => {
        if (totalChunks <= 1) return;
        const pickProgressBase = 45;
        const pickProgressSpan = 10;
        await prisma.clipJob.update({
          where: { id: jobId },
          data: {
            stageDetail: `AI picking viral moments (window ${chunkIdx + 1}/${totalChunks})`,
            progress: Math.round(
              pickProgressBase + (pickProgressSpan * chunkIdx) / totalChunks
            ),
          },
        });
      },
      guidance
    );

    if (picks.length === 0) {
      throw new Error("No viable clips found in transcript");
    }

    const createdClips = await prisma.$transaction(
      picks.map((p) =>
        prisma.clip.create({
          data: {
            jobId,
            startSec: p.startSec,
            endSec: p.endSec,
            durationSec: p.endSec - p.startSec,
            hookTitle: p.hookTitle,
            hookVariants:
              p.hookVariants.length > 0
                ? JSON.stringify(p.hookVariants)
                : null,
            reason: p.reason,
            viralityScore: p.viralityScore,
            transcript: transcript.segments
              .filter((s) => s.start < p.endSec && s.end > p.startSec)
              .map((s) => s.text)
              .join(" "),
          },
        })
      )
    );

    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        stage: "CUTTING",
        stageDetail: `Cutting ${createdClips.length} clip${createdClips.length === 1 ? "" : "s"}`,
        progress: 55,
      },
    });

    const clipOutDir = path.join(CLIP_OUTPUT_ROOT, jobId);
    let cutCount = 0;
    let cutFails = 0;

    for (let i = 0; i < createdClips.length; i++) {
      const clip = createdClips[i];
      const basename = `clip-${String(i + 1).padStart(2, "0")}-${clip.id.slice(0, 6)}`;
      const cutBaseProgress = 55;
      const cutPerClip = (95 - cutBaseProgress) / createdClips.length;
      await prisma.clipJob.update({
        where: { id: jobId },
        data: {
          stageDetail: `Cutting clip ${i + 1} of ${createdClips.length}`,
          progress: Math.round(cutBaseProgress + cutPerClip * i),
        },
      });
      try {
        // Pre-compute silence gaps + output duration synchronously so
        // B-roll resolution can run inside the parallel prep block too
        // (B-roll picker uses input-time, we map → output-time post-trim).
        const gaps = findSilentGaps(
          transcript.segments,
          clip.startSec,
          clip.endSec
        );
        const HOOK_DUR = 4;
        const OUTRO_LEAD = 0.6;
        const inputDur = clip.endSec - clip.startSec;
        const outputDur = inputDur - totalRemovedSec(gaps);

        // Convert input-time t → cumulative seconds removed before t. Used to
        // map B-roll moments (picked in input time) onto the post-trim timeline.
        const silenceMappingFn = (inputT: number): number =>
          gaps
            .filter((g) => g.endSec <= inputT)
            .reduce((sum, g) => sum + (g.endSec - g.startSec), 0);

        // Face detection runs first (sequentially) because B-roll's PiP
        // placement depends on which side of the cropped frame the
        // speaker's face ends up on. The other prep tasks then run in
        // parallel alongside B-roll resolution.
        const face = await detectFaceForClip(
          dl.videoPath,
          clip.startSec,
          clip.endSec,
          workDir
        ).catch((err) => {
          console.warn(`[clipper] face detect failed for ${clip.id}:`, err);
          return null;
        });

        let cropX: number | undefined;
        let brollSide: "left" | "right" = "right";
        if (face) {
          const stripW = (face.imgH * 9) / 16;
          cropX = cropXForFace(face, stripW);
          // Where does the face land in the OUTPUT frame? If face center
          // is in the right half of the crop, put B-roll on the LEFT
          // (and vice versa) so they don't compete for visual attention.
          const faceCenterInCrop = face.x + face.w / 2 - cropX;
          brollSide = faceCenterInCrop > stripW / 2 ? "left" : "right";
        }

        const [moodPickResult, emphasisMomentsRaw, brollOverlays] = await Promise.all([
          musicEnabled
            ? pickMood(clip.transcript ?? "", clip.hookTitle)
                .then((mood) => pickMusicTrack(mood))
                .catch(async (err) => {
                  console.warn(`[clipper] mood detect failed for ${clip.id}:`, err);
                  return pickMusicTrack();
                })
            : Promise.resolve(null),
          punchZoomsEnabled
            ? pickEmphasisMoments(
                transcript.segments,
                clip.startSec,
                clip.endSec,
                2
              ).catch((err) => {
                console.warn(`[clipper] emphasis pick failed for ${clip.id}:`, err);
                return [];
              })
            : Promise.resolve([]),
          brollEnabled
            ? resolveClipBroll({
                segments: transcript.segments,
                clipStart: clip.startSec,
                clipEnd: clip.endSec,
                outputDur,
                workDir,
                clipId: clip.id,
                side: brollSide,
                silenceMappingFn,
              }).catch((err) => {
                console.warn(`[clipper] broll resolve failed for ${clip.id}:`, err);
                return [];
              })
            : Promise.resolve([]),
        ]);

        const musicPick = moodPickResult;

        const sfxs: Array<{ path: string; startSec: number; volumeDb?: number }> = [];
        const hookInPath = await pickHookInSfx();
        if (hookInPath) sfxs.push({ path: hookInPath, startSec: 0, volumeDb: -12 });

        const hookOutPath = await pickHookOutSfx();
        if (hookOutPath)
          sfxs.push({
            path: hookOutPath,
            startSec: Math.max(0, HOOK_DUR - 0.4),
            volumeDb: -14,
          });

        const outroPath = await pickOutroSfx();
        if (outroPath && outputDur > OUTRO_LEAD)
          sfxs.push({
            path: outroPath,
            startSec: outputDur - OUTRO_LEAD,
            volumeDb: -12,
          });

        // Punch zooms — emphasisMomentsRaw was already fetched in the
        // parallel block above. Convert input-time → output-time by
        // subtracting any silence gaps that fall before the moment.
        const punchZooms: Array<{ atSec: number }> = punchZoomsEnabled
          ? emphasisMomentsRaw
              .map((m) => {
                const removedBefore = gaps
                  .filter((g) => g.endSec < m.atSec)
                  .reduce((sum, g) => sum + (g.endSec - g.startSec), 0);
                return { atSec: m.atSec - removedBefore };
              })
              .filter((p) => p.atSec >= 0 && p.atSec + 0.6 < outputDur)
          : [];

        if (punchZoomsEnabled && punchZooms.length > 0) {
          // Impact SFX synced to each punch (peak at +0.3s)
          const impactPath = await pickImpactSfx();
          if (impactPath) {
            for (const p of punchZooms) {
              sfxs.push({
                path: impactPath,
                startSec: Math.max(0, p.atSec + 0.2),
                volumeDb: -10,
              });
            }
          }
        }

        // Word-by-word captions for this clip — transcribe just this clip's
        // audio slice with -ml 1 (much faster than full source pass).
        let captions: EditOptions["captions"];
        if (captionsEnabled) {
          try {
            const clipWords = await transcribeClipWords(
              dl.audioPath,
              clip.startSec,
              clip.endSec,
              workDir,
              `clip-${i + 1}`,
              { translate: translateCaptions }
            );
            // whisper.cpp -sow -dtw gives phrase-level segments (high-accuracy
            // timing) not true single-word output. We split each segment into
            // its constituent words and distribute the segment's duration
            // across them by character length — preserves DTW timing while
            // letting the caption renderer show a proper word-by-word effect.
            const words = clipWords.segments
              .flatMap((s) => {
                const trimmed = s.text.replace(/^\s+|\s+$/g, "");
                const parts = trimmed.split(/\s+/).filter(Boolean);
                if (parts.length <= 1) {
                  return parts.length === 1
                    ? [{ start: s.start, end: s.end, text: parts[0] }]
                    : [];
                }
                const dur = Math.max(0, s.end - s.start);
                const totalChars = parts.reduce((a, p) => a + p.length, 0) || 1;
                let cursor = s.start;
                return parts.map((p) => {
                  const wDur = (p.length / totalChars) * dur;
                  const wEnd = cursor + wDur;
                  const out = { start: cursor, end: wEnd, text: p };
                  cursor = wEnd;
                  return out;
                });
              })
              .filter((w) => w.text.length > 0 && w.end > w.start);
            if (words.length > 0) {
              const capsDir = path.join(workDir, `caps-${clip.id}`);
              const rendered = await renderCaptionFrames(
                words,
                outputDur,
                capsDir,
                8,
                1080,
                1920,
                captionStyle
              );
              captions = {
                framePattern: rendered.framePattern,
                fps: rendered.fps,
              };
            }
          } catch (capsErr) {
            console.warn(`[clipper] caption render failed for ${clip.id}:`, capsErr);
          }
        }

        const editOpts: EditOptions = {
          hookOverlay: { text: clip.hookTitle, durationSec: HOOK_DUR },
          musicPath: musicPick?.path,
          musicVolumeDb: -22,
          sfxs,
          zoom: true,
          cinematic: true,
          vignette: true,
          punchZooms,
          cropX,
          removeRanges: gaps,
          captions,
          brollOverlays:
            brollOverlays.length > 0
              ? brollOverlays.map((b) => ({
                  framePath: b.framePath,
                  startSec: b.startSec,
                  endSec: b.endSec,
                }))
              : undefined,
          endCardPath,
          captionStyle,
        };

        const out = await cutVerticalClip(
          dl.videoPath,
          clip.startSec,
          clip.endSec,
          clipOutDir,
          basename,
          editOpts
        );
        await prisma.clip.update({
          where: { id: clip.id },
          data: {
            videoPath: `/api/uploads/clips/${jobId}/${path.basename(out.videoPath)}`,
            thumbnailPath: `/api/uploads/clips/${jobId}/${path.basename(out.thumbnailPath)}`,
            musicAttribution: musicPick?.attribution ?? null,
            brollMoments:
              brollOverlays.length > 0
                ? JSON.stringify(
                    brollOverlays.map((b) => ({
                      startSec: Number(b.startSec.toFixed(2)),
                      endSec: Number(b.endSec.toFixed(2)),
                      query: b.query,
                      source: b.source,
                      attribution: b.attribution,
                    }))
                  )
                : null,
          },
        });
        cutCount += 1;
      } catch (cutErr) {
        cutFails += 1;
        console.error(`[clipper] cut failed for clip ${clip.id}:`, cutErr);
        // One clip failing is not fatal — keep going.
      }
    }

    if (cutCount === 0) {
      throw new Error("All clip cuts failed — see logs");
    }

    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        stage: "DONE",
        stageDetail: `${cutCount} clip${cutCount === 1 ? "" : "s"} ready`,
        progress: 100,
        finishedAt: new Date(),
        error: cutFails > 0 ? `${cutFails} clip(s) failed to cut` : null,
      },
    });

    rm(workDir, { recursive: true, force: true }).catch(() => {});
  } catch (err) {
    console.error(`[clipper] job ${jobId} failed:`, err);
    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        stage: "FAILED",
        error: String(err instanceof Error ? err.message : err).slice(0, 500),
        finishedAt: new Date(),
      },
    });
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
