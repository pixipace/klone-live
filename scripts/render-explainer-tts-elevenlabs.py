#!/usr/bin/env python3
"""
Batch-generate explainer narration via ElevenLabs Text-to-Speech.

Drop-in replacement for render-explainer-tts.py (F5-TTS). Same stdin
JSON shape; same stdout JSON shape (`{"files": [...], "totalDurationSec": N}`).
The pipeline picks ONE engine per job based on env (ELEVENLABS_API_KEY set
→ EL; otherwise F5-TTS-MLX local).

Reads JSON from stdin:
  {"lines":      ["Line 1.", "Line 2.", ...],
   "outDir":     "/abs/path/to/dir",
   "voiceId":    "ErXwobaYiN019PkySvjV",   // optional, defaults to env
   "modelId":    "eleven_multilingual_v2", // optional
   "stability":  0.4,                       // optional 0-1
   "similarity": 0.75,                      // optional 0-1
   "style":      0.6}                       // optional 0-1 (multilingual_v2 only)

Writes line_001.mp3 ... line_NNN.mp3 to outDir, plus prints JSON:
  {"files": ["/abs/.../line_001.mp3", ...], "totalDurationSec": 42.7}
"""

import json
import os
import struct
import sys
import time
import urllib.request
import urllib.error


def main() -> int:
    cfg = json.loads(sys.stdin.read())
    lines = cfg["lines"]
    out_dir = cfg["outDir"]
    voice_id = cfg.get("voiceId") or os.environ.get("ELEVENLABS_VOICE_ID")
    model_id = cfg.get("modelId") or "eleven_multilingual_v2"
    stability = float(cfg.get("stability", 0.40))
    similarity = float(cfg.get("similarity", 0.75))
    style = float(cfg.get("style", 0.60))
    use_speaker_boost = True

    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        print("FAIL: ELEVENLABS_API_KEY env not set", file=sys.stderr)
        return 1
    if not voice_id:
        print("FAIL: voiceId param or ELEVENLABS_VOICE_ID env required", file=sys.stderr)
        return 2
    if not lines:
        print(json.dumps({"files": [], "totalDurationSec": 0.0}))
        return 0

    os.makedirs(out_dir, exist_ok=True)

    files = []
    total_dur = 0.0
    t0 = time.time()
    # mp3_44100_128 = good quality, small file, fast streaming. The clipper
    # composer reads MP3 input fine; we don't need WAV/PCM here since it's
    # the FINAL audio and gets re-encoded to AAC anyway.
    fmt = "mp3_44100_128"
    url_base = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format={fmt}"

    for i, text in enumerate(lines):
        out_path = os.path.join(out_dir, f"line_{i + 1:03d}.mp3")
        body = json.dumps({
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity,
                "style": style,
                "use_speaker_boost": use_speaker_boost,
            },
        }).encode("utf-8")

        req = urllib.request.Request(
            url_base,
            data=body,
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                audio = resp.read()
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")[:300]
            print(f"FAIL: line {i + 1} HTTP {e.code}: {err_body}", file=sys.stderr)
            return 3
        except Exception as e:
            print(f"FAIL: line {i + 1} request error: {e}", file=sys.stderr)
            return 4

        with open(out_path, "wb") as f:
            f.write(audio)

        # MP3 duration approx: scan frame headers for total samples.
        # Cheap fallback — we re-probe via ffprobe in the pipeline anyway.
        # Use rough byte-rate approximation: 128kbps → 16000 bytes/sec.
        approx_dur = len(audio) / 16000.0
        total_dur += approx_dur
        files.append(out_path)
        print(
            f"[el-tts] line {i + 1}/{len(lines)} ~{approx_dur:.2f}s ({time.time() - t0:.1f}s elapsed)",
            file=sys.stderr,
            flush=True,
        )

    print(json.dumps({"files": files, "totalDurationSec": round(total_dur, 2)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
