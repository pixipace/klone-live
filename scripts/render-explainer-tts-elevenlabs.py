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
   "stability":  0.5,                       // optional 0-1
   "similarity": 0.85,                      // optional 0-1
   "style":      0.0}                       // optional 0-1 (multilingual_v2 only)

Quality preset for Creator tier — full-band 44.1kHz mp3 at 192kbps. PCM
output (lossless) is locked behind Pro tier so 192kbps mp3 is the highest
fidelity available; for voice this is transparent (you can't ABX 192k mp3
vs PCM on a 60s narration). The composer re-encodes to AAC at the END,
so we want the SOURCE audio to be as clean as the tier allows going in.

Output: line_001.mp3 ... line_NNN.mp3 + JSON to stdout.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error


# Best output format on the Creator tier. Pro tier unlocks pcm_44100
# (lossless) — when we move to Pro, swap this to "pcm_44100" and add WAV
# header writing via Python's `wave` module. EL returns raw PCM samples
# without a container in pcm_* modes.
EL_OUTPUT_FORMAT = "mp3_44100_192"


def main() -> int:
    cfg = json.loads(sys.stdin.read())
    lines = cfg["lines"]
    out_dir = cfg["outDir"]
    # Default voice: Adam (pNInz6obpgDQGcFmaJgB) — the standard documentary
    # narrator voice used by ColdFusion / How Money Works / Vox-style
    # channels. Deeper register, measured pace, more natural breath sounds
    # than the Antoni preset (which has a more "performed" tone).
    voice_id = (
        cfg.get("voiceId")
        or os.environ.get("ELEVENLABS_VOICE_ID")
        or "pNInz6obpgDQGcFmaJgB"
    )
    # Default model: eleven_v3 — newest flagship, supports natural
    # disfluencies and inline audio tags ([breathes], [pauses]). Higher
    # naturalness ceiling than multilingual_v2 on long-form narration.
    # Both available on Creator tier.
    model_id = cfg.get("modelId") or "eleven_v3"
    # Best-quality narration preset — derived from EL's official guidance
    # for long-form narration. Stability 0.5 gives natural variation
    # without pitch drift; similarity 0.85 is high voice fidelity without
    # the artifacting that creeps in at 1.0; style 0.0 disables artificial
    # exaggeration which sounds AI-tells on long monologues. Speaker boost
    # adds clarity at no quality cost.
    stability = float(cfg.get("stability", 0.50))
    similarity = float(cfg.get("similarity", 0.85))
    style = float(cfg.get("style", 0.00))
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
    url_base = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format={EL_OUTPUT_FORMAT}"

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

        # Approx duration from byte size at 192kbps. The composer re-probes
        # via ffprobe later, so this only matters for the log line below.
        approx_dur = len(audio) / 24000.0  # 192 kbps = 24000 bytes/s
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
