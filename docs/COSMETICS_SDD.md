# CuckleChunckle — Titles and Emblems SDD

Shared barracks. Visual only. Unlocks are computed from tape we already have. Equip is a
profile write. **Where an equipped title or emblem paints** (header, news byline, trade cards,
ledger, smack) is a later pass — this file does not unlock new chrome.

Want → [`PRODUCT.md`](./PRODUCT.md). Display chrome → [`UI_SDD.md`](./UI_SDD.md) §3c.

---

## 1. One catalog

Everyone chases the same 25 ids. Each id is one cosmetic: a short title string plus a mark.
`kind` is `title` or `emblem`. Emblems v1 are initials / simple marks in existing CSS — not a
25-asset art pack. Swap art later without changing ids.

Catalog + computed unlocks: `data/ui/cosmetics.json` from `build-cosmetics.mjs` (after
`title-path.mjs`). Inputs: `titles.json`, `league.json` `traders`, `marks.json`, `members.json`.

```text
{ v: 1, as_of, catalog: [{ id, kind, name, how, rarity }], unlocks: { user_id: { id: receipt } } }
```

`how` is the locked requirement (“Win three championships”). The unlock string is the receipt
(“ARae — 2019, 2020, 2021”). Unlocks are **not** a junction table.

---

## 2. First 25 (from tape)

**Crown** — Champion, Repeat, Three-Peat, Three-Time Champion (three career titles), Two-Time
Champion (**exactly** two), Points Champ, Bracket Thief, Finalist, Last Place, Iron Core
(`from_opening / n >= 0.85`).

**Tape** — Volume, Whale, Extractor, Win-Now, Investor, Firsts Merchant, Playoff Trader,
Quiet Year.

**Marks / sit / dunks** — Manners, Draft Hit, Sit Right, Bench Crime, Waiver Touch,
Opening Day Champ (`from_opening >= 11`), Founding Draft (2019 startup pick, later a title).

ARae’s three titles unlock **Three-Time Champion** for the pool; only he has it until someone
else gets there. Two-Time does not stack on Three-Time.

Later triggers (week bombs, FAAB, streaks) reuse these ids. Do not mint a second catalog.

---

## 3. Barracks

`?view=cosmetics` from Account → **Titles and Emblems**. Two grids. Tap locked → requirement.
Tap unlocked → receipt + Equip / unequip. Equip **one title** and **one emblem** at a time.

Persist the equipped pair on the signed-in profile. This pass: `localStorage` key
`cuckle.cosmetics.equip.v1`. Same pattern as votes: page reads, profile writes. Supabase columns
on the account row are the later shared store.

No themes, no FAAB perk, no calc boost. Visual only.

---

## 4. Not this file

- Painting equipped cosmetics on names across the app
- Art pack, rarity themes, competitive perks
- Oracle / DNA / weekly engines as new unlock sources
