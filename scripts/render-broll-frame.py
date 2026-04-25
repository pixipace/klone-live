#!/usr/bin/env python3
"""
Render a B-roll PiP frame: takes a source image, returns a full 1080x1920
transparent PNG with the image rendered as a rounded-corner card with a
soft drop shadow in the top-right corner. FFmpeg overlays this on the
speaker video full-frame; transparency takes care of the rest.

Usage: render-broll-frame.py <src-image> <out-png>
  Optional env: BROLL_PIP_W=378, BROLL_PIP_H=504, BROLL_TOP=260,
                BROLL_RIGHT_PAD=36, BROLL_RADIUS=28
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

CANVAS_W = 1080
CANVAS_H = 1920

# PiP card geometry (top-right corner, below hook overlay area)
PIP_W = int(os.environ.get("BROLL_PIP_W", "378"))
PIP_H = int(os.environ.get("BROLL_PIP_H", "504"))
TOP = int(os.environ.get("BROLL_TOP", "260"))
RIGHT_PAD = int(os.environ.get("BROLL_RIGHT_PAD", "36"))
RADIUS = int(os.environ.get("BROLL_RADIUS", "28"))

# Shadow
SHADOW_BLUR = 18
SHADOW_OFFSET_Y = 8
SHADOW_OPACITY = 110  # 0-255

# Subtle white border around the card edge
BORDER_WIDTH = 2
BORDER_COLOR = (255, 255, 255, 90)


def cover_resize(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Resize + center-crop to fill target dimensions (cover behavior)."""
    src_w, src_h = img.size
    src_ratio = src_w / src_h
    tgt_ratio = target_w / target_h
    if src_ratio > tgt_ratio:
        # source is wider — scale by height, crop width
        new_h = target_h
        new_w = int(round(src_w * target_h / src_h))
    else:
        # source is taller — scale by width, crop height
        new_w = target_w
        new_h = int(round(src_h * target_w / src_w))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def build_rounded_mask(w: int, h: int, radius: int) -> Image.Image:
    """Single-channel mask with rounded rectangle = 255 inside, 0 outside."""
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    return mask


def render(src_path: str, out_path: str) -> None:
    src = Image.open(src_path).convert("RGBA")
    cropped = cover_resize(src, PIP_W, PIP_H)

    # Apply rounded-corner mask to the source image
    mask = build_rounded_mask(PIP_W, PIP_H, RADIUS)
    pip = Image.new("RGBA", (PIP_W, PIP_H), (0, 0, 0, 0))
    pip.paste(cropped, (0, 0), mask)

    # Build full-frame transparent canvas
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))

    pip_x = CANVAS_W - PIP_W - RIGHT_PAD
    pip_y = TOP

    # Drop shadow — render a black rounded rect, blur, paste under PiP
    shadow_pad = SHADOW_BLUR * 2
    shadow_layer = Image.new(
        "RGBA", (PIP_W + shadow_pad * 2, PIP_H + shadow_pad * 2), (0, 0, 0, 0)
    )
    sh_draw = ImageDraw.Draw(shadow_layer)
    sh_draw.rounded_rectangle(
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

    # Paste PiP image
    canvas.paste(pip, (pip_x, pip_y), pip)

    # Subtle border
    if BORDER_WIDTH > 0:
        border_draw = ImageDraw.Draw(canvas)
        border_draw.rounded_rectangle(
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
    render(sys.argv[1], sys.argv[2])
