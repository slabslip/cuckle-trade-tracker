# CuckleChunckle — Titles and Emblems SDD

Shared barracks. Visual only. Unlocks are computed from tape we already have. Equip is a
profile write. **Where cosmetics paint (Wave 1):** calling card (banner + emblem) on **each
manager's team home** (all four tabs) **and on the Teams list** (blank banner + blank emblem
until that seat equips); equipped **emblem** next to your own seat name;
barracks / Profile plate. Header names, news bylines, trade cards, ledger, and smack stay a
later pass.

Want → [`PRODUCT.md`](./PRODUCT.md). Display chrome → [`UI_SDD.md`](./UI_SDD.md) §3c.
Expanded award review + parked grind list → [`plans/awards_titles_emblems.md`](./plans/awards_titles_emblems.md).

---

## 1. Matched catalog

Everyone chases the same **136 ids** (**68 pairs**). Each award unlocks **both** a wearable
title and a matching emblem (shared `pair` key, same gate). Equip remains **one title** and
**one emblem** at a time — you can mix pairs (Three-Peat title + Blowout emblem).

```text
{ v: 1, as_of, catalog: [{ id, kind, name, how, rarity, pair }], unlocks: { user_id: { id: receipt } } }
```

Emblems with art ship as centered circular PNGs in `data/ui/cosmetics/` (see
`scripts/export-cosmetics-emblems.py`). Championship titles and every other wearable title ship as full-bleed calling-card PNGs at
**1024×180** (~30% shorter than the prior 1024×256 masters) via
`scripts/export-cosmetics-titles.py`. Crown ladder art is cover-fit from
`docs/design/cosmetics/ff-title-banners-spaced-v1.png`; remaining titles get generated cards
(rarity palette + matching emblem when art exists). UI locks `aspect-ratio: 1024 / 180` with
`object-fit: cover`. Emblem marks remain circular PNGs from
`scripts/export-cosmetics-emblems.py`.

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

**Week score bands** — one completed **regular-season** team-week on the written
Sleeper tape (`weekly-scores.mjs` → `weekly_scores.json`). Regular = `week <
playoff_week_start` from Sleeper league settings. Playoff weeks stay on the tape
(`phase: "playoff"`) for a later title/emblem batch and do **not** unlock these
pairs. Comic plate matches Sacko / Champion. A seat unlocks a band when they have
actually scored in that range in the regular season.

| Pair | Gate |
| --- | --- |
| Planetary Disgrace (`week_under40`) | Under 40 |
| Biohazard (`week_40`) | 40–49 |
| Dumpster Fire (`week_50`) | 50–59 |
| Wet Cardboard (`week_60`) | 60–69 |
| Pine Time (`week_70`) | 70–79 |
| Replacement Level (`week_80`) | 80–89 |
| Almost Average (`week_90`) | 90–99 |
| League Average (`week_100`) | 100–109 |
| Slightly Above (`week_110`) | 110–119 |
| Competent (`week_120`) | 120–129 |
| Getting Warm (`week_130`) | 130–139 |
| Heater (`week_140`) | 140–149 |
| Problem (`week_150`) | 150–159 |
| Inferno (`week_160`) | 160–169 |
| Unfair (`week_170`) | 170–179 |
| Demigod (`week_180`) | 180–189 |
| Near Myth (`week_190`) | 190–199 |
| Orbit Breaker (`week_200`) | 200–209 |
| World Breaker (`week_210`) | 210–219 |
| Physics Optional (`week_220`) | 220–229 |
| Sun Eater (`week_230`) | 230–239 |
| Canon Breaker (`week_240`) | 240–249 |
| Statistical Impossibility (`week_250`) | 250–259 |
| Script Error (`week_260`) | 260+ |

Higher career-count crown titles **replace** lower ones (`two_time` does not also unlock
`champion`). Repeat / Three-Peat can sit beside the career-count title. Finalist rungs **stack**.

**Championship ladder is the highest prestige.** Barracks sort weight: Five → Four →
Three-Peat → Three-Time → Repeat → Two-Time → Champion (title and mark together), then
finalists, then the rest by rarity. `four_time` / `five_time` stay locked catalog rows until earned.

Weekly/waiver/lineup grind still parked in
[`plans/awards_titles_emblems.md`](./plans/awards_titles_emblems.md) — week-score bands
unlock from regular-season tape only. Do not invent other weekly grind from
missing waiver / lineup snapshots. Do not mint playoff point-band titles here.

---

## 3. Barracks

`?view=cosmetics` from **Settings → Profile** and Account → **Titles and Emblems**.
Two grids, grouped on one page by unlock neighborhood (Championship, Finish, Title
roster, Trade tape, Draft and wire, Week score). Titles stay a **3-column** picker of
scaled-down full 1024×180 crops — week-score bands wrap together in that grid so the
ladder reads left to right. Tap opens the full card. Emblems stay a 4–5 column mark
grid with the same groups. Equipped plate and detail sheet keep the large crop.
Detail sheet names the matching mate. Equip one title + one emblem.
Persist the signed-in seat's pair at `cuckle.cosmetics.equip.v1.<leagueId>.<seatId>`
(legacy `cuckle.cosmetics.equip.v1` migrates on load), plus a per-league map
`cuckle.cosmetics.equip.by_seat.v1` so other managers' homes can paint offline.
Shared store: `public.seat_cosmetics` (`db/wave18-seat-cosmetics.sql`), same RLS shape as
`seat_avatars` — anyone can read a seat's pair (including Design Mode); only the
claimed seat can write it. **Paste wave18 in the SQL Editor** — the table is not
in the first `schema.sql` paste. Until it exists, Equip stays on that phone and
the rest of the league sees blank Teams cards.

**Show-off (Wave 1):** calling card on every manager's team home and on the **Teams list**
(blank banner + blank emblem until that seat equips), plus the equipped **names**
on the Teams row so the pick is readable without opening the seat; emblem next to
**your** seat name; title on barracks / Profile plate. After a shared load, that
seat's emblem also sits on their Teams row.

No themes, no FAAB perk, no calc boost. Visual only.

---

## 4. Not this file

- Painting titles (and other seats' emblems) on header / news / trade / ledger / smack bylines
  (team home calling card is shipped)
- Art for every new twin / creative pair
- Rarity themes, competitive perks
- Oracle / DNA / weekly / waiver / lineup engines as new unlock sources
- Minting the parked Tier 1–4 weekly grind without a weekly snapshot
