# CuckleChunckle — Titles and Emblems SDD

Shared barracks. Visual only. Unlocks are computed from tape we already have. Equip is a
profile write. **Where an equipped title paints across every name** (header, news byline,
trade cards, ledger, smack) is a later pass — Wave 1 paints the equipped **emblem** next to
your own seat name only, plus the calling card on barracks and Profile.

Want → [`PRODUCT.md`](./PRODUCT.md). Display chrome → [`UI_SDD.md`](./UI_SDD.md) §3c.
Expanded award review + parked grind list → [`plans/awards_titles_emblems.md`](./plans/awards_titles_emblems.md).

---

## 1. Matched catalog

Everyone chases the same **88 ids** (**44 pairs**). Each award unlocks **both** a wearable
title and a matching emblem (shared `pair` key, same gate). Equip remains **one title** and
**one emblem** at a time — you can mix pairs (Three-Peat title + Blowout emblem).

```text
{ v: 1, as_of, catalog: [{ id, kind, name, how, rarity, pair }], unlocks: { user_id: { id: receipt } } }
```

Emblems with art ship as centered circular PNGs in `data/ui/cosmetics/` (see
`scripts/export-cosmetics-emblems.py`). Championship crown titles ship as COD-style banners.
Text / empty-circle fallbacks cover ids without art yet (new pairs, twin marks, `win_now`,
`investor`, `founding_draft`, …).

Catalog + unlocks: `data/ui/cosmetics.json` from `build-cosmetics.mjs` (after `title-path.mjs`).
Inputs: `titles.json`, `league.json` (`traders`, `drafters_rookie`), `marks.json`,
`members.json`, `picks.json`.

`how` is the locked requirement. The unlock string is the receipt. Unlocks are **not** a
junction table — granting a pair writes both ids.

---

## 2. Catalog (from tape)

**Crown ladder** (highest first, title + `_mark` emblem twin) — Eternal Champion /
Five Crowns (`five_time`), Dynasty Immortal / Four Crowns, Three-Peat / Three-Peat Seal,
Dynasty Established / Triple Crown, Back-to-Back / Repeat Seal, Two-Time / Double Crown,
Champion / Champ Ring.

**Finalists** — Runner-Up ↔ Finalist, Two-Time / Three-Time Bridesmaid ↔ matching emblems.

**How you won / roster** — Points Champion, Bracket Bandit, Iron Core, Opening Day, Sit Right,
Bench Crime, Sacko (last place) — each with a matching emblem.

**Tape / marks** — Volume, Whale, Extractor, Win-Now, Investor, Firsts Merchant, Playoff
Trader, Quiet Year, Manners, Draft Hit, Waiver Touch, Founding Draft — each paired.

**Creative 15 (new pairs, varying difficulty)**

| Pair | Gate (short) | Difficulty |
| --- | --- | --- |
| Blowout | Chip margin ≥ 40 | medium |
| Nail-Biter | Chip margin ≤ 10 | medium |
| Table Climber | Prior place ≥ 5 then chip | medium |
| Loyalty | ≥90% prior core in title lineup | medium–hard |
| Scorched Earth | Title-path `new_share` ≥ 55% | medium |
| Pick Collector | ≥4 future firsts held | medium |
| Rookie Whisperer | Lead rookie-draft surplus | hard (1 seat) |
| Trade Cartel | ≥7 partners in one title window | easy–medium |
| Wire Throne | ≥12 waiver adds in one title window | medium |
| Pick Path | `pick_heavy` window on title path | easy–medium |
| Player Path | `player_heavy` regular on title path | easy |
| Aging Gracefully | Lead aging-grade mean | hard |
| Sold the Farm | Lead players sold for picks | hard |
| Inaugural Champion | Win 2019 | locked to history |
| Perfect Chip | 1st in points + margin ≥ 25 | hard |

Higher career-count crown titles **replace** lower ones (`two_time` does not also unlock
`champion`). Repeat / Three-Peat can sit beside the career-count title. Finalist rungs **stack**.

**Championship ladder is the highest prestige.** Barracks sort weight: Five → Four →
Three-Peat → Three-Time → Repeat → Two-Time → Champion (title and mark together), then
finalists, then the rest by rarity. `four_time` / `five_time` stay locked catalog rows until earned.

Weekly/waiver/lineup grind still parked in
[`plans/awards_titles_emblems.md`](./plans/awards_titles_emblems.md) — do not invent unlocks
from missing weekly snapshots.

---

## 3. Barracks

`?view=cosmetics` from **Settings → Profile** and Account → **Titles and Emblems**.
Two grids. Detail sheet names the matching mate. Equip one title + one emblem.
Persist: `cuckle.cosmetics.equip.v1.<leagueId>.<seatId>`.

**Show-off (Wave 1):** equipped emblem on **your** seat name; title on barracks / Profile plate.

---

## 4. Not this file

- Painting titles (and other seats' emblems) on every byline
- Art for every new twin / creative pair
- Rarity themes, competitive perks
- Weekly / waiver / lineup engines as new unlock sources
