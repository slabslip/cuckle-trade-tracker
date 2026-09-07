#!/usr/bin/env python3
"""Build barracks grid thumbs from full cosmetics art.

Full title cards are 1024×180 (~450KB PNG each). The Titles and Emblems list
renders them in a 3-col postage-stamp grid, so shipping full files forces
~20MB of downloads on open. Emblem marks are smaller but still oversized for
a 40px cell.

Output (next to the full art in data/ui/cosmetics/):
  title-<id>-thumb.webp   — 320×56 WebP (~10KB)
  emblem-<id>-thumb.webp  — 64×64 WebP (~3–4KB)

Plate / detail sheet keep the full PNG. Re-run after export-cosmetics-*.py.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/ui/cosmetics"
COS = ROOT / "data/ui/cosmetics.json"

TITLE_W = 320
EMBLEM_SIZE = 64
WEBP_QUALITY = 82


def title_thumb(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGBA")
    w = TITLE_W
    h = max(1, round(im.size[1] * w / im.size[0]))
    th = im.resize((w, h), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    th.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)


def emblem_thumb(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGBA")
    th = im.resize((EMBLEM_SIZE, EMBLEM_SIZE), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    th.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)


def main() -> None:
    book = json.loads(COS.read_text())
    catalog = book.get("catalog") or []
    titles = [c["id"] for c in catalog if c.get("kind") == "title"]
    emblems = [c["id"] for c in catalog if c.get("kind") == "emblem"]
    if not titles or not emblems:
        raise SystemExit("cosmetics.json missing titles/emblems")

    missing: list[str] = []
    title_bytes = 0
    emblem_bytes = 0

    for tid in titles:
        src = OUT / f"title-{tid}.png"
        dest = OUT / f"title-{tid}-thumb.webp"
        if not src.exists():
            missing.append(str(src))
            continue
        title_thumb(src, dest)
        title_bytes += dest.stat().st_size
        print(f"title  {tid:28s} -> {dest.name} ({dest.stat().st_size}b)")

    for eid in emblems:
        src = OUT / f"emblem-{eid}.png"
        dest = OUT / f"emblem-{eid}-thumb.webp"
        if not src.exists():
            missing.append(str(src))
            continue
        emblem_thumb(src, dest)
        emblem_bytes += dest.stat().st_size
        print(f"emblem {eid:28s} -> {dest.name} ({dest.stat().st_size}b)")

    if missing:
        raise SystemExit(f"missing full art for thumbs: {missing}")

    print(
        f"thumbs ok: {len(titles)} titles ({title_bytes}b), "
        f"{len(emblems)} emblems ({emblem_bytes}b)"
    )


if __name__ == "__main__":
    main()
