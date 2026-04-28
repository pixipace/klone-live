#!/usr/bin/env python3
"""
Render a small attribution PNG for explainer videos. Always-on overlay
that sits at the bottom of the frame to credit the source — both a
fair-use signal and a "we're not stealing" branding move.

Reads JSON from stdin:
  {"sourceTitle": "string", "outPath": "/abs/path.png", "targetWidth": 1080}

Output is a single transparent-background PNG. Width = targetWidth, height
auto-fits the text. The composer overlays this at the bottom of every
frame across the explainer's full duration.
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/Users/gill/Library/Fonts/Lato-Bold.ttf",
    "/Users/gill/Library/Fonts/Lato-Regular.ttf",
    "/System/Library/Fonts/SFCompact.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def load_font(size: int):
    for p in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> int:
    cfg = json.loads(sys.stdin.read())
    title = (cfg.get("sourceTitle") or "").strip()
    out_path = cfg["outPath"]
    target_w = int(cfg.get("targetWidth", 1080))

    label_text = "VIA"
    src_text = title[:60] if title else "YouTube"

    # Compose: small "VIA" pill + source title text in a horizontal row.
    label_font = load_font(28)
    src_font = load_font(36)

    label_bbox = label_font.getbbox(label_text)
    label_w = label_bbox[2] - label_bbox[0]
    label_h = label_bbox[3] - label_bbox[1]

    src_bbox = src_font.getbbox(src_text)
    src_w = src_bbox[2] - src_bbox[0]
    src_h = src_bbox[3] - src_bbox[1]

    pad_x = 14
    pad_y = 8
    gap = 14
    pill_w = label_w + pad_x * 2
    pill_h = label_h + pad_y * 2

    block_w = pill_w + gap + src_w
    block_h = max(pill_h, src_h)

    # Canvas at target_w wide; height = block + breathing room.
    canvas_h = block_h + 32
    img = Image.new("RGBA", (target_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Centre the block horizontally
    x0 = (target_w - block_w) // 2

    # "VIA" pill — coloured background, white text.
    pill_y = (canvas_h - pill_h) // 2
    draw.rounded_rectangle(
        [(x0, pill_y), (x0 + pill_w, pill_y + pill_h)],
        radius=10,
        fill=(255, 80, 80, 230),
    )
    draw.text(
        (x0 + pad_x - label_bbox[0], pill_y + pad_y - label_bbox[1]),
        label_text,
        font=label_font,
        fill=(255, 255, 255, 255),
    )

    # Source title — white text, thick black stroke for legibility on
    # any background (matches the caption style).
    src_x = x0 + pill_w + gap
    src_y = (canvas_h - src_h) // 2
    draw.text(
        (src_x - src_bbox[0], src_y - src_bbox[1]),
        src_text,
        font=src_font,
        fill=(255, 255, 255, 255),
        stroke_width=4,
        stroke_fill=(0, 0, 0, 255),
    )

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, "PNG")
    print(json.dumps({"path": out_path, "width": target_w, "height": canvas_h}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
