import { spawn } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";

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

export type CutResult = {
  videoPath: string;
  thumbnailPath: string;
};

export async function cutVerticalClip(
  sourceVideo: string,
  startSec: number,
  endSec: number,
  outDir: string,
  basename: string
): Promise<CutResult> {
  await mkdir(outDir, { recursive: true });
  const videoPath = path.join(outDir, `${basename}.mp4`);
  const thumbnailPath = path.join(outDir, `${basename}.jpg`);
  const duration = endSec - startSec;

  // crop=ih*9/16:ih — vertical strip from the middle of the source
  // pad/scale to exact 1080x1920 to handle various source aspect ratios
  const vfChain = [
    "crop=ih*9/16:ih",
    `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase`,
    `crop=${TARGET_W}:${TARGET_H}`,
  ].join(",");

  await run("ffmpeg", [
    "-y",
    "-ss",
    startSec.toFixed(2),
    "-i",
    sourceVideo,
    "-t",
    duration.toFixed(2),
    "-vf",
    vfChain,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    videoPath,
  ]);

  // Thumbnail from the middle of the clip
  const midOffset = duration / 2;
  await run("ffmpeg", [
    "-y",
    "-ss",
    midOffset.toFixed(2),
    "-i",
    videoPath,
    "-vframes",
    "1",
    "-q:v",
    "3",
    thumbnailPath,
  ]);

  return { videoPath, thumbnailPath };
}
