#!/usr/bin/env python3
"""Re-export crown title banners into a fixed 5:1 frame (840×168).

Source: docs/design/cosmetics/ff-title-banners-spaced-v1.png
Output: data/ui/cosmetics/title-<id>.png

Design sheet bands vary in height; this script letterboxes each design into
the same canvas so barracks / calling cards share one banner shape.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "docs/design/cosmetics/ff-title-banners-spaced-v1.png"
OUT = ROOT / "data/ui/cosmetics"
W, H = 840, 168
PAD = 6
BG = (10, 12, 16, 255)

# Sheet order top → bottom (prestige high → low).
ORDER = [
    "five_time",
    "four_time",
    "three_peat",
    "three_time",
    "repeat",
    "two_time",
    "champion",
]


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


def fit_banner(art: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (W, H), BG)
    max_w, max_h = W - 2 * PAD, H - 2 * PAD
    scale = min(max_w / art.size[0], max_h / art.size[1])
    nw = max(1, int(round(art.size[0] * scale)))
    nh = max(1, int(round(art.size[1] * scale)))
    scaled = art.resize((nw, nh), Image.LANCZOS)
    arr = np.array(scaled.convert("RGBA"))
    arr[:, :, 3] = 255
    scaled = Image.fromarray(arr, "RGBA")
    canvas.paste(scaled, ((W - nw) // 2, (H - nh) // 2))
    return canvas


def main() -> None:
    im = Image.open(SHEET).convert("RGBA")
    a = np.array(im)
    bg = a[5, 5, :3].astype(float)
    diff = np.linalg.norm(a[:, :, :3].astype(float) - bg, axis=2)
    content = diff > 18
    bands = find_bands(content)
    if len(bands) != len(ORDER):
        raise SystemExit(f"expected {len(ORDER)} banner bands, found {len(bands)}")
    OUT.mkdir(parents=True, exist_ok=True)
    for eid, (y0, y1) in zip(ORDER, bands):
        art = tight_crop(im, content, y0, y1)
        out = fit_banner(art)
        path = OUT / f"title-{eid}.png"
        out.save(path, optimize=True)
        print(f"{eid:12s} art={art.size[0]}x{art.size[1]} → {W}x{H}")


if __name__ == "__main__":
    main()
