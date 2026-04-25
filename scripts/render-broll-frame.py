#!/usr/bin/env python3
"""
Render a B-roll frame as a 1080x1920 PNG ready to overlay on the speaker
video. Two modes:

  - "full" (default): B-roll covers the entire 1080x1920 frame. Real
    YouTube-essay cutaway. Speaker audio continues; captions stay on top
    via filter chain ordering.

  - "corner": B-roll is a smaller PiP card (rounded corners + shadow)
    placed top-left or top-right. Use when the speaker shouldn't be
    fully hidden.

Usage: render-broll-frame.py <src-image> <out-png>
  Optional env:
    BROLL_MODE=full|corner            (default "full")
    BROLL_MARGIN=0..20                (full mode: % inset from edges, default 0)
    BROLL_PIP_W, BROLL_PIP_H          (corner mode: card dimensions, default 540x720)
    BROLL_TOP, BROLL_SIDE_PAD         (corner mode: position, defaults 240, 36)
    BROLL_SIDE=left|right             (corner mode: which side, default right)
    BROLL_RADIUS=32                   (corner mode: corner radius)
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

CANVAS_W = 1080
CANVAS_H = 1920

MODE = os.environ.get("BROLL_MODE", "full").strip().lower()

# Full-screen mode — optional symmetric inset margin (0% = pure full-screen).
MARGIN_PCT = max(0, min(20, int(os.environ.get("BROLL_MARGIN", "0"))))

# Corner-mode geometry
PIP_W = int(os.environ.get("BROLL_PIP_W", "540"))
PIP_H = int(os.environ.get("BROLL_PIP_H", "720"))
TOP = int(os.environ.get("BROLL_TOP", "240"))
SIDE_PAD = int(os.environ.get("BROLL_SIDE_PAD", "36"))
SIDE = os.environ.get("BROLL_SIDE", "right").strip().lower()
RADIUS = int(os.environ.get("BROLL_RADIUS", "32"))

# Shadow (corner mode only)
SHADOW_BLUR = 18
SHADOW_OFFSET_Y = 8
SHADOW_OPACITY = 110

# Subtle white border around card edge (corner mode only)
BORDER_WIDTH = 2
BORDER_COLOR = (255, 255, 255, 90)


def cover_resize(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Resize + center-crop to fill target dimensions (cover behavior)."""
    src_w, src_h = img.size
    src_ratio = src_w / src_h
    tgt_ratio = target_w / target_h
    if src_ratio > tgt_ratio:
        new_h = target_h
        new_w = int(round(src_w * target_h / src_h))
    else:
        new_w = target_w
        new_h = int(round(src_h * target_w / src_w))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def build_rounded_mask(w: int, h: int, radius: int) -> Image.Image:
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    return mask


def render_full(src_path: str, out_path: str) -> None:
    """Full-screen cutaway. Optional MARGIN_PCT shows the speaker peeking
    around the edges (with rounded corners on the inset)."""
    src = Image.open(src_path).convert("RGBA")

    margin_x = int(CANVAS_W * MARGIN_PCT / 100)
    margin_y = int(CANVAS_H * MARGIN_PCT / 100)
    target_w = CANVAS_W - margin_x * 2
    target_h = CANVAS_H - margin_y * 2

    cropped = cover_resize(src, target_w, target_h)

    if MARGIN_PCT > 0:
        # Inset look — rounded corners on the smaller image
        mask = build_rounded_mask(target_w, target_h, RADIUS)
        canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
        canvas.paste(cropped, (margin_x, margin_y), mask)
    else:
        # Pure full-screen — no transparency around it
        canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 255))
        canvas.paste(cropped, (0, 0))

    canvas.save(out_path, "PNG", optimize=True)


def render_corner(src_path: str, out_path: str) -> None:
    """Smaller PiP card in a corner with shadow + rounded corners."""
    src = Image.open(src_path).convert("RGBA")
    cropped = cover_resize(src, PIP_W, PIP_H)

    mask = build_rounded_mask(PIP_W, PIP_H, RADIUS)
    pip = Image.new("RGBA", (PIP_W, PIP_H), (0, 0, 0, 0))
    pip.paste(cropped, (0, 0), mask)

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))

    pip_x = SIDE_PAD if SIDE == "left" else CANVAS_W - PIP_W - SIDE_PAD
    pip_y = TOP

    shadow_pad = SHADOW_BLUR * 2
    shadow_layer = Image.new(
        "RGBA", (PIP_W + shadow_pad * 2, PIP_H + shadow_pad * 2), (0, 0, 0, 0)
    )
    ImageDraw.Draw(shadow_layer).rounded_rectangle(
        (shadow_pad, shadow_pad, shadow_pad + PIP_W, shadow_pad + PIP_H),
        radius=RADIUS,
        fill=(0, 0, 0, SHADOW_OPACITY),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    canvas.paste(
        shadow_layer,
        (pip_x - shadow_pad, pip_y - shadow_pad + SHADOW_OFFSET_Y),
        shadow_layer,
    )

    canvas.paste(pip, (pip_x, pip_y), pip)

    if BORDER_WIDTH > 0:
        ImageDraw.Draw(canvas).rounded_rectangle(
            (pip_x, pip_y, pip_x + PIP_W, pip_y + PIP_H),
            radius=RADIUS,
            outline=BORDER_COLOR,
            width=BORDER_WIDTH,
        )

    canvas.save(out_path, "PNG", optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: render-broll-frame.py <src-image> <out-png>", file=sys.stderr)
        sys.exit(1)
    if MODE == "corner":
        render_corner(sys.argv[1], sys.argv[2])
    else:
        render_full(sys.argv[1], sys.argv[2])
