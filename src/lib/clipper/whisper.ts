import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";
import type { WhisperResult, WhisperSegment } from "./types";

const WHISPER_MODEL =
  process.env.WHISPER_MODEL_PATH ||
  path.join(os.homedir(), "Models/whisper/ggml-large-v3-turbo.bin");

const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cli";

// Whisper hard timeout — scales with source length. Default ceiling is
// 2hr (covers a 3hr source at ~0.5x realtime); hard floor is 15 min so
// short clips don't get killed early. Override via WHISPER_TIMEOUT_MS env.
const WHISPER_TIMEOUT_MS = parseInt(
  process.env.WHISPER_TIMEOUT_MS ?? `${120 * 60 * 1000}`,
  10
);

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, WHISPER_TIMEOUT_MS);

    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        return reject(
          new Error(
            `${cmd} killed after ${WHISPER_TIMEOUT_MS / 1000}s — likely memory pressure or hang`
          )
        );
      }
      resolve({ code: code ?? 1, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function transcribe(audioPath: string): Promise<WhisperResult> {
  return transcribeInner(audioPath, false);
}

/** Re-transcribe with -ml 1 for word-level timestamps. Used by caption renderer. */
export async function transcribeWords(audioPath: string): Promise<WhisperResult> {
  return transcribeInner(audioPath, true);
}

/**
 * Extract a clip-range audio slice from sourceAudio and transcribe it at
 * word-level. Returned segment timestamps are CLIP-RELATIVE (0 = clip start).
 * Much faster than running -ml 1 on the whole source since the slice is
 * 20-90s vs 20-30 min.
 */
export async function transcribeClipWords(
  sourceAudio: string,
  clipStart: number,
  clipEnd: number,
  workDir: string,
  basename: string
): Promise<WhisperResult> {
  const sliceWavPath = `${workDir}/${basename}.slice.wav`;
  const duration = clipEnd - clipStart;

  // Cut just this clip's audio range
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-ss",
      clipStart.toFixed(2),
      "-t",
      duration.toFixed(2),
      "-i",
      sourceAudio,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      sliceWavPath,
    ]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg slice ${code}: ${stderr.slice(-300)}`))
    );
    child.on("error", reject);
  });

  // Word-level transcribe the slice — already clip-relative
  return transcribeInner(sliceWavPath, true);
}

async function transcribeInner(
  audioPath: string,
  wordLevel: boolean
): Promise<WhisperResult> {
  const outBase = audioPath.replace(/\.wav$/, wordLevel ? ".words" : "");
  const jsonPath = `${outBase}.json`;

  const args = [
    "-m",
    WHISPER_MODEL,
    "-f",
    audioPath,
    "-of",
    outBase,
    "-oj",
    "-l",
    "auto",
    "-t",
    "8",
  ];
  if (wordLevel) {
    // -sow splits at word boundary; -dtw aligns per-token timestamps via
    // DTW (much more accurate than -ml 1's segment-boundary guesses).
    args.push("-sow", "-dtw", "large.v3.turbo");
  }

  const { code, stderr } = await run(WHISPER_BIN, args);

  if (code !== 0) {
    throw new Error(`whisper-cli exited ${code}: ${stderr.slice(0, 500)}`);
  }

  const raw = await readFile(jsonPath, "utf8");
  const parsed = JSON.parse(raw) as {
    transcription?: Array<{
      offsets?: { from: number; to: number };
      text?: string;
      timestamps?: { from: string; to: string };
    }>;
    result?: { language?: string };
  };

  const segments: WhisperSegment[] = (parsed.transcription ?? [])
    .map((seg) => {
      const start = seg.offsets ? seg.offsets.from / 1000 : 0;
      const end = seg.offsets ? seg.offsets.to / 1000 : 0;
      return { start, end, text: (seg.text ?? "").trim() };
    })
    .filter((s) => s.text.length > 0);

  return {
    language: parsed.result?.language || "en",
    segments,
  };
}
