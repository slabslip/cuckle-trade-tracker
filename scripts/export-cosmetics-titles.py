#!/usr/bin/env python3
"""Export every cosmetics title as a shorter full-bleed calling-card banner.

Frame: 1024×180 (~30% shorter than the prior 1024×256 CoD 4:1 masters).
Crown ladder art comes from ff-title-banners-spaced-v1.png (cover / edge-to-edge).
Custom masters (e.g. Blowout comic dryers) come from docs/design/cosmetics/.
All other titles get generated full-bleed cards (rarity palette + optional emblem).

Output: data/ui/cosmetics/title-<id>.png
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "docs/design/cosmetics/ff-title-banners-spaced-v1.png"
OUT = ROOT / "data/ui/cosmetics"
COS = ROOT / "data/ui/cosmetics.json"
DESIGN = ROOT / "docs/design/cosmetics"
# 30% shorter than 256 → 180. Aspect ≈ 5.69:1.
W, H = 1024, 180

# Hand-illustrated / custom masters — re-export from design art instead of
# overwriting with the generic rarity card generator.
CUSTOM_TITLE_MASTERS = {
    "blowout": DESIGN / "ff-title-blowout-comic-v1.png",
    "nailbiter": DESIGN / "ff-title-nailbiter-comic-v1.png",
    "bracket_thief_title": DESIGN / "ff-title-bracket_thief_title-comic-v1.png",
    "scorched": DESIGN / "ff-title-scorched-comic-v1.png",
    "climber": DESIGN / "ff-title-climber-comic-v1.png",
    "pick_hoard": DESIGN / "ff-title-pick_hoard-comic-v1.png",
    "wire_throne": DESIGN / "ff-title-wire_throne-comic-v1.png",
    "rookie_king": DESIGN / "ff-title-rookie_king-comic-v1.png",
    "loyalty": DESIGN / "ff-title-loyalty-comic-v1.png",
    "points_champ_title": DESIGN / "ff-title-points_champ_title-comic-v1.png",
    "three_time_finalist_title": DESIGN / "ff-title-three_time_finalist_title-comic-v1.png",
    "two_time_finalist_title": DESIGN / "ff-title-two_time_finalist_title-comic-v1.png",
    "finalist_title": DESIGN / "ff-title-finalist_title-comic-v1.png",
    "last_place_title": DESIGN / "ff-title-last_place_title-comic-v1.png",
    "iron_core_title": DESIGN / "ff-title-iron_core_title-comic-v1.png",
    "opening_day_title": DESIGN / "ff-title-opening_day_title-comic-v1.png",
    "sit_right_title": DESIGN / "ff-title-sit_right_title-comic-v1.png",
    "volume_title": DESIGN / "ff-title-volume_title-comic-v1.png",
    "whale_title": DESIGN / "ff-title-whale_title-comic-v1.png",
    "extractor_title": DESIGN / "ff-title-extractor_title-comic-v1.png",
    "win_now": DESIGN / "ff-title-win_now-comic-v1.png",
    "investor": DESIGN / "ff-title-investor-comic-v1.png",
    "firsts_merchant_title": DESIGN / "ff-title-firsts_merchant_title-comic-v1.png",
    "playoff_trader_title": DESIGN / "ff-title-playoff_trader_title-comic-v1.png",
    "quiet_year_title": DESIGN / "ff-title-quiet_year_title-comic-v1.png",
    "manners_title": DESIGN / "ff-title-manners_title-comic-v1.png",
    "draft_hit_title": DESIGN / "ff-title-draft_hit_title-comic-v1.png",
    "waiver_touch_title": DESIGN / "ff-title-waiver_touch_title-comic-v1.png",
    "founding_draft": DESIGN / "ff-title-founding_draft-comic-v1.png",
    "cartel": DESIGN / "ff-title-cartel-comic-v1.png",
    "pick_path": DESIGN / "ff-title-pick_path-comic-v1.png",
    "player_path": DESIGN / "ff-title-player_path-comic-v1.png",
    "aging": DESIGN / "ff-title-aging-comic-v1.png",
    "farm_sold": DESIGN / "ff-title-farm_sold-comic-v1.png",
    "inaugural": DESIGN / "ff-title-inaugural-comic-v1.png",
    "perfect_chip": DESIGN / "ff-title-perfect_chip-comic-v1.png",
}

CROWN_ORDER = [
    "five_time",
    "four_time",
    "three_peat",
    "three_time",
    "repeat",
    "two_time",
    "champion",
]

PALETTE = {
    "gold": {
        "bg0": (18, 14, 8),
        "bg1": (58, 42, 14),
        "bg2": (28, 22, 12),
        "accent": (224, 180, 76),
        "accent2": (255, 230, 160),
        "ink": (255, 236, 190),
        "frame": (196, 150, 58),
    },
    "silver": {
        "bg0": (12, 14, 18),
        "bg1": (48, 54, 64),
        "bg2": (22, 26, 32),
        "accent": (180, 190, 205),
        "accent2": (230, 235, 245),
        "ink": (236, 240, 248),
        "frame": (150, 160, 175),
    },
    "bronze": {
        "bg0": (16, 10, 8),
        "bg1": (72, 42, 22),
        "bg2": (28, 16, 12),
        "accent": (196, 120, 64),
        "accent2": (232, 180, 120),
        "ink": (255, 220, 180),
        "frame": (168, 100, 52),
    },
    "iron": {
        "bg0": (10, 12, 14),
        "bg1": (40, 46, 52),
        "bg2": (18, 20, 24),
        "accent": (120, 130, 140),
        "accent2": (190, 198, 205),
        "ink": (220, 226, 232),
        "frame": (100, 108, 118),
    },
}

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/croscore/Tinos-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def find_bands(content: np.ndarray):
    row = content.mean(axis=1)
    bands = []
    inb = False
    start = 0
    for i, v in enumerate(row):
        if v > 0.05 and not inb:
            start = i
            inb = True
        elif v <= 0.05 and inb:
            bands.append((start, i - 1))
            inb = False
    if inb:
        bands.append((start, content.shape[0] - 1))
    return bands


def tight_crop(im: Image.Image, content: np.ndarray, y0: int, y1: int) -> Image.Image:
    strip = content[y0 : y1 + 1]
    xs = np.where(strip.any(axis=0))[0]
    ys = np.where(strip.any(axis=1))[0]
    x0 = max(0, int(xs.min()) - 2)
    x1 = min(im.size[0] - 1, int(xs.max()) + 2)
    yy0 = max(0, y0 + int(ys.min()) - 2)
    yy1 = min(im.size[1] - 1, y0 + int(ys.max()) + 2)
    return im.crop((x0, yy0, x1 + 1, yy1 + 1))


def cover_fit(art: Image.Image, size=(W, H), top_bias: int = 0) -> Image.Image:
    """Scale art to fill the entire banner (edge-to-edge), center-crop overflow."""
    tw, th = size
    scale = max(tw / art.size[0], th / art.size[1])
    nw = max(1, int(math.ceil(art.size[0] * scale)))
    nh = max(1, int(math.ceil(art.size[1] * scale)))
    scaled = art.resize((nw, nh), Image.LANCZOS)
    arr = np.array(scaled.convert("RGBA"))
    arr[:, :, 3] = 255
    scaled = Image.fromarray(arr, "RGBA")
    left = max(0, (nw - tw) // 2)
    top = max(0, min(nh - th, (nh - th) // 2 + top_bias))
    return scaled.crop((left, top, left + tw, top + th))


def export_custom_title(tid: str, name: str) -> Image.Image:
    """Build a full-bleed banner from a hand-drawn master (+ comic title type)."""
    master_path = CUSTOM_TITLE_MASTERS[tid]
    if not master_path.exists():
        raise SystemExit(f"missing custom title master: {master_path}")
    master = Image.open(master_path).convert("RGBA")
    # Blowout comic: bias crop up so dryer faces stay in the short strip
    bias = -90 if tid == "climber" else (-70 if tid in CUSTOM_TITLE_MASTERS else 0)
    banner = cover_fit(master, top_bias=bias)

    # Soft left vignette so title text stays readable on busy comic art
    wash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    for x in range(0, 420):
        a = int(150 * (1 - x / 420) ** 1.4)
        wd.line([(x, 0), (x, H)], fill=(8, 6, 14, a))
    banner = Image.alpha_composite(banner, wash)

    draw = ImageDraw.Draw(banner)
    words = [w.upper() for w in name.split()]
    lines = words if len(words) <= 2 else [" ".join(words[:-1]), words[-1]]
    f = font(52)
    for size in range(56, 28, -1):
        f = font(size)
        widths = [draw.textbbox((0, 0), ln, font=f)[2] for ln in lines]
        if max(widths) <= 380:
            break
    bboxes = [draw.textbbox((0, 0), ln, font=f) for ln in lines]
    heights = [b[3] - b[1] for b in bboxes]
    gap = 2
    total_h = sum(heights) + gap
    y = (H - total_h) // 2 - 2
    x = 22
    fill = (255, 236, 90, 255)
    stroke = (12, 8, 20, 255)
    for ln, bh in zip(lines, heights):
        for dx, dy in (
            (-3, 0), (3, 0), (0, -3), (0, 3),
            (-2, -2), (2, -2), (-2, 2), (2, 2),
            (-3, -2), (3, -2), (-3, 2), (3, 2),
        ):
            draw.text((x + dx, y + dy), ln, font=f, fill=stroke)
        draw.text((x, y), ln, font=f, fill=fill)
        y += bh + gap
    draw.rectangle([22, H - 14, 220, H - 11], fill=(255, 220, 80, 210))
    draw.rectangle([0, 0, W - 1, H - 1], outline=(255, 240, 120, 160))
    draw.rectangle([2, 2, W - 3, H - 3], outline=(20, 12, 30, 120))
    return banner


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def gradient_bg(pal: dict) -> Image.Image:
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        ty = y / max(H - 1, 1)
        for x in range(W):
            tx = x / max(W - 1, 1)
            # Diagonal wash + soft vignette-ish mid band
            c = lerp(pal["bg0"], pal["bg1"], 0.35 * tx + 0.65 * (1 - abs(ty - 0.45) * 1.4))
            c = lerp(c, pal["bg2"], 0.25 * (tx * ty))
            # Subtle horizontal scanlines for card texture
            if y % 3 == 0:
                c = lerp(c, pal["bg0"], 0.08)
            px[x, y] = c
    return img.convert("RGBA")


def draw_frame(draw: ImageDraw.ImageDraw, pal: dict) -> None:
    accent = pal["frame"] + (255,)
    # Outer + inner rails so the card reads edge-to-edge with chrome
    draw.rectangle([0, 0, W - 1, H - 1], outline=accent, width=3)
    draw.rectangle([5, 5, W - 6, H - 6], outline=pal["accent"] + (140,), width=1)
    # Corner ticks
    for x0, x1 in ((0, 28), (W - 29, W - 1)):
        for y0, y1 in ((0, 18), (H - 19, H - 1)):
            draw.rectangle([x0, y0, x1, y1], outline=pal["accent2"] + (180,), width=1)


def draw_motif(base: Image.Image, pal: dict, seed: int) -> Image.Image:
    """Full-bleed decorative motif — rays / chevrons spanning the card."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    rng = np.random.default_rng(seed)
    accent = pal["accent"]
    # Wide chevron bands
    for i in range(6):
        y = int(8 + i * (H / 5.5) + (seed % 7))
        alpha = 28 + (i % 3) * 10
        d.polygon(
            [(0, y), (W, y - 18), (W, y - 8), (0, y + 10)],
            fill=accent + (alpha,),
        )
    # Spark dots across the field
    for _ in range(40):
        x = int(rng.integers(0, W))
        y = int(rng.integers(0, H))
        r = int(rng.integers(1, 3))
        d.ellipse([x - r, y - r, x + r, y + r], fill=pal["accent2"] + (70,))
    # Soft blur so motifs feel painted into the plate
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=0.6))
    return Image.alpha_composite(base, overlay)


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, max_size: int) -> ImageFont.ImageFont:
    size = max_size
    while size >= 18:
        f = font(size)
        bbox = draw.textbbox((0, 0), text, font=f)
        if bbox[2] - bbox[0] <= max_width:
            return f
        size -= 2
    return font(18)


