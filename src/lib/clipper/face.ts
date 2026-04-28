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

type RawFace = {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
};

type DetectionFrame = {
  imgW: number;
  imgH: number;
  faces: RawFace[];
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

const SAMPLE_RATIOS = [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92];
/** Two face centers within this fraction of the frame width are treated
 *  as "the same person across frames" for clustering. 18% works for talk
 *  shows where speakers stay roughly in their seat (host on left, guest
 *  on right); tighter values fragment the same speaker into multiple
 *  clusters when they lean forward/back. */
const CLUSTER_BAND = 0.18;

async function detectOne(
  sourceVideo: string,
  t: number,
  workDir: string,
  tag: string,
): Promise<DetectionFrame | null> {
  const framePath = path.join(workDir, `face-frame-${tag}.jpg`);
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
  let result: DetectionFrame | null = null;
  try {
    const { stdout } = await run("python3", [FACE_SCRIPT, framePath]);
    const parsed = JSON.parse(stdout) as
      | { detected: true; faces: RawFace[]; imgW: number; imgH: number }
      | { detected: false; imgW?: number; imgH?: number };
    if (parsed.detected) {
      result = { imgW: parsed.imgW, imgH: parsed.imgH, faces: parsed.faces };
    } else if (parsed.imgW && parsed.imgH) {
      result = { imgW: parsed.imgW, imgH: parsed.imgH, faces: [] };
    }
  } catch {
    result = null;
  }
  rm(framePath, { force: true }).catch(() => {});
  return result;
}

/**
 * Pick the speaker face by clustering detections across many sample frames.
 *
 * Why clustering instead of per-frame "biggest face":
 *   - In a talk show with host + guest, each frame may show 2 faces. Picking
 *     the biggest in each frame yields the host on some frames, guest on
 *     others, then a median X that's halfway between (= empty space).
 *   - Clustering by face-center-X groups detections of the same person
 *     across frames. The cluster with the most members IS the speaker on
 *     screen most often.
 *   - Within that cluster we use the median X for stability (outvotes
 *     1-2 frames where the person leaned out of position) and the median
 *     face DIMENSIONS from the same cluster (no more attribute mixing).
 *
 * Returns null if nothing was detected anywhere — caller should fall back
 * to a centered crop (better than locking onto a wrong position).
 */
export async function detectFaceForClip(
  sourceVideo: string,
  startSec: number,
  endSec: number,
  workDir: string,
): Promise<FaceBox | null> {
  await mkdir(workDir, { recursive: true });
  const dur = endSec - startSec;
  const stamp = Date.now();

  const frames = await Promise.all(
    SAMPLE_RATIOS.map((r, i) =>
      detectOne(sourceVideo, startSec + dur * r, workDir, `${stamp}-${i}`),
    ),
  );

  // Aggregate every detected face from every frame, tagged with image
  // dims so we can compare positions normalised to frame width.
  type Detection = RawFace & { imgW: number; imgH: number; centerX: number };
  const all: Detection[] = [];
  let imgW = 0;
  let imgH = 0;
  for (const fr of frames) {
    if (!fr) continue;
    imgW = fr.imgW;
    imgH = fr.imgH;
    for (const f of fr.faces) {
      all.push({
        ...f,
        imgW: fr.imgW,
        imgH: fr.imgH,
        centerX: f.x + f.w / 2,
      });
    }
  }

  if (all.length === 0 || imgW === 0) return null;

  // Cluster by face-center-X. Greedy: for each detection, attach to the
  // first cluster whose mean center is within CLUSTER_BAND * imgW.
  const bandPx = imgW * CLUSTER_BAND;
  const clusters: Detection[][] = [];
  for (const d of all) {
    let attached = false;
    for (const c of clusters) {
      const mean = c.reduce((s, x) => s + x.centerX, 0) / c.length;
      if (Math.abs(mean - d.centerX) <= bandPx) {
        c.push(d);
        attached = true;
        break;
      }
    }
    if (!attached) clusters.push([d]);
  }

  // Speaker = cluster that appears in the most distinct sample frames.
  // Tiebreak by total detection score (= confidence × frequency).
  clusters.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const sb = b.reduce((s, x) => s + x.score, 0);
    const sa = a.reduce((s, x) => s + x.score, 0);
    return sb - sa;
  });
  const speaker = clusters[0];

  // Median position + dimensions from THIS cluster (no cross-frame mixing).
  const sortedX = [...speaker].sort((a, b) => a.centerX - b.centerX);
  const sortedY = [...speaker].sort((a, b) => a.y - b.y);
  const sortedW = [...speaker].sort((a, b) => a.w - b.w);
  const sortedH = [...speaker].sort((a, b) => a.h - b.h);
  const mid = Math.floor(speaker.length / 2);

  const medianCenterX = sortedX[mid].centerX;
  const medianY = sortedY[mid].y;
  const medianW = sortedW[mid].w;
  const medianH = sortedH[mid].h;

  return {
    x: Math.round(medianCenterX - medianW / 2),
    y: Math.round(medianY),
    w: Math.round(medianW),
    h: Math.round(medianH),
    imgW,
    imgH,
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
