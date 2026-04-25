#!/usr/bin/env python3
"""
Render a sequence of caption PNG frames for word-by-word display.

Reads word-level data from stdin as JSON:
  {"words": [{"start": 0.4, "end": 0.7, "text": "Hello"}, ...],
   "durationSec": 30.0,
   "outDir": "/path/to/dir",
   "fps": 8,
   "targetWidth": 1080,
   "targetHeight": 1920}

Outputs frames as cap_000001.png, cap_000002.png, ... in outDir.
Each frame shows up to 3 words centered, with the current word highlighted
bright yellow; other visible words white. Black rounded box for legibility.
Placed at ~70% down the frame (bottom third).

Usage: cat input.json | render-captions.py
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

DEFAULT_FONT = "/Users/gill/Library/Fonts/Lato-Bold.ttf"
WORD_GAP = 16  # px between words
LINE_SPACING = 12
MAX_LINES = 2
MAX_WORDS_PER_FRAME = 4  # current + up to 3 surrounding for context

# Three style presets — STYLE env var picks one
STYLE = os.environ.get("CAPTION_STYLE", "classic").strip().lower()

if STYLE == "bold":
    # TikTok-style — bigger font, bright text always, no box, stroke for legibility
    FONT_SIZE = 96
    HIGHLIGHT_COLOR = (255, 220, 60, 255)
    TEXT_COLOR = (255, 230, 100, 255)
    USE_BOX = False
    STROKE_WIDTH = 6
    STROKE_COLOR = (0, 0, 0, 255)
    BOX_OPACITY = 0.0
    BOX_PAD_X = 0
    BOX_PAD_Y = 0
elif STYLE == "minimal":
    # YouTube-essay-style — small white text, no box, current word slightly bigger
    FONT_SIZE = 56
    HIGHLIGHT_COLOR = (255, 255, 255, 255)
    TEXT_COLOR = (200, 200, 200, 230)
    USE_BOX = False
    STROKE_WIDTH = 3
    STROKE_COLOR = (0, 0, 0, 200)
    BOX_OPACITY = 0.0
    BOX_PAD_X = 0
    BOX_PAD_Y = 0
else:
    # Classic — yellow word highlight, white siblings, black rounded box
    FONT_SIZE = 72
    HIGHLIGHT_COLOR = (255, 220, 60, 255)
    TEXT_COLOR = (255, 255, 255, 255)
    USE_BOX = True
    STROKE_WIDTH = 0
    STROKE_COLOR = (0, 0, 0, 0)
    BOX_OPACITY = 0.6
    BOX_PAD_X = 24
    BOX_PAD_Y = 16


def load_font(size: int = FONT_SIZE):
    try:
        return ImageFont.truetype(DEFAULT_FONT, size)
    except OSError:
        return ImageFont.load_default()


def find_current_word_idx(words: list[dict], t: float) -> int | None:
    """Return index of the word being spoken at time t, or None if silence."""
    for i, w in enumerate(words):
        if w["start"] <= t < w["end"]:
            return i
    # If between words, find the closest *upcoming* word within 0.4s
    for i, w in enumerate(words):
        if w["start"] > t and w["start"] - t < 0.4:
            return i
    return None


def words_for_frame(words: list[dict], current_idx: int) -> tuple[list[dict], int]:
    """Return (visible_words, highlight_index_within_visible)."""
    # Center current word in the visible window
    half = MAX_WORDS_PER_FRAME // 2
    start = max(0, current_idx - half)
    end = min(len(words), start + MAX_WORDS_PER_FRAME)
    # If we hit the right edge, shift left to keep the window full
    start = max(0, end - MAX_WORDS_PER_FRAME)
    visible = words[start:end]
    highlight_within = current_idx - start
    return visible, highlight_within


def render_frame(
    visible: list[dict],
    highlight_idx: int,
    target_w: int,
    target_h: int,
    font: ImageFont.ImageFont,
) -> Image.Image:
    img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))

    if not visible:
        return img

    draw = ImageDraw.Draw(img)
    texts = [w["text"].strip() for w in visible]

    # Measure each word's bounding box
    word_widths: list[int] = []
    word_heights: list[int] = []
    for t in texts:
        bbox = font.getbbox(t)
        word_widths.append(bbox[2] - bbox[0])
        word_heights.append(bbox[3] - bbox[1])

    # Wrap to lines so the row doesn't exceed target_w - 80
    max_row_w = target_w - 80
    lines: list[list[int]] = [[]]  # indices
    for i, w in enumerate(word_widths):
        candidate = sum(word_widths[idx] for idx in lines[-1]) + (
            len(lines[-1]) * WORD_GAP if lines[-1] else 0
        ) + w
        if candidate > max_row_w and lines[-1]:
            lines.append([i])
            if len(lines) > MAX_LINES:
                # Drop overflow lines silently
                lines = lines[:MAX_LINES]
                break
        else:
            lines[-1].append(i)

    # Compute total block size
    line_widths: list[int] = []
    line_heights: list[int] = []
    for line in lines:
        if not line:
            continue
        lw = sum(word_widths[i] for i in line) + WORD_GAP * (len(line) - 1)
        lh = max(word_heights[i] for i in line)
        line_widths.append(lw)
        line_heights.append(lh)

    if not line_heights:
        return img

    total_h = sum(line_heights) + LINE_SPACING * (len(line_heights) - 1)
    box_w = max(line_widths) + BOX_PAD_X * 2
    box_h = total_h + BOX_PAD_Y * 2

    # Position: ~72% down the frame
    box_y = int(target_h * 0.72)
    box_x = (target_w - box_w) // 2

    if USE_BOX:
        draw.rounded_rectangle(
            [(box_x, box_y), (box_x + box_w, box_y + box_h)],
            radius=20,
            fill=(0, 0, 0, int(255 * BOX_OPACITY)),
        )

    y = box_y + BOX_PAD_Y
    for li, line in enumerate(lines[: len(line_heights)]):
        lw = line_widths[li]
        x = (target_w - lw) // 2
        for word_i in line:
            color = HIGHLIGHT_COLOR if word_i == highlight_idx else TEXT_COLOR
            offset_y = -font.getbbox(texts[word_i])[1]
            if STROKE_WIDTH > 0:
                # Black stroke around text — needed for box-less styles
                # so text stays legible over any background.
                draw.text(
                    (x, y + offset_y),
                    texts[word_i],
                    font=font,
                    fill=color,
                    stroke_width=STROKE_WIDTH,
                    stroke_fill=STROKE_COLOR,
                )
            else:
                draw.text((x, y + offset_y), texts[word_i], font=font, fill=color)
            x += word_widths[word_i] + WORD_GAP
        y += line_heights[li] + LINE_SPACING

    return img


def main() -> None:
    raw = sys.stdin.read()
    cfg = json.loads(raw)
    words = cfg["words"]
    duration = float(cfg["durationSec"])
    out_dir = cfg["outDir"]
    fps = int(cfg.get("fps", 8))
    target_w = int(cfg.get("targetWidth", 1080))
    target_h = int(cfg.get("targetHeight", 1920))

    os.makedirs(out_dir, exist_ok=True)
    font = load_font(FONT_SIZE)

    n_frames = max(1, int(duration * fps))
    for i in range(n_frames):
        t = (i + 0.5) / fps
        idx = find_current_word_idx(words, t)
        if idx is None:
            # Empty frame (silence)
            img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
        else:
            visible, highlight = words_for_frame(words, idx)
            img = render_frame(visible, highlight, target_w, target_h, font)
        img.save(os.path.join(out_dir, f"cap_{i + 1:06d}.png"), "PNG")

    # Print frame count for the caller
    print(json.dumps({"frames": n_frames, "fps": fps}))


if __name__ == "__main__":
    main()