def wrap_name(name: str) -> list[str]:
    words = name.upper().split()
    if len(words) <= 1:
        return [name.upper()]
    if len(name) <= 16:
        return [name.upper()]
    # Prefer two lines for long names
    if len(words) == 2:
        return [words[0], words[1]]
    mid = len(words) // 2
    return [" ".join(words[:mid]), " ".join(words[mid:])]


def paste_emblem(card: Image.Image, emblem_id: str | None) -> Image.Image:
    if not emblem_id:
        return card
    path = OUT / f"emblem-{emblem_id}.png"
    if not path.exists():
        # pair id may equal emblem id already
        return card
    mark = Image.open(path).convert("RGBA")
    # Large mark on the right, full height-ish — bleeds across the card
    target_h = H - 16
    scale = target_h / mark.size[1]
    nw = max(1, int(mark.size[0] * scale))
    nh = max(1, int(mark.size[1] * scale))
    mark = mark.resize((nw, nh), Image.LANCZOS)
    # Soften so text stays readable (CoD safe-zone tip: left stays cleaner)
    arr = np.array(mark).astype(np.float32)
    arr[:, :, 3] *= 0.55
    mark = Image.fromarray(arr.astype(np.uint8), "RGBA")
    x = W - nw - 18
    y = (H - nh) // 2
    card.alpha_composite(mark, (x, y))
    return card


