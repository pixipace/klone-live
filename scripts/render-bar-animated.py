#!/usr/bin/env python3
"""
Render an ANIMATED comparison bar chart — two horizontal bars that fill
in sequence (left-to-right) so the viewer SEES the difference grow.

Used when narration mentions a comparison ("from $5B to $1.2T", "5x more",
"vs the old approach"). Static numbers go through render-stat-animated.py;
THIS renderer handles two-value comparisons where the relationship is
the point.

Reads JSON from stdin:
  {"leftLabel": "Tesla 2010", "leftValue": "$5B",
   "rightLabel": "Tesla 2024", "rightValue": "$1.2T",
   "outDir": "/abs/dir", "fps": 30, "durationSec": 4.0}

Outputs frame sequence + JSON pointing at it.
"""

import json
import os
import sys
import re

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CANVAS_W = 1080
CANVAS_H = 1920

ACCENT = (255, 80, 80, 255)
ACCENT_DIM = (200, 50, 50, 255)
TEXT = (255, 255, 255, 255)
TEXT_DIM = (200, 200, 200, 255)
CARD_BG = (12, 14, 22, 235)

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


def parse_magnitude(value: str) -> float:
    """Extract a comparable number from a value string. '$5B' → 5e9.
    '1.2T' → 1.2e12. Returns 1.0 if nothing parseable."""
    m = re.search(r"(\d+(?:[.,]\d+)?)", value)
    if not m:
        return 1.0
    try:
        n = float(m.group(1).replace(",", ""))
    except ValueError:
        return 1.0
    rest = value[m.end():].lower()
    if "t" in rest or "trillion" in rest or "lakh crore" in rest:
        return n * 1e12
    if "b" in rest or "billion" in rest:
        return n * 1e9
    if "m" in rest or "million" in rest:
        return n * 1e6
    if "k" in rest or "thousand" in rest:
        return n * 1e3
    if "cr" in rest or "crore" in rest:
        return n * 1e7
    if "lakh" in rest:
        return n * 1e5
    if "%" in rest or "percent" in rest:
        return n
    return n


def ease_out_cubic(t: float) -> float:
    if t < 0:
        return 0.0
    if t >= 1:
        return 1.0
    return 1 - (1 - t) ** 3


def render_card(
    left_label: str, left_value: str,
    right_label: str, right_value: str,
    left_progress: float,  # 0..1
    right_progress: float,  # 0..1
    right_is_bigger: bool,
) -> Image.Image:
    img = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))

    label_font = load_font(36)
    value_font = load_font(64)

    # Card layout (centred middle of frame)
    card_w = 880
    card_h = 480
    card_x = (CANVAS_W - card_w) // 2
    card_y = (CANVAS_H - card_h) // 2

    # Drop shadow
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle(
        [(card_x + 8, card_y + 16), (card_x + card_w + 8, card_y + card_h + 16)],
        radius=24, fill=(0, 0, 0, 160),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    img = Image.alpha_composite(img, shadow)

    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [(card_x, card_y), (card_x + card_w, card_y + card_h)],
        radius=24, fill=CARD_BG,
    )

    # Bar geometry
    bar_x_start = card_x + 60
    bar_x_end = card_x + card_w - 60
    bar_max_w = bar_x_end - bar_x_start
    bar_h = 64
    bar_radius = 16

    # Two rows: left (top) and right (bottom)
    row_y_left = card_y + 90
    row_y_right = card_y + 280

    def draw_row(y: int, label: str, value: str, progress: float, is_dominant: bool):
        # Label
        draw.text((bar_x_start, y), label.upper(), font=label_font, fill=TEXT_DIM)
        # Bar background
        track_y = y + 56
        draw.rounded_rectangle(
            [(bar_x_start, track_y), (bar_x_end, track_y + bar_h)],
            radius=bar_radius, fill=(40, 40, 50, 200),
        )
        # Bar fill — width by progress, accent color
        fill_w = int(bar_max_w * progress)
        if fill_w > 4:
            color = ACCENT if is_dominant else ACCENT_DIM
            draw.rounded_rectangle(
                [(bar_x_start, track_y), (bar_x_start + fill_w, track_y + bar_h)],
                radius=bar_radius, fill=color,
            )
        # Value text — appears once bar is mostly filled (last 30% of progress)
        if progress > 0.4:
            value_alpha = min(255, int((progress - 0.4) * 5 * 255))
            value_color = (TEXT[0], TEXT[1], TEXT[2], value_alpha)
            draw.text(
                (bar_x_start, track_y + bar_h + 14),
                value, font=value_font, fill=value_color,
                stroke_width=4, stroke_fill=(0, 0, 0, value_alpha),
            )

    draw_row(row_y_left, left_label, left_value, left_progress, not right_is_bigger)
    draw_row(row_y_right, right_label, right_value, right_progress, right_is_bigger)

    return img


def main() -> int:
    cfg = json.loads(sys.stdin.read())
    left_label = (cfg.get("leftLabel") or "").strip()
    left_value = (cfg.get("leftValue") or "").strip()
    right_label = (cfg.get("rightLabel") or "").strip()
    right_value = (cfg.get("rightValue") or "").strip()
    out_dir = cfg["outDir"]
    fps = int(cfg.get("fps", 30))
    duration = float(cfg.get("durationSec", 4.0))

    os.makedirs(out_dir, exist_ok=True)

    # Compare magnitudes — bigger one fills to 100%, smaller one to its
    # proportional fraction. Prevents tiny "5B" bars next to "1.2T" being
    # invisible (we cap min at 8% so the smaller bar is still visible).
    left_mag = parse_magnitude(left_value)
    right_mag = parse_magnitude(right_value)
    bigger = max(left_mag, right_mag)
    left_target = max(0.08, left_mag / bigger) if bigger > 0 else 0.5
    right_target = max(0.08, right_mag / bigger) if bigger > 0 else 0.5
    right_is_bigger = right_mag >= left_mag

    n_frames = max(1, int(duration * fps))
    # Anim plan:
    #   0..30% of duration: left bar fills 0 → left_target (ease-out)
    #   30..60% of duration: right bar fills 0 → right_target (ease-out)
    #   60..100%: hold
    # Real editors do this — viewer reads first bar, anticipates second,
    # gets the comparison reveal. Simultaneous fill is less satisfying.
    left_end_frame = max(1, int(n_frames * 0.30))
    right_start_frame = left_end_frame
    right_end_frame = max(right_start_frame + 1, int(n_frames * 0.60))

    for i in range(n_frames):
        # Left progress
        if i < left_end_frame:
            t = i / max(1, left_end_frame - 1)
            left_p = ease_out_cubic(t) * left_target
        else:
            left_p = left_target
        # Right progress
        if i < right_start_frame:
            right_p = 0.0
        elif i < right_end_frame:
            t = (i - right_start_frame) / max(1, right_end_frame - right_start_frame - 1)
            right_p = ease_out_cubic(t) * right_target
        else:
            right_p = right_target

        img = render_card(
            left_label, left_value,
            right_label, right_value,
            left_p, right_p,
            right_is_bigger,
        )
        img.save(os.path.join(out_dir, f"bar_{i + 1:06d}.png"), "PNG")

    print(json.dumps({
        "frames": n_frames,
        "framePattern": os.path.join(out_dir, "bar_%06d.png"),
        "fps": fps,
        "durationSec": round(n_frames / fps, 3),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
