import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";
import type { WhisperResult, WhisperSegment } from "./types";

const WHISPER_MODEL =
  process.env.WHISPER_MODEL_PATH ||
  path.join(os.homedir(), "Models/whisper/ggml-large-v3-turbo.bin");

const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cli";

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    child.on("error", reject);
  });
}

export async function transcribe(audioPath: string): Promise<WhisperResult> {
  const outBase = audioPath.replace(/\.wav$/, "");
  const jsonPath = `${outBase}.json`;

  const { code, stderr } = await run(WHISPER_BIN, [
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
  ]);

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
