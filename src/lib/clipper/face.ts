import { spawn } from "child_process";
import { mkdir, rm } from "fs/promises";
import path from "path";

const FACE_SCRIPT = path.join(process.cwd(), "scripts", "detect-face.py");

export type FaceBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  imgW: number;
  imgH: number;
};

function run(cmd: string, args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.on("close", (code) => resolve({ stdout, code: code ?? 1 }));
    child.on("error", reject);
  });
}

/**
 * Detect the dominant face position by sampling multiple frames evenly
 * across [startSec, endSec]. For talk-show / multi-shot clips, the median
 * face center is much more robust than picking from a single midpoint
 * frame — a single sample may land on a host's reaction shot and lock
 * the crop to the wrong position when the video cuts back to the guest.
 *
 * Strategy:
 *   1. Sample 5 frames at 10%, 30%, 50%, 70%, 90% of the clip
 *   2. Run detect-face on each
 *   3. Aggregate detections — return the MEDIAN face X (positionally
 *      stable to a host-frame outlier or two), with face dimensions
 *      taken from the LARGEST detected face (best signal on the speaker).
 *   4. Returns null if 0 frames had any detection.
 */
const SAMPLE_RATIOS = [0.1, 0.3, 0.5, 0.7, 0.9];

export async function detectFaceForClip(
  sourceVideo: string,
  startSec: number,
  endSec: number,
  workDir: string
): Promise<FaceBox | null> {
  await mkdir(workDir, { recursive: true });
  const dur = endSec - startSec;

  const detections = await Promise.all(
    SAMPLE_RATIOS.map(async (r) => {
      const t = startSec + dur * r;
      const framePath = path.join(workDir, `face-frame-${Date.now()}-${r}.jpg`);
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn("ffmpeg", [
            "-y",
            "-ss",
            t.toFixed(2),
            "-i",
            sourceVideo,
            "-vframes",
            "1",
            "-q:v",
            "3",
            framePath,
          ]);
          child.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`))));
          child.on("error", reject);
        });
      } catch {
        return null;
      }
      let face: FaceBox | null = null;
      try {
        const { stdout } = await run("python3", [FACE_SCRIPT, framePath]);
        const parsed = JSON.parse(stdout) as
          | (FaceBox & { detected: true })
          | { detected: false };
        if (parsed.detected) face = parsed;
      } catch {
        face = null;
      }
      rm(framePath, { force: true }).catch(() => {});
      return face;
    })
  );

  const hits = detections.filter((d): d is FaceBox => d !== null);
  if (hits.length === 0) return null;

  // Median face center X. Stable against 1-2 outlier frames (e.g., camera
  // cut to host) — outvoted by the majority of speaker frames.
  const centersX = hits.map((f) => f.x + f.w / 2).sort((a, b) => a - b);
  const medianCenterX = centersX[Math.floor(centersX.length / 2)];

  // Use the LARGEST detected face for dimensions — this is the speaker
  // when they're closest to camera, or the only person in solo shots.
  const biggest = hits.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));

  // Reconstruct the FaceBox using median-center + biggest's size
  return {
    x: Math.round(medianCenterX - biggest.w / 2),
    y: biggest.y,
    w: biggest.w,
    h: biggest.h,
    imgW: biggest.imgW,
    imgH: biggest.imgH,
  };
}

/**
 * Compute the horizontal x-offset (in source pixels) for a 9:16 crop window
 * that's centered on the detected face — clamped to the frame.
 *
 * cropW is the width of the vertical strip we'll cut (typically imgH * 9/16).
 */
export function cropXForFace(face: FaceBox, cropW: number): number {
  const faceCenterX = face.x + face.w / 2;
  const idealX = faceCenterX - cropW / 2;
  return Math.max(0, Math.min(face.imgW - cropW, idealX));
}
