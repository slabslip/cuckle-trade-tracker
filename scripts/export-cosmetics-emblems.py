#!/usr/bin/env python3
"""Export cosmetics emblem PNGs.

Comic masters (preferred): docs/design/cosmetics/emblems-comic-v1/<id>-master.png
  → data/ui/cosmetics/emblem-<id>.png (128×128 circular, transparent corners)

Legacy sheet fallback (only for ids without a comic master):
  docs/design/cosmetics/ff-emblem-emoji-style-sheet-v2.png

Re-running this script will NOT overwrite comic masters with sheet crops.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "docs/design/cosmetics/ff-emblem-emoji-style-sheet-v2.png"
COMIC_DIR = ROOT / "docs/design/cosmetics/emblems-comic-v1"
COS = ROOT / "data/ui/cosmetics.json"
OUT = ROOT / "data/ui/cosmetics"
SIZE = 128

# 4×5 grid on the legacy sheet (r4c3 is blank).
MAP = {
    (0, 0): "points_champ",
    (0, 1): "bracket_thief",
    (0, 2): "three_time_finalist",
    (0, 3): "two_time_finalist",
    (1, 0): "finalist",
    (1, 1): "last_place",
    (1, 2): "iron_core",
    (1, 3): "volume",
    (2, 0): "whale",
    (2, 1): "extractor",
    (2, 2): "firsts_merchant",
    (2, 3): "playoff_trader",
    (3, 0): "quiet_year",
    (3, 1): "manners",
    (3, 2): "draft_hit",
    (3, 3): "sit_right",
    (4, 0): "bench_crime",
    (4, 1): "waiver_touch",
    (4, 2): "opening_day",
}
XS = [144, 380, 618, 852]
YS = [115, 310, 505, 700, 895]


def find_circle(diff: np.ndarray, cx0: float, cy0: float, search: int = 25):
    h, w = diff.shape
    y0, y1 = max(0, int(cy0) - 150), min(h, int(cy0) + 150)
    x0, x1 = max(0, int(cx0) - 150), min(w, int(cx0) + 150)
    content = diff[y0:y1, x0:x1] > 12
    p = np.pad(content, 1, constant_values=False)
    edge = content & ~(p[:-2, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:] & p[2:, 1:-1])
    ey, ex = np.where(edge)
    if len(ex) < 40:
        return None
    ex = ex.astype(np.float64) + x0
    ey = ey.astype(np.float64) + y0
    best = None
    for dy in range(-search, search + 1):
        for dx in range(-search, search + 1):
            cx, cy = cx0 + dx, cy0 + dy
            d = np.sqrt((ex - cx) ** 2 + (ey - cy) ** 2)
            cand = d[(d >= 85) & (d <= 120)]
            if len(cand) < 40:
                continue
            r = float(np.median(cand))
            inl = np.abs(d - r) < 2.5
            ang = np.arctan2(ey[inl] - cy, ex[inl] - cx)
            hist, _ = np.histogram(ang, bins=12, range=(-np.pi, np.pi))
            coverage = int((hist > 2).sum())
            score = float(inl.sum()) + 5 * coverage - abs(r - 105) * 0.5
            if best is None or score > best[0]:
                best = (score, cx, cy, r)
    return best


def export_emblem(sheet_img: Image.Image, cx: float, cy: float, r: float, path: Path) -> None:
    w, h = sheet_img.size
    r_use = r * 0.992
    scale = 3
    s = SIZE * scale
    out_r = s / 2 - 3 * scale
    mid = (s - 1) / 2
    k = r_use / out_r
    pad = int(np.ceil(r_use + 4))
    box = (
        int(round(cx)) - pad,
        int(round(cy)) - pad,
        int(round(cx)) + pad,
        int(round(cy)) + pad,
    )
    crop = Image.new("RGBA", (pad * 2, pad * 2), (0, 0, 0, 0))
    src = sheet_img.crop((max(0, box[0]), max(0, box[1]), min(w, box[2]), min(h, box[3])))
    arr = np.array(src.convert("RGBA"))
    arr[:, :, 3] = 255
    crop.paste(Image.fromarray(arr, "RGBA"), (max(0, -box[0]), max(0, -box[1])))
    lcx = pad + (cx - int(round(cx)))
    lcy = pad + (cy - int(round(cy)))
    yy, xx = np.mgrid[0:s, 0:s]
    sx = lcx + (xx - mid) * k
    sy = lcy + (yy - mid) * k
    crop_a = np.array(crop).astype(np.float32)
    ch, cw = crop_a.shape[:2]
    x0 = np.clip(np.floor(sx).astype(np.int32), 0, cw - 1)
    y0 = np.clip(np.floor(sy).astype(np.int32), 0, ch - 1)
    x1 = np.clip(x0 + 1, 0, cw - 1)
    y1 = np.clip(y0 + 1, 0, ch - 1)
    wx = sx - np.floor(sx)
    wy = sy - np.floor(sy)
    valid = (sx >= 0) & (sx < cw - 1) & (sy >= 0) & (sy < ch - 1)
    out = np.zeros((s, s, 4), dtype=np.float32)
    for c in range(4):
        ia = crop_a[y0, x0, c]
        ib = crop_a[y0, x1, c]
        ic = crop_a[y1, x0, c]
        id_ = crop_a[y1, x1, c]
        top = ia * (1 - wx) + ib * wx
        bot = ic * (1 - wx) + id_ * wx
        out[:, :, c] = top * (1 - wy) + bot * wy
    out[~valid, :3] = 0
    out[~valid, 3] = 0
    out[valid, 3] = 255
    dist = np.sqrt((xx - mid) ** 2 + (yy - mid) ** 2)
    soft = 1.25 * scale
    alpha = np.clip((out_r + soft * 0.25 - dist) / soft * 255, 0, 255)
    out[:, :, 3] = np.minimum(out[:, :, 3], alpha)
    Image.fromarray(out.astype(np.uint8), "RGBA").resize((SIZE, SIZE), Image.LANCZOS).save(
        path, optimize=True
    )


def export_comic_master(master: Path, dest: Path) -> None:
    """Center-square crop → 128 circular badge with comic ring."""
    im = Image.open(master).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    sq = im.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse((1, 1, SIZE - 2, SIZE - 2), fill=255)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(sq, (0, 0))
    out.putalpha(mask)
    ring = ImageDraw.Draw(out)
    ring.ellipse((2, 2, SIZE - 3, SIZE - 3), outline=(20, 12, 8, 220), width=3)
    ring.ellipse((6, 6, SIZE - 7, SIZE - 7), outline=(255, 230, 90, 160), width=2)
    out.save(dest, optimize=True)


def main() -> None:
    book = json.loads(COS.read_text())
    emblem_ids = [c["id"] for c in (book.get("catalog") or []) if c.get("kind") == "emblem"]
    if not emblem_ids:
        raise SystemExit("no emblems in cosmetics.json")

    OUT.mkdir(parents=True, exist_ok=True)
    comic_done: set[str] = set()

    for eid in emblem_ids:
        master = COMIC_DIR / f"{eid}-master.png"
        if master.exists():
            export_comic_master(master, OUT / f"emblem-{eid}.png")
            comic_done.add(eid)
            print(f"{eid:28s} comic-master")

    # Legacy sheet only for ids still missing a comic master
    need_sheet = [eid for eid in emblem_ids if eid not in comic_done and eid in MAP.values()]
    if need_sheet:
        sheet_img = Image.open(SHEET).convert("RGBA")
        sheet = np.array(sheet_img)
        bg = sheet[2, 2, :3].astype(np.float32)
        diff = np.linalg.norm(sheet[:, :, :3].astype(np.float32) - bg, axis=2)
        id_to_cell = {eid: cell for cell, eid in MAP.items()}
        for eid in need_sheet:
            ri, ci = id_to_cell[eid]
            hit = find_circle(diff, XS[ci], YS[ri])
            if hit is None:
                raise SystemExit(f"no circle for {eid}")
            _, cx, cy, r = hit
            export_emblem(sheet_img, cx, cy, r, OUT / f"emblem-{eid}.png")
            print(f"{eid:28s} sheet-fallback")

    missing = [eid for eid in emblem_ids if not (OUT / f"emblem-{eid}.png").exists()]
    if missing:
        raise SystemExit(f"missing emblem art after export: {missing}")

    # Barracks / mark thumbs — full 128 PNG stays for plate crispness when needed.
    for eid in emblem_ids:
        src = OUT / f"emblem-{eid}.png"
        dest = OUT / f"emblem-{eid}-thumb.webp"
        im = Image.open(src).convert("RGBA")
        im.resize((64, 64), Image.Resampling.LANCZOS).save(
            dest, "WEBP", quality=82, method=6
        )
        print(f"{eid:28s} thumb 64x64")


if __name__ == "__main__":
    main()
