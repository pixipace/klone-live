import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { CLIPPER_DIRS } from "./types";
import { downloadYouTube } from "./youtube";
import { transcribe } from "./whisper";
import { pickClips } from "./picker";
import { cutVerticalClip, type EditOptions } from "./cutter";
import { pickMusicTrack } from "./music";
import { findSilentGaps } from "./silence";
import { detectFaceForClip, cropXForFace } from "./face";
import { pickMood } from "@/lib/ai";

const CLIP_OUTPUT_ROOT = path.join(process.cwd(), ".uploads", "clips");

export async function runPipeline(jobId: string): Promise<void> {
  const job = await prisma.clipJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} not found`);

  await prisma.clipJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), error: null },
  });

  const workDir = path.join(CLIPPER_DIRS.workRoot, jobId);

  try {
    await prisma.clipJob.update({
      where: { id: jobId },
      data: { stage: "DOWNLOADING" },
    });
    const dl = await downloadYouTube(job.sourceUrl, jobId);

    await prisma.clipJob.update({
      where: { id: jobId },
      data: {
        stage: "TRANSCRIBING",
        sourceTitle: dl.title,
        sourceDuration: Math.round(dl.durationSec),
      },
    });
    const transcript = await transcribe(dl.audioPath);

    if (transcript.segments.length === 0) {
      throw new Error("Transcript empty — likely silent or unsupported audio");
    }

    await prisma.clipJob.update({
      where: { id: jobId },
      data: { stage: "PICKING" },
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
      data: { stage: "CUTTING" },
    });

    const clipOutDir = path.join(CLIP_OUTPUT_ROOT, jobId);
    let cutCount = 0;
    let cutFails = 0;

    for (let i = 0; i < createdClips.length; i++) {
      const clip = createdClips[i];
      const basename = `clip-${String(i + 1).padStart(2, "0")}-${clip.id.slice(0, 6)}`;
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
        let musicPick: { path: string; attribution: string | null } | null = null;
        try {
          const clipTranscript = clip.transcript ?? "";
          const mood = await pickMood(clipTranscript, clip.hookTitle);
          musicPick = await pickMusicTrack(mood);
        } catch (moodErr) {
          console.warn(`[clipper] mood detect failed for ${clip.id}:`, moodErr);
          musicPick = await pickMusicTrack();
        }

        const editOpts: EditOptions = {
          hookOverlay: { text: clip.hookTitle, durationSec: 4 },
          musicPath: musicPick?.path,
          musicVolumeDb: -25,
          zoom: true,
          cropX,
          removeRanges: gaps,
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
