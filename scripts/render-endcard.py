#!/usr/bin/env python3
"""
Render an end card PNG (1080x1920 transparent) shown over the last ~1.5s
of a clip. Bottom-of-frame card with a small accent dot, the user's text
(typically a handle like "@gillpixipace"), and a subtle "more like this"
sub-line.

Usage: render-endcard.py <text> <output-png>
  Optional env: ENDCARD_FONT=/path/to/font.ttf
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

CANVAS_W = 1080
CANVAS_H = 1920
DEFAULT_FONT = "/Users/gill/Library/Fonts/Lato-Bold.ttf"

ACCENT = (255, 220, 60, 255)  # same yellow as caption highlight
TEXT_COLOR = (255, 255, 255, 255)
SUB_COLOR = (220, 220, 220, 200)
BOX_OPACITY = 0.55


def load_font(size: int):
    try:
        return ImageFont.truetype(os.environ.get("ENDCARD_FONT", DEFAULT_FONT), size)
    except OSError:
        return ImageFont.load_default()


def render(text: str, out_path: str) -> None:
    text = text.strip()[:60]
    if not text:
        return

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    title_font = load_font(82)
    sub_font = load_font(40)

    # Measure text
    title_bbox = title_font.getbbox(text)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]

    sub_text = "more like this"
    sub_bbox = sub_font.getbbox(sub_text)
    sub_w = sub_bbox[2] - sub_bbox[0]
    sub_h = sub_bbox[3] - sub_bbox[1]

    # Card geometry — centered horizontally, bottom 30% of frame (above
    # captions which sit at ~72% so we'd conflict; here we place at ~85%
    # since end card replaces the visual focus during outro anyway)
    pad_x = 60
    pad_y = 32
    card_w = max(title_w, sub_w) + pad_x * 2
    card_h = title_h + sub_h + pad_y * 2 + 24  # gap between title + sub

    card_x = (CANVAS_W - card_w) // 2
    card_y = int(CANVAS_H * 0.78)

    # Card background
    draw.rounded_rectangle(
        [(card_x, card_y), (card_x + card_w, card_y + card_h)],
        radius=28,
        fill=(0, 0, 0, int(255 * BOX_OPACITY)),
    )

    # Small accent dot (top-left of card)
    dot_r = 8
    dot_pad = 24
    draw.ellipse(
        [
            (card_x + dot_pad, card_y + dot_pad),
            (card_x + dot_pad + dot_r * 2, card_y + dot_pad + dot_r * 2),
        ],
        fill=ACCENT,
    )

    # Title (centered)
    title_x = card_x + (card_w - title_w) // 2
    title_y = card_y + pad_y - title_bbox[1]
    draw.text((title_x, title_y), text, font=title_font, fill=TEXT_COLOR)

    # Sub-line (centered, below title)
    sub_x = card_x + (card_w - sub_w) // 2
    sub_y = card_y + pad_y + title_h + 24 - sub_bbox[1]
    draw.text((sub_x, sub_y), sub_text, font=sub_font, fill=SUB_COLOR)

    canvas.save(out_path, "PNG", optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: render-endcard.py <text> <output-png>", file=sys.stderr)
        sys.exit(1)
    render(sys.argv[1], sys.argv[2])
