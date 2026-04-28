#!/usr/bin/env python3
"""
Smoke test for F5-TTS-MLX. Generates one sample WAV at /tmp/f5tts-test.wav
so the user can subjectively rate quality + energy before we wire it into
the explainer pipeline.

First run downloads the model from HuggingFace (~few hundred MB). Subsequent
runs are fast — F5-TTS-MLX uses Apple Metal directly so no Python<->torch
overhead.
"""

import sys
import time

OUTPUT_PATH = "/tmp/f5tts-test.wav"

# Same script as the chatterbox test for an apples-to-apples judgment.
SCRIPT = (
    "Here's the wild part. Most people think Elon Musk's biggest bet was "
    "Tesla. It wasn't. It was the company everyone laughed at. And now "
    "they're all racing to copy it."
)


def main() -> int:
    t0 = time.time()
    print("[f5tts-test] importing f5_tts_mlx...", flush=True)
    try:
        from f5_tts_mlx.generate import generate
    except Exception as e:
        print(f"FAIL: import error: {e}", file=sys.stderr)
        return 1

    print("[f5tts-test] generating audio (first run downloads model)...", flush=True)
    try:
        generate(
            generation_text=SCRIPT,
            output_path=OUTPUT_PATH,
            # No ref_audio_path = uses the package's built-in default
            # reference voice. Real pipeline will pass user's chosen ref.
            steps=32,          # Paper-recommended quality (vs default 8). ~4x slower
            cfg_strength=2.0,  # Default
            speed=0.94,        # Slight slowdown — usually sounds more natural for English
            seed=42,           # Reproducible across runs while we evaluate
        )
    except Exception as e:
        print(f"FAIL: generate error: {e}", file=sys.stderr)
        return 2

    print(f"[f5tts-test] output: {OUTPUT_PATH}", flush=True)
    print(f"[f5tts-test] total wall time: {time.time() - t0:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
