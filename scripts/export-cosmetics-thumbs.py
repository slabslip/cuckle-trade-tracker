#!/usr/bin/env python3
"""Build list-sized title thumbs so the barracks grid is not 20MB of 1024×180 PNGs.

Each title-<id>.png → title-<id>-sm.jpg at 384×68 (same 1024:180 crop, flattened
on the barracks card ground). The equipped plate and detail sheet keep the PNG.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/ui/cosmetics"
COS = ROOT / "data/ui/cosmetics.json"
# 384/68 ≈ 5.65, within a hair of 1024/180. Fits a 3-col phone tile at 2–3×.
THUMB_W, THUMB_H = 384, 68
GROUND = (10, 12, 16)  # -- #0a0c10


def write_title_thumb(src: Path, dest: Path) -> int:
    im = Image.open(src).convert("RGBA")
    im = im.resize((THUMB_W, THUMB_H), Image.Resampling.LANCZOS)
    ground = Image.new("RGB", (THUMB_W, THUMB_H), GROUND)
    ground.paste(im, mask=im.split()[-1])
    dest.parent.mkdir(parents=True, exist_ok=True)
    ground.save(dest, "JPEG", quality=80, optimize=True)
    return dest.stat().st_size


def main() -> None:
    book = json.loads(COS.read_text())
    titles = [c for c in (book.get("catalog") or []) if c.get("kind") == "title"]
    if not titles:
        raise SystemExit("no titles in cosmetics.json")
    total = 0
    for t in titles:
        tid = t["id"]
        src = OUT / f"title-{tid}.png"
        if not src.exists():
            raise SystemExit(f"missing {src.name}")
        dest = OUT / f"title-{tid}-sm.jpg"
        total += write_title_thumb(src, dest)
        print(f"{tid:28s} {dest.name} {dest.stat().st_size}")
    print(f"thumbs {len(titles)} files {total} bytes")


if __name__ == "__main__":
    main()
