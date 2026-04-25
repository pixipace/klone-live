import { spawn } from "child_process";
import { mkdir, copyFile, stat, readdir, rm } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { CLIPPER_DIRS } from "./types";

// Source-video cache lives at .uploads/source-cache/. Keyed by SHA1 of
// the YouTube URL. Re-downloading the same URL within CACHE_TTL_DAYS
// just copies from cache (saves 30-60s + bandwidth on retries / re-picks
// triggered before transcript was cached).
const SOURCE_CACHE_ROOT = path.join(process.cwd(), ".uploads", "source-cache");
const CACHE_TTL_DAYS = 7;

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

export async function probeYouTubeDuration(url: string): Promise<number> {
  const { stdout } = await run("yt-dlp", [
    "--no-playlist",
    "--print",
    "%(duration)s",
    url,
  ]);
  const sec = parseFloat(stdout.trim());
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error("Could not determine video duration");
  }
  return sec;
}

export async function downloadYouTube(
  url: string,
  jobId: string
): Promise<DownloadResult> {
  const workDir = path.join(CLIPPER_DIRS.workRoot, jobId);
  await mkdir(workDir, { recursive: true });

  const videoPath = path.join(workDir, "source.mp4");
  const audioPath = path.join(workDir, "audio.wav");

  // Check cache first — if a fresh copy of this URL exists, hardlink/copy
  // into the work directory and skip yt-dlp entirely.
  const cached = await readSourceCache(url);
  if (cached) {
    console.log(`[youtube] cache HIT for ${url} (saved ~30-60s download)`);
    await copyFile(cached.videoPath, videoPath);
  } else {
    const videoTemplate = path.join(workDir, "source.%(ext)s");
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
  }

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

  let title = cached?.title ?? "Untitled";
  if (!cached) {
    try {
      const meta = await run("yt-dlp", ["--no-playlist", "--print", "%(title)s", url]);
      title = meta.stdout.trim() || title;
    } catch {
      // ignore — title is best-effort
    }
    // Populate cache for next time (fire-and-forget — don't block the job)
    writeSourceCache(url, videoPath, title).catch((err) =>
      console.warn(`[youtube] cache write failed:`, err)
    );
  }

  return { videoPath, audioPath, durationSec, title };
}

function urlHash(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex");
}

async function readSourceCache(
  url: string
): Promise<{ videoPath: string; title: string } | null> {
  const dir = path.join(SOURCE_CACHE_ROOT, urlHash(url));
  try {
    const videoPath = path.join(dir, "source.mp4");
    const titlePath = path.join(dir, "title.txt");
    const s = await stat(videoPath);
    const ageMs = Date.now() - s.mtimeMs;
    if (ageMs > CACHE_TTL_DAYS * 86400 * 1000) {
      // Expired — delete and miss
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      return null;
    }
    let title = "Untitled";
    try {
      const buf = await stat(titlePath);
      if (buf.size > 0) {
        const fs = await import("fs/promises");
        title = (await fs.readFile(titlePath, "utf8")).trim() || title;
      }
    } catch {
      // title.txt is optional
    }
    return { videoPath, title };
  } catch {
    return null;
  }
}

async function writeSourceCache(
  url: string,
  videoPath: string,
  title: string
): Promise<void> {
  const dir = path.join(SOURCE_CACHE_ROOT, urlHash(url));
  await mkdir(dir, { recursive: true });
  const cachedVideo = path.join(dir, "source.mp4");
  await copyFile(videoPath, cachedVideo);
  const fs = await import("fs/promises");
  await fs.writeFile(path.join(dir, "title.txt"), title, "utf8");
}

/** Delete cache entries older than CACHE_TTL_DAYS. Worker calls this hourly. */
export async function cleanupSourceCache(): Promise<number> {
  let removed = 0;
  try {
    const dirs = await readdir(SOURCE_CACHE_ROOT);
    const cutoff = Date.now() - CACHE_TTL_DAYS * 86400 * 1000;
    for (const d of dirs) {
      const dirPath = path.join(SOURCE_CACHE_ROOT, d);
      try {
        const s = await stat(path.join(dirPath, "source.mp4"));
        if (s.mtimeMs < cutoff) {
          await rm(dirPath, { recursive: true, force: true });
          removed += 1;
        }
      } catch {
        // No source.mp4 → orphaned dir, clean it up
        await rm(dirPath, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch {
    // No cache dir at all — nothing to do
  }
  return removed;
}
