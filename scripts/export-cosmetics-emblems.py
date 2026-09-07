#!/usr/bin/env python3
"""Re-export cosmetics emblem PNGs from the design sheet.

Source: docs/design/cosmetics/ff-emblem-emoji-style-sheet-v2.png
Output: data/ui/cosmetics/emblem-<id>.png (128×128, circular, transparent corners)

Earlier crops were off-center opaque squares; CSS border-radius:50% then clipped
the badge unevenly. This script finds each circular badge on the sheet and writes
a centered transparent mark.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "docs/design/cosmetics/ff-emblem-emoji-style-sheet-v2.png"
OUT = ROOT / "data/ui/cosmetics"
SIZE = 128

# 4×5 grid on the sheet (r4c3 is blank).
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


def main() -> None:
    sheet_img = Image.open(SHEET).convert("RGBA")
    sheet = np.array(sheet_img)
    bg = sheet[2, 2, :3].astype(np.float32)
    diff = np.linalg.norm(sheet[:, :, :3].astype(np.float32) - bg, axis=2)
    OUT.mkdir(parents=True, exist_ok=True)
    for (ri, ci), eid in MAP.items():
        hit = find_circle(diff, XS[ci], YS[ri])
        if hit is None:
            raise SystemExit(f"no circle for {eid}")
        _, cx, cy, r = hit
        path = OUT / f"emblem-{eid}.png"
        export_emblem(sheet_img, cx, cy, r, path)
        a = np.array(Image.open(path))
        ys, xs = np.where(a[:, :, 3] > 128)
        print(
            f"{eid:22s} sheet=({cx:6.1f},{cy:6.1f}) r={r:5.1f} "
            f"alpha_c=({xs.mean():.1f},{ys.mean():.1f})"
        )


if __name__ == "__main__":
    main()
