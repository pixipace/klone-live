#!/usr/bin/env python3
"""
Render an ANIMATED stat callout — a sequence of PNG frames showing the
number counting up from 0 to its target value with a small spring-overshoot
bounce on land. Compose then plays them as a 30fps sequence over the stat's
display window, so the data feels ALIVE instead of just popping in.

This is the difference between an "AI-generated explainer" and a "$10k
editor video" — real editors animate every number.

Reads JSON from stdin:
  {"value": "111", "label": "TOTAL SCORE",
   "outDir": "/abs/out/dir",
   "fps": 30, "durationSec": 1.4}

Output: writes stat_000001.png ... stat_NNNN.png to outDir
        prints {"frames": N, "framePattern": "/abs/out/dir/stat_%06d.png", "fps": 30}
"""

import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CANVAS_W = 1080
CANVAS_H = 1920

ACCENT = (255, 80, 80, 255)
ACCENT_DIM = (255, 80, 80, 180)
TEXT_DIM = (220, 220, 220, 255)
CARD_BG = (10, 10, 18, 230)

FONT_CANDIDATES = [
    "/Users/gill/Library/Fonts/Lato-Black.ttf",
    "/Users/gill/Library/Fonts/Lato-Bold.ttf",
    "/System/Library/Fonts/SFCompact.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def load_font(size):
    for p in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def parse_value(value: str):
    """Pull the numeric core out of a value string ('₹20Cr' → ('₹', 20, 'Cr')).
    For animation we count UP the numeric part and keep the prefix/suffix
    static. Falls back to identity (no animation) if no number is found."""
    m = re.search(r"(\d+(?:[.,]\d+)?)", value)
    if not m:
        return value, None, ""
    num_str = m.group(1)
    prefix = value[: m.start()]
    suffix = value[m.end() :]
    try:
        num = float(num_str.replace(",", ""))
    except ValueError:
        return value, None, ""
    return prefix, num, suffix


def format_number(prefix: str, n: float, suffix: str, original: str) -> str:
    """Format n with the same decimal precision as the original string."""
    if "." in original:
        return f"{prefix}{n:.1f}{suffix}"
    return f"{prefix}{int(round(n))}{suffix}"


def ease_overshoot(t: float) -> float:
    """Spring-overshoot easing: 0 → 1.08 → 1.0. Lands with a satisfying
    little bounce. t in [0, 1]."""
    if t < 0:
        return 0.0
    if t >= 1:
        return 1.0
    # Cubic out for the rise (0..0.7), then spring overshoot decay (0.7..1)
    if t < 0.7:
        u = t / 0.7
        return (1 - (1 - u) ** 3) * 1.08
    # Decay back from 1.08 to 1.0
    u = (t - 0.7) / 0.3
    return 1.08 - 0.08 * (1 - (1 - u) ** 2)


def render_card(value_text: str, label_text: str, scale: float) -> Image.Image:
    img = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    val_font = load_font(int(160 * scale))
    lab_font = load_font(int(36 * scale))

    vbb = val_font.getbbox(value_text)
    vw, vh = vbb[2] - vbb[0], vbb[3] - vbb[1]
    if label_text:
        lbb = lab_font.getbbox(label_text)
        lw, lh = lbb[2] - lbb[0], lbb[3] - lbb[1]
    else:
        lbb, lw, lh = (0, 0, 0, 0), 0, 0

    pad = int(36 * scale)
    inner_gap = int(14 * scale)
    card_w = max(vw, lw) + pad * 2
    card_h = vh + (inner_gap + lh if label_text else 0) + pad * 2
    card_x = CANVAS_W - card_w - 50
    card_y = 220

    # Drop shadow
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle(
        [(card_x + 8, card_y + 14), (card_x + card_w + 8, card_y + card_h + 14)],
        radius=22,
        fill=(0, 0, 0, 130),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(8))
    img = Image.alpha_composite(img, shadow)

    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [(card_x, card_y), (card_x + card_w, card_y + card_h)],
        radius=22,
        fill=CARD_BG,
    )
    draw.rounded_rectangle(
        [(card_x, card_y), (card_x + 10, card_y + card_h)],
        radius=4,
        fill=ACCENT,
    )

    val_x = card_x + (card_w - vw) // 2 - vbb[0]
    val_y = card_y + pad - vbb[1]
    draw.text((val_x, val_y), value_text, font=val_font, fill=ACCENT)

    if label_text:
        lab_x = card_x + (card_w - lw) // 2 - lbb[0]
        lab_y = card_y + pad + vh + inner_gap - lbb[1]
        draw.text((lab_x, lab_y), label_text, font=lab_font, fill=TEXT_DIM)

    return img


def main() -> int:
    cfg = json.loads(sys.stdin.read())
    raw_value = (cfg.get("value") or "").strip()
    label = (cfg.get("label") or "").strip().upper()
    out_dir = cfg["outDir"]
    fps = int(cfg.get("fps", 30))
    duration = float(cfg.get("durationSec", 1.4))

    os.makedirs(out_dir, exist_ok=True)

    prefix, target, suffix = parse_value(raw_value)

    n_frames = max(1, int(duration * fps))
    # Count-up over a FIXED 1.0s window (or half the display window for
    # short overlays). Holding the settled value after the count-up is
    # how real editors do it — the eye lands on the number, then the
    # narration finishes. Slow count-up over the full window would feel
    # sluggish.
    countup_secs = min(1.0, duration * 0.5)
    countup_frames = max(1, int(countup_secs * fps))

    for i in range(n_frames):
        t_card = min(1.0, i / max(1, countup_frames - 1))
        ease = ease_overshoot(t_card)
        # Subtle scale pop on the card (1.0 → 1.04 → 1.0) over the same window
        scale = 1.0 if i >= countup_frames else (0.92 + 0.12 * ease)
        if target is None:
            value_text = raw_value
        else:
            current = target * min(1.0, ease)
            value_text = format_number(prefix, current, suffix, raw_value)
        img = render_card(value_text, label, scale)
        img.save(os.path.join(out_dir, f"stat_{i + 1:06d}.png"), "PNG")

    print(json.dumps({
        "frames": n_frames,
        "framePattern": os.path.join(out_dir, "stat_%06d.png"),
        "fps": fps,
        "durationSec": round(n_frames / fps, 3),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
