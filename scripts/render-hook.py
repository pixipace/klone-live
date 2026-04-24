#!/usr/bin/env python3
"""
Render a hook title as a transparent PNG sized to overlay on a 1080x1920 video.

Usage: render-hook.py <text> <output-png>
  Optional env: HOOK_FONT=/path/to/font.ttf, HOOK_FONT_SIZE=58,
                HOOK_BOX_OPACITY=0.55, HOOK_BOX_PAD=22, HOOK_TARGET_W=1080
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

DEFAULT_FONT = "/Users/gill/Library/Fonts/Lato-Bold.ttf"
TARGET_W = int(os.environ.get("HOOK_TARGET_W", "1080"))
FONT_SIZE = int(os.environ.get("HOOK_FONT_SIZE", "58"))
BOX_OPACITY = float(os.environ.get("HOOK_BOX_OPACITY", "0.55"))
BOX_PAD = int(os.environ.get("HOOK_BOX_PAD", "22"))
LINE_SPACING = 10
MAX_WIDTH = TARGET_W - 80  # 40px margin each side
MAX_LINES = 4


def wrap_text(text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for w in words[1:]:
        test = f"{current} {w}"
        bbox = font.getbbox(test)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            lines.append(current)
            current = w
    lines.append(current)
    return lines[:MAX_LINES]


def render(text: str, out_path: str) -> None:
    font_path = os.environ.get("HOOK_FONT", DEFAULT_FONT)
    try:
        font = ImageFont.truetype(font_path, FONT_SIZE)
    except OSError:
        font = ImageFont.load_default()

    lines = wrap_text(text.strip(), font, MAX_WIDTH)
    if not lines:
        return

    # Measure total block size
    line_heights: list[int] = []
    line_widths: list[int] = []
    for line in lines:
        bbox = font.getbbox(line)
        line_widths.append(bbox[2] - bbox[0])
        line_heights.append(bbox[3] - bbox[1])

    text_w = max(line_widths)
    text_h = sum(line_heights) + LINE_SPACING * (len(lines) - 1)

    box_w = text_w + BOX_PAD * 2
    box_h = text_h + BOX_PAD * 2

    # Output canvas: TARGET_W wide, just tall enough for the box
    img = Image.new("RGBA", (TARGET_W, box_h + 4), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    box_x = (TARGET_W - box_w) // 2
    draw.rounded_rectangle(
        [(box_x, 0), (box_x + box_w, box_h)],
        radius=18,
        fill=(0, 0, 0, int(255 * BOX_OPACITY)),
    )

    y = BOX_PAD
    for i, line in enumerate(lines):
        x = (TARGET_W - line_widths[i]) // 2
        draw.text((x, y - font.getbbox(line)[1]), line, font=font, fill=(255, 255, 255, 255))
        y += line_heights[i] + LINE_SPACING

    img.save(out_path, "PNG")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: render-hook.py <text> <out.png>", file=sys.stderr)
        sys.exit(1)
    render(sys.argv[1], sys.argv[2])
