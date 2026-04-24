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
 * Detect the largest face in a frame extracted from the source video at the
 * midpoint of [startSec, endSec]. Returns null if no face was found or
 * detection failed (caller falls back to center-crop).
 */
export async function detectFaceForClip(
  sourceVideo: string,
  startSec: number,
  endSec: number,
  workDir: string
): Promise<FaceBox | null> {
  await mkdir(workDir, { recursive: true });
  const midSec = startSec + (endSec - startSec) / 2;
  const framePath = path.join(workDir, `face-frame-${Date.now()}.jpg`);

  // Extract one frame at the midpoint (re-encode JPEG)
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", [
        "-y",
        "-ss",
        midSec.toFixed(2),
        "-i",
        sourceVideo,
        "-vframes",
        "1",
        "-q:v",
        "3",
        framePath,
      ]);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
      child.on("error", reject);
    });
  } catch {
    return null;
  }

  let result: FaceBox | null = null;
  try {
    const { stdout } = await run("python3", [FACE_SCRIPT, framePath]);
    const parsed = JSON.parse(stdout) as
      | (FaceBox & { detected: true })
      | { detected: false };
    if (parsed.detected) {
      result = parsed;
    }
  } catch {
    result = null;
  }

  rm(framePath, { force: true }).catch(() => {});
  return result;
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
