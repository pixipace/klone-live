import { spawn } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";
import { CLIPPER_DIRS } from "./types";

export type DownloadResult = {
  videoPath: string;
  audioPath: string;
  durationSec: number;
  title: string;
};

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`));
    });
    child.on("error", reject);
  });
}

export async function downloadYouTube(
  url: string,
  jobId: string
): Promise<DownloadResult> {
  const workDir = path.join(CLIPPER_DIRS.workRoot, jobId);
  await mkdir(workDir, { recursive: true });

  const videoTemplate = path.join(workDir, "source.%(ext)s");
  const audioPath = path.join(workDir, "audio.wav");

  await run("yt-dlp", [
    "--no-playlist",
    "-f",
    "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
    "--merge-output-format",
    "mp4",
    "-o",
    videoTemplate,
    url,
  ]);

  const videoPath = path.join(workDir, "source.mp4");

  await run("ffmpeg", [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    audioPath,
  ]);

  const probe = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  const durationSec = parseFloat(probe.stdout.trim()) || 0;

  let title = "Untitled";
  try {
    const meta = await run("yt-dlp", ["--no-playlist", "--print", "%(title)s", url]);
    title = meta.stdout.trim() || title;
  } catch {
    // ignore — title is best-effort
  }

  return { videoPath, audioPath, durationSec, title };
}
