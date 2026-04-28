#!/usr/bin/env python3
"""
Batch-generate TTS audio files for an explainer narration script.

Reads JSON config from stdin:
  {
    "lines":         ["Line 1.", "Line 2.", ...],   // narration sentences
    "outDir":        "/abs/path/to/dir",            // where to write WAVs
    "refAudioPath":  "/abs/path/ref.wav",           // optional voice reference
    "refAudioText":  "transcript of reference",     // required if refAudioPath set
    "steps":         32,                            // F5 inference steps (8=fast, 32=quality)
    "speed":         0.94                            // 1.0=normal, <1=slower (usually sounds more natural)
  }

Writes line_001.wav, line_002.wav, ... to outDir and prints JSON to stdout:
  {"files": ["/abs/path/line_001.wav", ...], "totalDurationSec": 42.7}

Loads the F5-TTS-MLX model ONCE per invocation, then generates all lines
in the same process — avoids the ~3s model-load cost per line.
"""

import contextlib
import json
import os
import sys
import time
import wave


def main() -> int:
    cfg = json.loads(sys.stdin.read())
    lines = cfg["lines"]
    out_dir = cfg["outDir"]
    ref_audio_path = cfg.get("refAudioPath")
    ref_audio_text = cfg.get("refAudioText")
    steps = int(cfg.get("steps", 32))
    speed = float(cfg.get("speed", 0.94))

    if not lines:
        print(json.dumps({"files": [], "totalDurationSec": 0.0}))
        return 0

    os.makedirs(out_dir, exist_ok=True)

    try:
        from f5_tts_mlx.generate import generate
    except Exception as e:
        print(f"FAIL: import error: {e}", file=sys.stderr)
        return 1

    files = []
    total_dur = 0.0
    t0 = time.time()
    for i, text in enumerate(lines):
        out_path = os.path.join(out_dir, f"line_{i + 1:03d}.wav")
        # Tiny per-line speed jitter (±6%) breaks the "robotic monotone"
        # feel of identical-cadence narration. Combined with the per-line
        # seed change this gives the same speaker subtle dynamic variance
        # — closer to a real person than a TTS reading a script. Speed
        # multiplied by the base config speed so caller-set pacing wins.
        # Pseudo-random but DETERMINISTIC per (i, text) so re-runs match.
        h = sum(ord(c) for c in text) + i * 7
        line_speed = speed * (0.94 + ((h % 13) / 100.0))  # 0.94 .. 1.06 of base
        try:
            kwargs = {
                "generation_text": text,
                "output_path": out_path,
                "steps": steps,
                "speed": line_speed,
                "cfg_strength": 2.0,
                "seed": 42 + i,  # vary seed per line so adjacent lines don't sound identical
            }
            if ref_audio_path and ref_audio_text:
                kwargs["ref_audio_path"] = ref_audio_path
                kwargs["ref_audio_text"] = ref_audio_text
            # F5-TTS-MLX prints "Got reference audio…" + a tqdm bar to stdout.
            # We need stdout clean for the final JSON result, so redirect any
            # print()/tqdm output during generate() into stderr (where the TS
            # caller already accepts it as informational noise).
            with contextlib.redirect_stdout(sys.stderr):
                generate(**kwargs)
        except Exception as e:
            print(f"FAIL: line {i + 1} generate error: {e}", file=sys.stderr)
            return 2

        # Probe duration via the wave module — F5 always writes 24kHz mono PCM16
        try:
            with wave.open(out_path, "rb") as w:
                frames = w.getnframes()
                rate = w.getframerate()
                dur = frames / float(rate) if rate else 0.0
        except Exception:
            dur = 0.0
        total_dur += dur
        files.append(out_path)
        print(
            f"[explainer-tts] line {i + 1}/{len(lines)} {dur:.2f}s ({time.time() - t0:.1f}s elapsed)",
            file=sys.stderr,
            flush=True,
        )

    print(json.dumps({"files": files, "totalDurationSec": round(total_dur, 2)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
