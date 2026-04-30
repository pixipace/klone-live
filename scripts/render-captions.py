#!/usr/bin/env python3
"""
Render caption PNG frames for word-by-word display.

Reads JSON from stdin:
  {"words": [{"start": 0.4, "end": 0.7, "text": "Hello"}, ...],
   "durationSec": 30.0,
   "outDir": "/path/to/dir",
   "fps": 8,
   "targetWidth": 1080,
   "targetHeight": 1920}

Writes cap_000001.png, cap_000002.png, ... to outDir.

Design: ONE word at a time, dead-center horizontally, anchored vertically.
Each spoken word REPLACES the previous — no sliding window, no re-centering
mid-word, no horizontal jumping. Big bold text with thick black stroke; no
box. This is the viral-shorts standard ("CapCut auto-captions") and reads
clean over any background without occluding a quarter of the frame.

Three styles via CAPTION_STYLE env:
  bold    (default) — single word, huge, white + thick stroke
  yellow            — single word, huge, yellow + thick stroke
  classic           — legacy 2-word + box (kept for users who already chose it)
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Lato Black is the heaviest weight available locally and reads as bold-bold
# at large sizes — close to the "Anton/Bebas/Impact" feel TikTok uses without
# adding a font dependency. Falls back to system bold if missing.
FONT_CANDIDATES = [
    "/Users/gill/Library/Fonts/Lato-Black.ttf",
    "/Users/gill/Library/Fonts/Lato-Bold.ttf",
    "/System/Library/Fonts/SFCompact.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]

STYLE = os.environ.get("CAPTION_STYLE", "bold").strip().lower()

if STYLE == "classic":
    # Legacy preset — kept so users who explicitly chose "classic" still get it.
    FONT_SIZE = 78
    TEXT_COLOR = (255, 255, 255, 255)
    HIGHLIGHT_COLOR = (255, 220, 60, 255)
    STROKE_WIDTH = 0
    STROKE_COLOR = (0, 0, 0, 255)
    USE_BOX = True
    BOX_OPACITY = 0.65
    BOX_PAD_X = 28
    BOX_PAD_Y = 18
    WORDS_PER_FRAME = 2
    Y_PERCENT = 0.70
elif STYLE == "yellow":
    # MrBeast/MrWhoseTheBoss-style — kept as-is for users who want
    # the loud preset. Slightly slimmed (was 128) for less shoutiness.
    FONT_SIZE = 92
    TEXT_COLOR = (255, 220, 60, 255)
    HIGHLIGHT_COLOR = (255, 220, 60, 255)
    STROKE_WIDTH = 7
    STROKE_COLOR = (0, 0, 0, 255)
    USE_BOX = False
    BOX_OPACITY = 0.0
    BOX_PAD_X = 0
    BOX_PAD_Y = 0
    WORDS_PER_FRAME = 1
    Y_PERCENT = 0.68
else:  # "bold" (default — professional broadcast caption look)
    # Refined for documentary/news-style explainers (was 104px which
    # screamed "TikTok captions"):
    #   - Font 104 → 68 — broadcast-news scale, fits 5+ words per chunk
    #     comfortably without shrink-to-fit kicking in
    #   - Tighter pill padding (32→18 / 18→10) — sits flush with text
    #   - Bumped position (0.62 → 0.74) so smaller text reads as caption
    #     instead of floating mid-frame
    #   - Words-per-frame 1 → 3 — more text per frame at this size feels
    #     readable and less jumpy
    #   - Drop shadow + pill bg unchanged (the premium-look basis)
    FONT_SIZE = 68
    TEXT_COLOR = (255, 255, 255, 255)
    HIGHLIGHT_COLOR = (255, 80, 80, 255)  # Brand accent for first word
    STROKE_WIDTH = 0
    STROKE_COLOR = (0, 0, 0, 255)
    USE_BOX = True
    BOX_OPACITY = 0.55
    BOX_PAD_X = 18
    BOX_PAD_Y = 10
    WORDS_PER_FRAME = 3
    Y_PERCENT = 0.74


def load_font(size: int):
    for p in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def find_current_word_idx(words, t):
    """Return index of word being spoken at time t, else closest upcoming
    within 0.35s, else None (silence — render nothing)."""
    for i, w in enumerate(words):
        if w["start"] <= t < w["end"]:
            return i
    for i, w in enumerate(words):
        if w["start"] > t and w["start"] - t < 0.35:
            return i
    return None


def words_for_frame(words, current_idx):
    """For WORDS_PER_FRAME=1, just return [current]. For >1, group with
    neighbors. Returns (visible_list, highlight_idx_within_visible)."""
    if WORDS_PER_FRAME <= 1:
        return [words[current_idx]], 0
    half = WORDS_PER_FRAME // 2
    start = max(0, current_idx - half)
    end = min(len(words), start + WORDS_PER_FRAME)
    start = max(0, end - WORDS_PER_FRAME)
    return words[start:end], current_idx - start


def shrink_to_fit(text, max_w, base_size):
    """Pick a font size that keeps `text` within max_w. Caps at base_size,
    floors at 40px so single very-long words still render legibly. Lower
    floor than the old 60 so the new broadcast 68px base can shrink for
    long chunks without immediately giving up."""
    size = base_size
    floor = 40
    while size > floor:
        font = load_font(size)
        bbox = font.getbbox(text)
        if (bbox[2] - bbox[0]) <= max_w:
            return font, bbox
        size -= 4
    return load_font(floor), load_font(floor).getbbox(text)


def _word_widths(font, words):
    """Per-word pixel widths (no inter-word space)."""
    return [font.getbbox(w)[2] - font.getbbox(w)[0] for w in words]


def render_frame(visible, highlight_idx, target_w, target_h,
                 word_age=1.0, position_idx=0):
    """word_age: seconds since THIS word/chunk first appeared (0..N).
       Used for the entrance scale-bounce — 0..0.15s gets a quick pop.
       position_idx: rolling counter across the script. Even = bottom,
       every 3rd = top (variance to break "captions always same spot")."""
    img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    if not visible:
        return img

    text = " ".join(w["text"].strip() for w in visible).upper()
    if not text:
        return img

    # Position variance: every 3rd chunk goes to TOP of frame instead
    # of bottom. Breaks the "AI captions always same spot" tell that
    # makes static captions read as auto-generated.
    use_top = position_idx % 3 == 2
    y_pct = 0.18 if use_top else Y_PERCENT

    # Pop animation: 0.85 → 1.05 → 1.0 over the first 0.15s. Implemented
    # by scaling the FONT SIZE itself (no resampling artifacts vs scaling
    # a finished bitmap). Cheap, looks crisp.
    pop_scale = 1.0
    if word_age < 0.15:
        u = max(0.0, min(1.0, word_age / 0.15))
        if u < 0.6:
            pop_scale = 0.85 + (1.05 - 0.85) * (u / 0.6)
        else:
            pop_scale = 1.05 - (1.05 - 1.0) * ((u - 0.6) / 0.4)
    # Floor the pop scale at 80% of base — keeps the bounce visible at
    # smaller font sizes (was hardcoded 60px which floored too high
    # for the new 68px broadcast scale, killing the pop animation).
    effective_size = max(int(FONT_SIZE * 0.85), int(FONT_SIZE * pop_scale))

    # Single-word path: text is centered, anchor never shifts mid-word so
    # there's zero horizontal jitter between frames showing the same word.
    max_w = target_w - 120  # 60px safe margin each side
    font, bbox = shrink_to_fit(text, max_w, effective_size)

    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    base_x = (target_w - text_w) // 2 - bbox[0]
    base_y = int(target_h * y_pct) - bbox[1]

    # 1) Soft pill background — premium "produced" look without screaming
    #    box. Slightly rounded, semi-opaque, sits just behind the text.
    if USE_BOX:
        box_x0 = (target_w - text_w) // 2 - BOX_PAD_X
        box_y0 = int(target_h * Y_PERCENT) - BOX_PAD_Y
        box_x1 = box_x0 + text_w + BOX_PAD_X * 2
        box_y1 = box_y0 + text_h + BOX_PAD_Y * 2
        # Drop shadow for the pill (gives depth)
        shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow_layer)
        sdraw.rounded_rectangle(
            [(box_x0 + 6, box_y0 + 12), (box_x1 + 6, box_y1 + 12)],
            radius=24,
            fill=(0, 0, 0, 120),
        )
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(8))
        img = Image.alpha_composite(img, shadow_layer)
        # Pill itself
        pill_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        pdraw = ImageDraw.Draw(pill_layer)
        pdraw.rounded_rectangle(
            [(box_x0, box_y0), (box_x1, box_y1)],
            radius=24,
            fill=(0, 0, 0, int(255 * BOX_OPACITY)),
        )
        img = Image.alpha_composite(img, pill_layer)

    draw = ImageDraw.Draw(img)

    # 2) Per-word colour — first word of multi-word chunks gets the accent
    #    so the eye has a focal point. Single-word chunks just use TEXT_COLOR.
    words = text.split(" ")
    if len(words) > 1 and HIGHLIGHT_COLOR != TEXT_COLOR:
        widths = _word_widths(font, words)
        space_w = font.getbbox(" ")[2] - font.getbbox(" ")[0]
        cursor_x = base_x
        for wi, w in enumerate(words):
            color = HIGHLIGHT_COLOR if wi == 0 else TEXT_COLOR
            if STROKE_WIDTH > 0:
                draw.text(
                    (cursor_x, base_y), w, font=font, fill=color,
                    stroke_width=STROKE_WIDTH, stroke_fill=STROKE_COLOR,
                )
            else:
                # Soft drop shadow per word for depth without harsh stroke
                draw.text((cursor_x + 4, base_y + 5), w, font=font, fill=(0, 0, 0, 200))
                draw.text((cursor_x, base_y), w, font=font, fill=color)
            cursor_x += widths[wi] + space_w
    else:
        color = HIGHLIGHT_COLOR if len(words) == 1 else TEXT_COLOR
        if STROKE_WIDTH > 0:
            draw.text(
                (base_x, base_y), text, font=font, fill=color,
                stroke_width=STROKE_WIDTH, stroke_fill=STROKE_COLOR,
            )
        else:
            # Soft drop shadow for depth (premium, modern look — replaces
            # the harsh 10px black stroke that read as "AI-generated").
            draw.text((base_x + 4, base_y + 5), text, font=font, fill=(0, 0, 0, 200))
            draw.text((base_x, base_y), text, font=font, fill=color)

    return img


def main():
    cfg = json.loads(sys.stdin.read())
    words = cfg["words"]
    duration = float(cfg["durationSec"])
    out_dir = cfg["outDir"]
    fps = int(cfg.get("fps", 8))
    target_w = int(cfg.get("targetWidth", 1080))
    target_h = int(cfg.get("targetHeight", 1920))

    os.makedirs(out_dir, exist_ok=True)

    n_frames = max(1, int(duration * fps))
    for i in range(n_frames):
        t = (i + 0.5) / fps
        idx = find_current_word_idx(words, t)
        if idx is None:
            img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
        else:
            visible, highlight = words_for_frame(words, idx)
            # word_age = time since the focus chunk's start (used by the
            # pop-bounce animation in render_frame). idx is the index into
            # the input words array, so its start time is words[idx]["start"].
            word_age = max(0.0, t - words[idx]["start"])
            img = render_frame(
                visible, highlight, target_w, target_h,
                word_age=word_age,
                position_idx=idx,
            )
        img.save(os.path.join(out_dir, f"cap_{i + 1:06d}.png"), "PNG")

    print(json.dumps({"frames": n_frames, "fps": fps}))


if __name__ == "__main__":
    main()
