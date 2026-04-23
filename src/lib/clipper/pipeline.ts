import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { CLIPPER_DIRS } from "./types";
import { downloadYouTube } from "./youtube";
import { transcribe } from "./whisper";
import { pickClips } from "./picker";

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

    await prisma.$transaction(
      picks.map((p) =>
        prisma.clip.create({
          data: {
            jobId,
            startSec: p.startSec,
            endSec: p.endSec,
            durationSec: p.endSec - p.startSec,
            hookTitle: p.hookTitle,
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
        status: "DONE",
        stage: "DONE",
        finishedAt: new Date(),
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