def generate_card(title: dict, emblem_file_id: str | None) -> Image.Image:
    pal = PALETTE.get(title.get("rarity") or "silver", PALETTE["silver"])
    seed = sum(ord(c) for c in title["id"])
    card = gradient_bg(pal)
    card = draw_motif(card, pal, seed)
    card = paste_emblem(card, emblem_file_id)

    # Left safe zone wash so typography stays legible over motifs/emblems
    wash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    for x in range(0, int(W * 0.62)):
        a = int(110 * (1 - x / (W * 0.62)))
        wd.line([(x, 0), (x, H)], fill=(pal["bg0"] + (a,)))
    card = Image.alpha_composite(card, wash)

    draw = ImageDraw.Draw(card)
    draw_frame(draw, pal)

    lines = wrap_name(title["name"])
    # Size text to the left ~58% safe zone
    max_w = int(W * 0.55)
    if len(lines) == 1:
        f = fit_text(draw, lines[0], max_w, 54)
        bbox = draw.textbbox((0, 0), lines[0], font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = 28
        y = (H - th) // 2 - 4
        draw.text((x + 2, y + 2), lines[0], font=f, fill=(0, 0, 0, 160))
        draw.text((x, y), lines[0], font=f, fill=pal["ink"] + (255,))
    else:
        f = fit_text(draw, max(lines, key=len), max_w, 40)
        bboxes = [draw.textbbox((0, 0), ln, font=f) for ln in lines]
        heights = [b[3] - b[1] for b in bboxes]
        gap = 4
        total_h = sum(heights) + gap
        y = (H - total_h) // 2 - 2
        x = 28
        for ln, bh in zip(lines, heights):
            draw.text((x + 2, y + 2), ln, font=f, fill=(0, 0, 0, 160))
            draw.text((x, y), ln, font=f, fill=pal["ink"] + (255,))
            y += bh + gap

    # Thin accent bar under text block for calling-card finish
    draw.rectangle([28, H - 14, int(W * 0.42), H - 11], fill=pal["accent"] + (200,))
    return card


def export_crown_from_sheet() -> dict[str, Image.Image]:
    im = Image.open(SHEET).convert("RGBA")
    a = np.array(im)
    bg = a[5, 5, :3].astype(float)
    diff = np.linalg.norm(a[:, :, :3].astype(float) - bg, axis=2)
    content = diff > 18
    bands = find_bands(content)
    if len(bands) != len(CROWN_ORDER):
        raise SystemExit(f"expected {len(CROWN_ORDER)} banner bands, found {len(bands)}")
    out = {}
    for eid, (y0, y1) in zip(CROWN_ORDER, bands):
        art = tight_crop(im, content, y0, y1)
        out[eid] = cover_fit(art)
    return out


def emblem_file_for_pair(pair: str, catalog: list[dict]) -> str | None:
    """Return emblem asset stem id if emblem-<id>.png exists for this pair."""
    emblem = next((c for c in catalog if c.get("pair") == pair and c.get("kind") == "emblem"), None)
    if not emblem:
        return None
    # Live art uses pair stem for many emblems (points_champ) or *_mark for crown twins
    candidates = [emblem["id"]]
    if emblem["id"].endswith("_mark"):
        candidates.append(emblem["id"][: -len("_mark")])
    # Prefer existing file
    for cid in candidates:
        if (OUT / f"emblem-{cid}.png").exists():
            return cid
    return None


def main() -> None:
    book = json.loads(COS.read_text())
    catalog = book.get("catalog") or []
    titles = [c for c in catalog if c.get("kind") == "title"]
    if not titles:
        raise SystemExit("no titles in cosmetics.json")

    crown = export_crown_from_sheet()
    OUT.mkdir(parents=True, exist_ok=True)

    for t in titles:
        tid = t["id"]
        if tid in CUSTOM_TITLE_MASTERS:
            img = export_custom_title(tid, t["name"])
        elif tid in crown:
            img = crown[tid]
        else:
            emb = emblem_file_for_pair(t.get("pair") or tid, catalog)
            img = generate_card(t, emb)
        path = OUT / f"title-{tid}.png"
        img.convert("RGBA").save(path, optimize=True)
        print(f"{tid:28s} {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    main()
