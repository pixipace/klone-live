import { spawn } from "child_process";
import path from "path";

const F5_SCRIPT_PATH = path.join(process.cwd(), "scripts", "render-explainer-tts.py");
const EL_SCRIPT_PATH = path.join(process.cwd(), "scripts", "render-explainer-tts-elevenlabs.py");
// Launchd-spawned Next.js resolves `python3` via PATH to brew's
// /opt/homebrew/bin/python3 (3.14). Other Pythons on the system don't
// have f5_tts_mlx installed. Pin to brew's Python explicitly to avoid
// the silent "wrong-python" bug. Override via PYTHON_BIN env if needed.
const PYTHON_BIN = process.env.PYTHON_BIN || "/opt/homebrew/bin/python3";

/** Engine selection — ElevenLabs Creative TTS when ELEVENLABS_API_KEY
 *  is set in env (production-quality voice, ~131k credits/mo on Creator
 *  tier = ~130 explainers). F5-TTS-MLX local fallback for dev / no-key. */
const USE_ELEVENLABS = !!process.env.ELEVENLABS_API_KEY;
const SCRIPT_PATH = USE_ELEVENLABS ? EL_SCRIPT_PATH : F5_SCRIPT_PATH;

export type TTSOptions = {
  /** Optional reference voice file (5-15s WAV/MP3). When provided, the TTS
   *  output mimics the prosody/timbre of this voice. Without one, F5-TTS
   *  uses a built-in default narrator reference. */
  refAudioPath?: string;
  /** Required when refAudioPath is set: the verbatim transcript of the
   *  reference clip. F5-TTS uses this for phoneme alignment during cloning. */
  refAudioText?: string;
  /** F5 inference steps. 8 = fast (~3x realtime on M2 Pro). 32 = quality
   *  (~12x realtime). Default 32 — explainer narration quality matters
   *  more than turnaround for this pipeline. */
  steps?: number;
  /** Playback speed multiplier. <1.0 = slower (often sounds more natural
   *  for English narration). Default 0.94. */
  speed?: number;
};

export type TTSBatchResult = {
  /** One absolute WAV path per input line, in order. 24kHz mono PCM16. */
  files: string[];
  /** Sum of all clip durations in seconds. */
  totalDurationSec: number;
};

/**
 * Generate one WAV per narration line via F5-TTS-MLX in a single Python
 * subprocess (model loads once, all lines share the same process — much
 * faster than spawning per-line).
 *
 * Throws if the subprocess exits non-zero or returns malformed JSON.
 * Caller is responsible for cleaning up the WAV files when done.
 */
export async function renderNarration(
  lines: string[],
  outDir: string,
  options: TTSOptions = {},
): Promise<TTSBatchResult> {
  if (lines.length === 0) {
    return { files: [], totalDurationSec: 0 };
  }
  const cfg = JSON.stringify({
    lines,
    outDir,
    refAudioPath: options.refAudioPath,
    refAudioText: options.refAudioText,
    steps: options.steps ?? 32,
    speed: options.speed ?? 0.94,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [SCRIPT_PATH]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`render-explainer-tts.py exited ${code}: ${stderr.slice(-600)}`),
        );
      }
      // F5-TTS-MLX (and other ML libs) often write progress/info to stdout
      // even when we expect the script to print only JSON. Defensively
      // extract the LAST {...} block on its own line — survives arbitrary
      // upstream stdout noise without forcing every dependency to behave.
      const lastJsonLine = stdout
        .split("\n")
        .map((l) => l.trim())
        .reverse()
        .find((l) => l.startsWith("{") && l.endsWith("}"));
      if (!lastJsonLine) {
        return reject(
          new Error(`render-explainer-tts.py no JSON in stdout: ${stdout.slice(-400)}`),
        );
      }
      try {
        const parsed = JSON.parse(lastJsonLine) as TTSBatchResult;
        if (!Array.isArray(parsed.files) || typeof parsed.totalDurationSec !== "number") {
          return reject(new Error(`render-explainer-tts.py malformed output: ${lastJsonLine}`));
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error(`render-explainer-tts.py bad JSON: ${lastJsonLine} (${err})`));
      }
    });
    child.on("error", reject);
    child.stdin.write(cfg);
    child.stdin.end();
  });
}
