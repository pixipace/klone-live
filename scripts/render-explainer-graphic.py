#!/usr/bin/env python3
"""
Render a single explainer graphic (1080x1920 transparent PNG).

Reads JSON from stdin, dispatches by `type`:
  {"type": "title",     "title": "...", "subtitle": "...", "outPath": "/abs/path.png"}
  {"type": "stat",      "value": "111",  "label": "TOTAL SCORE", "outPath": "..."}
  {"type": "pullquote", "text": "...",   "outPath": "..."}

All renderers produce a 1080x1920 transparent canvas so the composer can
overlay them at (0,0) without coordinate math. Each graphic follows the
SAME design language so multiple overlays stacked through one explainer
look like a single editor's choices, not random clip-art:

  - Heavy black-stroke text (matches caption style)
  - Brand accent color #FF5050 (matches the "VIA" attribution pill)
  - Soft drop-shadow card backgrounds where needed
  - Large type — readable on phone at arm's length
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CANVAS_W = 1080
CANVAS_H = 1920

ACCENT = (255, 80, 80, 255)        # Klone red
ACCENT_BG = (255, 80, 80, 230)
TEXT = (255, 255, 255, 255)
TEXT_DIM = (220, 220, 220, 255)
STROKE = (0, 0, 0, 255)
CARD_BG = (10, 10, 18, 230)

FONT_CANDIDATES = [
    "/Users/gill/Library/Fonts/Lato-Black.ttf",
    "/Users/gill/Library/Fonts/Lato-Bold.ttf",
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


def measure(font: ImageFont.ImageFont, text: str):
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1], bbox


def wrap_to_width(text: str, font: ImageFont.ImageFont, max_w: int):
    words = text.split()
    lines = []
    current = ""
    for w in words:
        candidate = f"{current} {w}".strip()
        cw, _, _ = measure(font, candidate)
        if cw > max_w and current:
            lines.append(current)
            current = w
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_stroked_text(draw, xy, text, font, fill=TEXT, stroke_w=8):
    draw.text(xy, text, font=font, fill=fill, stroke_width=stroke_w, stroke_fill=STROKE)


# --------------------------------------------------------------------------
# 1) TITLE CARD — opening 2s. Episode-style framing.
# --------------------------------------------------------------------------
def render_title(cfg: dict) -> Image.Image:
    img = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    # Soft semi-opaque dark slab so the title pops against the source.
    slab = Image.new("RGBA", (CANVAS_W, 600), (0, 0, 0, 200))
    img.paste(slab, (0, (CANVAS_H - 600) // 2), slab)

    draw = ImageDraw.Draw(img)
    title = (cfg.get("title") or "").strip()
    subtitle = (cfg.get("subtitle") or "").strip().upper()

    # Subtitle (small accent line above title)
    if subtitle:
        sub_font = load_font(38)
        sw, sh, sb = measure(sub_font, subtitle)
        sy = (CANVAS_H // 2) - 220
        # Pill background
        pad_x, pad_y = 22, 10
        pill_w = sw + pad_x * 2
        pill_h = sh + pad_y * 2
        pill_x = (CANVAS_W - pill_w) // 2
        draw.rounded_rectangle(
            [(pill_x, sy), (pill_x + pill_w, sy + pill_h)],
            radius=10,
            fill=ACCENT_BG,
        )
        draw.text(
            (pill_x + pad_x - sb[0], sy + pad_y - sb[1]),
            subtitle,
            font=sub_font,
            fill=TEXT,
        )

    # Title — wrap to fit, scale down if needed
    base_size = 110
    title_lines = []
    title_font = None
    while base_size >= 60:
        title_font = load_font(base_size)
        title_lines = wrap_to_width(title, title_font, CANVAS_W - 140)
        if len(title_lines) <= 4:
            break
        base_size -= 8

    line_h = base_size + 18
    total_h = len(title_lines) * line_h
    y = (CANVAS_H - total_h) // 2
    for ln in title_lines:
        lw, _, lb = measure(title_font, ln)
        x = (CANVAS_W - lw) // 2 - lb[0]
        draw_stroked_text(draw, (x, y), ln, title_font)
        y += line_h

    return img


# --------------------------------------------------------------------------
# 2) STAT CALLOUT — vlogger-style "this number matters" card.
#    Anchored upper-right corner, big value + small label.
# --------------------------------------------------------------------------
def render_stat(cfg: dict) -> Image.Image:
    img = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    value = (cfg.get("value") or "").strip()
    label = (cfg.get("label") or "").strip().upper()
    if not value:
        return img

    val_font = load_font(160)
    lab_font = load_font(36)
    vw, vh, vb = measure(val_font, value)
    lw, lh, lb = measure(lab_font, label) if label else (0, 0, (0, 0, 0, 0))

    pad = 36
    inner_gap = 14
    card_w = max(vw, lw) + pad * 2
    card_h = vh + (inner_gap + lh if label else 0) + pad * 2
    # Upper-right placement, ~10% from top, ~5% from right
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
    # Card background — nearly black
    draw.rounded_rectangle(
        [(card_x, card_y), (card_x + card_w, card_y + card_h)],
        radius=22,
        fill=CARD_BG,
    )
    # Accent left bar
    draw.rounded_rectangle(
        [(card_x, card_y), (card_x + 10, card_y + card_h)],
        radius=4,
        fill=ACCENT,
    )

    # Value (big, accent color)
    val_x = card_x + (card_w - vw) // 2 - vb[0]
    val_y = card_y + pad - vb[1]
    draw.text((val_x, val_y), value, font=val_font, fill=ACCENT)

    # Label (small, dim)
    if label:
        lab_x = card_x + (card_w - lw) // 2 - lb[0]
        lab_y = card_y + pad + vh + inner_gap - lb[1]
        draw.text((lab_x, lab_y), label, font=lab_font, fill=TEXT_DIM)

    return img


# --------------------------------------------------------------------------
# 3) PULL QUOTE — for the punchiest line per explainer. Big stylized text
#    centered with quote marks. Replaces caption visually for its window.
# --------------------------------------------------------------------------
def render_pullquote(cfg: dict) -> Image.Image:
    img = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    text = (cfg.get("text") or "").strip()
    if not text:
        return img
    text = text.strip(' "\'')

    # Soft dark background slab
    slab = Image.new("RGBA", (CANVAS_W, 600), (0, 0, 0, 180))
    img.paste(slab, (0, (CANVAS_H - 600) // 2), slab)

    draw = ImageDraw.Draw(img)

    # Big accent quote marks
    quote_font = load_font(200)
    qw, qh, qb = measure(quote_font, "“")
    draw.text(
        (90 - qb[0], (CANVAS_H // 2) - 280 - qb[1]),
        "“",
        font=quote_font,
        fill=ACCENT,
    )

    # Quote body — wrap, shrink to fit
    base_size = 86
    lines = []
    body_font = None
    while base_size >= 50:
        body_font = load_font(base_size)
        lines = wrap_to_width(text, body_font, CANVAS_W - 220)
        if len(lines) <= 5:
            break
        base_size -= 6

    line_h = base_size + 16
    total_h = len(lines) * line_h
    y = (CANVAS_H - total_h) // 2 - 30
    for ln in lines:
        lw, _, lb = measure(body_font, ln)
        x = (CANVAS_W - lw) // 2 - lb[0]
        draw_stroked_text(draw, (x, y), ln, body_font, fill=TEXT, stroke_w=6)
        y += line_h

    return img


# --------------------------------------------------------------------------
# Dispatch
# --------------------------------------------------------------------------
RENDERERS = {
    "title": render_title,
    "stat": render_stat,
    "pullquote": render_pullquote,
}


def main() -> int:
    cfg = json.loads(sys.stdin.read())
    kind = cfg.get("type")
    out_path = cfg.get("outPath")
    if not kind or not out_path:
        print(f"FAIL: need type + outPath", file=sys.stderr)
        return 1
    if kind not in RENDERERS:
        print(f"FAIL: unknown type {kind}", file=sys.stderr)
        return 2
    try:
        img = RENDERERS[kind](cfg)
    except Exception as e:
        print(f"FAIL: render error: {e}", file=sys.stderr)
        return 3
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    img.save(out_path, "PNG")
    print(json.dumps({"path": out_path, "type": kind}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
