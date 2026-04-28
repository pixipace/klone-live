#!/usr/bin/env python3
"""
Smoke test for Chatterbox TTS. First run downloads ~2GB of model weights
from HuggingFace. Subsequent runs are fast.

Generates a single sample WAV at /tmp/chatterbox-test.wav so the user
can subjectively verify quality and energy before we wire it into the
explainer pipeline.
"""

import os
import sys
import time

OUTPUT_PATH = "/tmp/chatterbox-test.wav"

# An energetic-but-realistic explainer-style line — the kind of thing
# we'd actually narrate in a Klone explainer video.
SCRIPT = (
    "Here's the wild part. Most people think Elon Musk's biggest bet was "
    "Tesla. It wasn't. It was the company everyone laughed at — and now "
    "they're all racing to copy it."
)


def main() -> int:
    t0 = time.time()
    print("[chatterbox-test] importing torch + chatterbox...", flush=True)
    try:
        import torch
        import torchaudio
        from chatterbox.tts import ChatterboxTTS
    except Exception as e:
        print(f"FAIL: import error: {e}", file=sys.stderr)
        return 1

    # Apple Silicon: prefer MPS, fall back to CPU. Chatterbox MPS support
    # landed in March 2026; fallback ensures we still get audio if it's
    # flaky on this Python/PyTorch combo.
    # Force CPU on first run — MPS path has compatibility issues with
    # certain torch/python combos and surfaces as "NoneType is not callable"
    # at model load. CPU is slower (~2-4x realtime on M2 Pro) but reliable.
    device = "cpu"
    print(f"[chatterbox-test] device: {device}", flush=True)

    print("[chatterbox-test] loading model (first run downloads ~2GB)...", flush=True)
    try:
        model = ChatterboxTTS.from_pretrained(device=device)
    except Exception as e:
        print(f"FAIL: model load error: {e}", file=sys.stderr)
        return 2
    print(f"[chatterbox-test] model loaded in {time.time() - t0:.1f}s", flush=True)

    t1 = time.time()
    print("[chatterbox-test] generating audio...", flush=True)
    try:
        # Default voice (no audio_prompt_path) for the smoke test. Real
        # pipeline will pass a user-provided reference clip.
        wav = model.generate(
            SCRIPT,
            exaggeration=0.7,    # hype-leaning default per Chatterbox README
            cfg_weight=0.5,
        )
    except Exception as e:
        print(f"FAIL: generate error: {e}", file=sys.stderr)
        return 3
    gen_secs = time.time() - t1

    try:
        torchaudio.save(OUTPUT_PATH, wav, model.sr)
    except Exception as e:
        print(f"FAIL: save error: {e}", file=sys.stderr)
        return 4

    audio_duration = wav.shape[-1] / model.sr
    print(
        f"[chatterbox-test] generated {audio_duration:.2f}s of audio "
        f"in {gen_secs:.2f}s "
        f"({gen_secs / audio_duration:.2f}x realtime)",
        flush=True,
    )
    print(f"[chatterbox-test] output: {OUTPUT_PATH}", flush=True)
    print(f"[chatterbox-test] total wall time: {time.time() - t0:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
