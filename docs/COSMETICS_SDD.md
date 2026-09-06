# CuckleChunckle — Titles and Emblems SDD

Shared barracks. Visual only. Unlocks are computed from tape we already have. Equip is a
profile write. **Where an equipped title paints across every name** (header, news byline,
trade cards, ledger, smack) is a later pass — Wave 1 paints the equipped **emblem** next to
your own seat name only, plus the calling card on barracks and Profile.

Want → [`PRODUCT.md`](./PRODUCT.md). Display chrome → [`UI_SDD.md`](./UI_SDD.md) §3c.
Expanded award review + parked grind list → [`plans/awards_titles_emblems.md`](./plans/awards_titles_emblems.md).

---

## 1. One catalog

Everyone chases the same 29 ids. Each id is one cosmetic: a short title string or a mark.
`kind` is `title` or `emblem` — **not both**. Flavor writeups that pair an “emblem name” with a
wearable title are copy for one card, not two catalog rows. Emblems ship as flat PNG marks in
`data/ui/cosmetics/`; championship titles ship as thin COD-style banners. Text fallbacks cover
ids without art yet (`win_now`, `investor`, `founding_draft`).

Catalog + computed unlocks: `data/ui/cosmetics.json` from `build-cosmetics.mjs` (after
`title-path.mjs`). Inputs: `titles.json`, `league.json` `traders`, `marks.json`, `members.json`.

```text
{ v: 1, as_of, catalog: [{ id, kind, name, how, rarity }], unlocks: { user_id: { id: receipt } } }
```

`how` is the locked requirement (“Win three championships”). The unlock string is the receipt
(“ARae — 2019, 2020, 2021”). Unlocks are **not** a junction table.

---

## 2. Catalog (from tape)

**Crown ladder** (highest first) — Eternal Champion (`five_time`, locked until 5), Dynasty
Immortal (`four_time`, locked until 4), Three-Peat, Dynasty Established (`three_time`, three
career titles), Back-to-Back, Two-Time Champion (**exactly** two), Champion.

**Other crown (emblems)** — Points Champ, Bracket Thief, Three-Time Finalist, Two-Time Finalist,
Finalist (lost the championship game 3 / 2 / 1 times), Last Place, Iron Core
(`from_opening / n >= 0.85`). Wear these beside a championship **title**.

**Tape** — Volume, Whale, Extractor, Win-Now, Investor, Firsts Merchant, Playoff Trader,
Quiet Year.

**Marks / sit / dunks** — Manners, Draft Hit, Sit Right, Bench Crime, Waiver Touch,
Opening Day Champ (`from_opening >= 11`), Founding Draft (2019 startup pick, later a title).

ARae’s three titles unlock **Dynasty Established** for the pool; only he has it until someone
else gets there. Treat that rung as elite — current league ceiling. Higher career-count titles
**replace** lower ones (`two_time` does not also unlock `champion`). Repeat (consecutive) can
sit next to Two-Time / Three-Time.

**Championship ladder is the highest prestige in the system.** Barracks sort and nameplate
weight: Five-Time → Four-Time → Three-Peat → Three-Time → Repeat → Two-Time → Champion, then
every other title/emblem. `four_time` and `five_time` ship as **locked catalog rows** (Eternal
Champion / Dynasty Immortal). Do not write unlock receipts until someone wins 4 / 5.

Later weekly/waiver/lineup awards (onboarding grind, streaks, pick collector, etc.) are listed
in [`plans/awards_titles_emblems.md`](./plans/awards_titles_emblems.md). They wait on tape we
do not have. Do not mint a 70-id second catalog from that list.

---

## 3. Barracks

`?view=cosmetics` from **Settings → Profile** (gear) and from Account → **Titles and Emblems**.
Two grids. Championship titles first (see ladder above), then the rest by rarity. Tap locked
→ requirement. Tap unlocked → receipt + Equip / unequip. Equip **one title** and **one emblem**
at a time. Back from barracks returns to Profile when opened from Settings, Account otherwise.

Persist the equipped pair on the signed-in profile. This pass: `localStorage` key
`cuckle.cosmetics.equip.v1.<leagueId>.<seatId>` (legacy unscoped key migrates once). Load
re-validates unlocks and catalog kind. Supabase columns on the account row are the later shared
store.

**Show-off (Wave 1):** equipped emblem paints next to **your** seat name wherever `seatLabel`
runs. Equipped title shows on the barracks calling card and the Profile mini-plate — not yet on
every byline. No themes, no FAAB perk, no calc boost. Visual only.

---

## 4. Not this file

- Painting equipped **titles** (and other seats' emblems) on names across the app
- Rarity themes, competitive perks
- Oracle / DNA / weekly / waiver / lineup engines as new unlock sources
- Minting the parked Tier 1–4 and “fresh 15” awards without a weekly snapshot
