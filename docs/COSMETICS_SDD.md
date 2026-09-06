# CuckleChunckle — Titles and Emblems SDD

Shared barracks. Visual only. Unlocks are computed from tape we already have. Equip is a
profile write. **Where an equipped title or emblem paints** (header, news byline, trade cards,
ledger, smack) is a later pass — this file does not unlock new chrome.

Want → [`PRODUCT.md`](./PRODUCT.md). Display chrome → [`UI_SDD.md`](./UI_SDD.md) §3c.
Expanded award review + parked grind list → [`plans/awards_titles_emblems.md`](./plans/awards_titles_emblems.md).

---

## 1. One catalog

Everyone chases the same 27 ids. Each id is one cosmetic: a short title string plus a mark.
`kind` is `title` or `emblem` — **not both**. Flavor writeups that pair an “emblem name” with a
wearable title are copy for one card, not two catalog rows. Emblems v1 are initials / simple
marks in existing CSS — not an art pack. Swap art later without changing ids.

Catalog + computed unlocks: `data/ui/cosmetics.json` from `build-cosmetics.mjs` (after
`title-path.mjs`). Inputs: `titles.json`, `league.json` `traders`, `marks.json`, `members.json`.

```text
{ v: 1, as_of, catalog: [{ id, kind, name, how, rarity }], unlocks: { user_id: { id: receipt } } }
```

`how` is the locked requirement (“Win three championships”). The unlock string is the receipt
(“ARae — 2019, 2020, 2021”). Unlocks are **not** a junction table.

---

## 2. First 27 (from tape)

**Crown ladder** (highest first) — Eternal Champion (`five_time`, locked until 5), Dynasty
Immortal (`four_time`, locked until 4), Three-Peat, Dynasty Established (`three_time`, three
career titles), Back-to-Back, Two-Time Champion (**exactly** two), Champion.

**Other crown** — Points Champ, Bracket Thief, Finalist, Last Place, Iron Core
(`from_opening / n >= 0.85`).

**Tape** — Volume, Whale, Extractor, Win-Now, Investor, Firsts Merchant, Playoff Trader,
Quiet Year.

**Marks / sit / dunks** — Manners, Draft Hit, Sit Right, Bench Crime, Waiver Touch,
Opening Day Champ (`from_opening >= 11`), Founding Draft (2019 startup pick, later a title).

ARae’s three titles unlock **Dynasty Established** for the pool; only he has it until someone
else gets there. Treat that rung as elite — current league ceiling. Two-Time does not stack on
Three-Time. Repeat (consecutive) can sit next to Two-Time.

**Championship ladder is the highest prestige in the system.** Barracks sort and nameplate
weight: Five-Time → Four-Time → Three-Peat → Three-Time → Repeat → Two-Time → Champion, then
every other title/emblem. `four_time` and `five_time` ship as **locked catalog rows** (Eternal
Champion / Dynasty Immortal). Do not write unlock receipts until someone wins 4 / 5.

Later weekly/waiver/lineup awards (onboarding grind, streaks, pick collector, etc.) are listed
in [`plans/awards_titles_emblems.md`](./plans/awards_titles_emblems.md). They wait on tape we
do not have. Do not mint a 70-id second catalog from that list.

---

## 3. Barracks

`?view=cosmetics` from Account → **Titles and Emblems**. Two grids. Championship titles first
(see ladder above), then the rest by rarity. Tap locked → requirement. Tap unlocked → receipt
+ Equip / unequip. Equip **one title** and **one emblem** at a time.

Persist the equipped pair on the signed-in profile. This pass: `localStorage` key
`cuckle.cosmetics.equip.v1`. Same pattern as votes: page reads, profile writes. Supabase columns
on the account row are the later shared store.

No themes, no FAAB perk, no calc boost. Visual only.

---

## 4. Not this file

- Painting equipped cosmetics on names across the app (beyond the signed-in seat, if that
  Home pass has landed)
- Art pack, rarity themes, competitive perks
- Oracle / DNA / weekly / waiver / lineup engines as new unlock sources
- Minting the parked Tier 1–4 and “fresh 15” awards without a weekly snapshot
