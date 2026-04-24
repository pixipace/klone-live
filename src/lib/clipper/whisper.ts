import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";
import type { WhisperResult, WhisperSegment } from "./types";

const WHISPER_MODEL =
  process.env.WHISPER_MODEL_PATH ||
  path.join(os.homedir(), "Models/whisper/ggml-large-v3-turbo.bin");

const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cli";

const WHISPER_TIMEOUT_MS = parseInt(
  process.env.WHISPER_TIMEOUT_MS ?? `${15 * 60 * 1000}`,
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
  if (wordLevel) args.push("-ml", "1");

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
