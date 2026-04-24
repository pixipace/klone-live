import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { CLIPPER_DIRS } from "./types";
import { downloadYouTube } from "./youtube";
import { transcribe, transcribeClipWords } from "./whisper";
import { pickClips } from "./picker";
import { cutVerticalClip, type EditOptions } from "./cutter";
import { renderCaptionFrames } from "./captions";
import { pickMusicTrack } from "./music";
import { pickHookInSfx, pickHookOutSfx, pickOutroSfx, pickImpactSfx } from "./sfx";
import { findSilentGaps, totalRemovedSec } from "./silence";
import { detectFaceForClip, cropXForFace } from "./face";
import { pickMood, pickEmphasisMoments } from "@/lib/ai";

const CLIP_OUTPUT_ROOT = path.join(process.cwd(), ".uploads", "clips");

export async function runPipeline(jobId: string): Promise<void> {
  const job = await prisma.clipJob.findUnique({ where: { id: jobId } });
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
    const transcript = await transcribe(dl.audioPath);

    if (transcript.segments.length === 0) {
      throw new Error("Transcript empty — likely silent or unsupported audio");
    }

    // Per-job toggles (set at submit time, falls back to env var, then default)
    const captionsEnabled =
      job.optCaptions !== false &&
      process.env.CAPTIONS_ENABLED !== "false";
    const musicEnabled = job.optMusic !== false;
    const punchZoomsEnabled = job.optPunchZooms !== false;
    if (!captionsEnabled || !musicEnabled || !punchZoomsEnabled) {
      console.log(
        `[clipper] toggles for ${jobId}: captions=${captionsEnabled} music=${musicEnabled} punchZooms=${punchZoomsEnabled}`
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
    const picks = await pickClips(transcript.segments, dl.title);

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
        // Face detect on the midpoint frame for this clip's range
        let cropX: number | undefined;
        try {
          const face = await detectFaceForClip(
            dl.videoPath,
            clip.startSec,
            clip.endSec,
            workDir
          );
          if (face) {
            // 9:16 strip width in source pixels
            const stripW = (face.imgH * 9) / 16;
            cropX = cropXForFace(face, stripW);
          }
        } catch (faceErr) {
          console.warn(`[clipper] face detect failed for ${clip.id}:`, faceErr);
        }

        // Silence gaps from Whisper
        const gaps = findSilentGaps(
          transcript.segments,
          clip.startSec,
          clip.endSec
        );

        // Mood-aware music: Gemma classifies the clip, then pickMusicTrack
        // tries the matching mood folder, falling back to the flat root.
        // Skip entirely if music toggle is off.
        let musicPick: { path: string; attribution: string | null } | null = null;
        if (musicEnabled) {
          try {
            const clipTranscript = clip.transcript ?? "";
            const mood = await pickMood(clipTranscript, clip.hookTitle);
            musicPick = await pickMusicTrack(mood);
          } catch (moodErr) {
            console.warn(`[clipper] mood detect failed for ${clip.id}:`, moodErr);
            musicPick = await pickMusicTrack();
          }
        }

        const HOOK_DUR = 4;
        const OUTRO_LEAD = 0.6;
        const inputDur = clip.endSec - clip.startSec;
        const outputDur = inputDur - totalRemovedSec(gaps);

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

        // Punch zoom moments — Gemma picks 1-2 emphasis beats.
        // Skip entirely if punch zooms toggled off.
        let punchZooms: Array<{ atSec: number }> = [];
        if (punchZoomsEnabled) {
          try {
            const moments = await pickEmphasisMoments(
              transcript.segments,
              clip.startSec,
              clip.endSec,
              2
            );
            punchZooms = moments
              .map((m) => {
                const removedBefore = gaps
                  .filter((g) => g.endSec < m.atSec)
                  .reduce((sum, g) => sum + (g.endSec - g.startSec), 0);
                return { atSec: m.atSec - removedBefore };
              })
              .filter((p) => p.atSec >= 0 && p.atSec + 0.6 < outputDur);

            // Add an impact SFX synced to each punch (peak at +0.3s)
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
          } catch (emphasisErr) {
            console.warn(`[clipper] emphasis pick failed for ${clip.id}:`, emphasisErr);
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
              `clip-${i + 1}`
            );
            // Already clip-relative
            const words = clipWords.segments
              .map((s) => ({
                start: s.start,
                end: s.end,
                text: s.text.replace(/^\s+|\s+$/g, ""),
              }))
              .filter((w) => w.text.length > 0 && w.end > w.start);
            if (words.length > 0) {
              const capsDir = path.join(workDir, `caps-${clip.id}`);
              const rendered = await renderCaptionFrames(
                words,
                outputDur,
                capsDir,
                12
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
