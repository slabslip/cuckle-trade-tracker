# CuckleChunckle — Data tab SDD

The league **deal-research terminal**. Visible tab label is **Data**. Internal `homeTab` stays
`history` (`?tab=history` and `?tab=data` both open it).

**This file is the Data law.** UI chrome also lives in [`UI_SDD.md`](./UI_SDD.md). Product
needle / clocks → [`PRODUCT.md`](./PRODUCT.md). Pipeline HAVE → [`ARCHITECTURE.md`](./ARCHITECTURE.md).
Pricing → [`VALUE_SDD.md`](./VALUE_SDD.md).

**Priority:** a recent-window direction review on every seat. Managers see who is Hard rebuild,
who is Win-now, what each seat sold, and only get pings both sides will actually take. A hole is
a bag fact. Intent is the review. Career Win-now must never drive a hunt.

---

## 1. Role and split

| Surface | Job | Limit |
| --- | --- | --- |
| **Home Trade Desk** | 1–3 first-person talks (Fill / Move / Even) | Do not dump a 10-team matcher onto Home |
| **Data** | League scan + direction + block + research desks | Four top tabs only. No fifth tab. |
| **Calculator** | The price | Hunt / block / team-view row opens calc: A = you, B = them, legs prefilled when the piece is known |

Data is not standings, luck, H2H, a chart product, or a personal bag-total page.

---

## 2. Laws

- Style labels (Win-now / Investor / Balanced / Rebuild / Hard rebuild) **describe**. They do
  **not** move a clock, a delta, VA, or `calcValueNum`.
- Career tape `style.label` must never drive hunts or numbers. ARae’s career label is still
  Win-now. That is a lie about 2026.
- **Hole vs intent.** A hole is a bag fact (`thin RB`). Intent is the direction review
  (`not shopping RB`). Copy may state a fact. Hunts and Home Move may only propose a buy/sell
  that intent allows.
- Votes never enter the book.
- No bag totals on Home. `homeDeskHtml` must not contain `calcFmt(` or `calcValueNum(`.
- No Best 10 / Worst 10. Most lopsided stays on Data.
- `DATA_SETS` stays exactly five. Six Data desks only: Book · Tape · Seats · Lists · Draft ·
  Cuffs. No seventh chip. Overview is the board, not a chip.
- Phone-first (390). Existing CSS. No npm / chart libraries.
- Do not fetch cosmetics / dash / block / direction from `render()`.
- This is **this league’s** rosters. Multi-league is the app path, not a new warehouse.

---

## 3. HAVE — desks, board, hunts, block

### Desks and board

[`generate-page.mjs`](../generate-page.mjs), [`db/wave19-seat-data-dash.sql`](../db/wave19-seat-data-dash.sql):

- Six desk chips, always on: Book · Tape · Seats · Lists · Draft · Cuffs.
- 6–12 private tiles. Persist `seat_data_dash` + `cuckle.data.dash.v1.<league>.<seat>`.
  Signed-out / no seat: default 12, Edit disabled.
- Catalog is **27** unique report ids. A report may appear on the board once.
- Edit: swap / add / remove / reorder. Presets **Deal** (default) and **Research** write the
  same `tiles[]`. Library groups: Deal · Cuffs · Book · Tape · Seats · Lists.

**Banned ids:** `best10`, `worst10`, `bag_total`, `realized`, `win_now`, `investor`.

**Dropped from catalog (facts stay on desks):** `tape_count`, `book_asof`, `tape_year`,
`seat_volume`.

**Deal default 12:** `fill_holes` (label: **Who has what you need**), `move_extras`,
`poach_cuffs`, `available_cuffs`, `uninsured`, `stash_young`, `draft_board`, `held_picks`,
`book_top`, `lopsided`, `seat_run`, `cuffs_board`.

**Research preset 12:** `firsts_held`, `uninsured`, `widest_clock`, `passed_around`,
`homesteaders`, `draft_board`, `cuffs_board`, `lopsided`, `seat_run`, `least_traded`,
`forever`, `past_champions`.

### Hunts

Named jobs, not stats. Peek = 3 rows (player · team · why). Tap = full-screen hunt. Row opens
calc first-person. Empty = one sentence. No bag totals on tiles.

Need engine: `homeDeskProfile` holes / thin / surplus / deep from the live bag (`DESK_STUD`
5500, `DESK_START` 2200, `DESK_MID` 1800, `DESK_SLOTS` QB2/RB2/WR3/TE1). Route from the bag
may still caption Trade Desk. It must not override the direction veto.

### Trade block

[`db/wave20-seat-trade-block.sql`](../db/wave20-seat-trade-block.sql):

- `seat_trade_block` (`sleeper_league_id`, `seat_user_id`, `asset_ids` cap 8).
- League members read all; owner writes own. Listing does not change value.
- Tiles: `my_block`, `league_block`, `block_fits`.
- Load/save next to `seat_data_dash`, not inside `render()`. Do not infer a block from tape
  volume.

### Desks that stay research

- **Book** — extractable catalog; as-of in the hint; pos / seat / sort chips.
- **Tape** — deals; year chips; deal count on the desk.
- **Seats** — ten-row mark charts.
- **Lists** — five `DATA_SETS` + Past Champions.
- **Draft** — held firsts / pick intel.
- **Cuffs** — starter → NFL backup → owner.

---

## 4. Direction review

[`build-seat-direction.mjs`](../build-seat-direction.mjs) writes
[`data/ui/seat-direction.json`](../data/ui/seat-direction.json) after the book exists.
Inputs: `trade_legs.json`, `trades.json`, `calculator.json`, `members.json`.

Do not hang labels on `members.json`. Do not reuse `league.traders.style.label`. Missing JSON
→ every seat **Reload** (hunts degrade to geometry, never crash).

**Window:** last completed season + this season + current offseason (today: 2024, 2025, 2026).

**Two-year memory for sold positions:** if last year or the year before was bottom-four **or**
sold ≥2 at a position, keep that position on `sold_pos`.

**Count (not prices):**

- `place`, `place_season`
- Live `pick_share` / `stud_share` (same cuts as `homeDeskProfile`)
- Current `holes` / `thin` as **facts**
- Picks in/out, firsts in/out, **2027+** picks in/out
- Players in/out by QB / RB / WR / TE
- Studs in/out by position. Ignore round-trips of the same player (Walker out then in is churn)

**Hard rebuild — need 2+ votes:**

1. Place 8–10
2. Live pick share at least 0.30
3. Net 2027+ picks at least +2
4. Sold a stud at a position and did not buy a stud back at that position

**Labels** (captions only):

- **Hard rebuild** — 2+ votes
- **Rebuild** — pick share at least 0.28 or net-sold 2+ studs, not Hard
- **Win-now** — place 1–4, pick share at most 0.22, no net stud sell
- **Reload** — everyone else

**Intent lists** from the label + `sold_pos`:

- Hard rebuild / Rebuild: **buy** picks and young; **sell** leftover at sold-down positions;
  **refuse** starters at those positions
- Win-now: **buy** current holes/thin; **sell** picks they will actually move
- Reload: buy/sell only where both geometry and recent flow agree

**JSON shape** (`v: 1`):

```text
{
  asof, window: [2024, 2025, 2026],
  seats: [{
    seat_user_id, name, place, place_season, label, votes[], why,
    pick_share, holes[], thin[], sold_pos[],
    buy[], sell[], refuse[],
    picks: { in, out, firsts_in, firsts_out, net_2027_plus },
    by_pos: { RB: { in[], out[] }, ... },
    studs: { in[], out[] }
  }]
}
```

**Fixtures (this league, 2024–2026 window):**

- **ARae** (`458004578168729600`, place 9) — Hard rebuild. Sold Bijan. +7 on 2027. Pick share
  ~0.39. Thin RB is a fact. Buy picks/young. Sell leftovers. Refuse RB starters. Never write
  `they need RB` for ARae.
- **ChiefGumby** (8) — Hard rebuild (pick share ~0.33, +2027s).
- **SF69erss** (1) — Win-now or Reload. Champ. Must **not** be Hard rebuild.
- **TrumanCooper** (5) — Reload, not a tank.

Generate asserts: exactly 10 seats; ARae is Hard rebuild; ARae `refuse` includes RB starters.

---

## 5. Surfaces

One JSON feeds three surfaces.

**Direction strip** on Data cold load (not a seventh desk). Ten chips in place order,
horizontal scroll like `.data-rooms`. Name + label. Claimed seat marked. Tap opens the
per-team view. Does **not** call `selectMe` (that is Teams).

**Per-team view** (`dataSeat`):

1. Back to Data
2. Name, label, one-line why
3. Last-window sold / got by position
4. Buy / sell / refuse
5. Bag facts vs intent (`thin RB — not shopping RB`)
6. Smart moves for you vs them — 1–3 rows that pass both sides’ intent. Empty:
   `No feasible ping with this seat.`
7. Price a deal (A = you, B = them). Optional Open team home via `selectMe`.

**Hunt gates:**

- `move_extras`: ping them only if their **buy** list includes that position. A tank does not
  buy RB. They may appear as **takes your picks**.
- `fill_holes`: they appear as a source only if their **sell** list includes that position.
- `block_fits`: same veto on “they need POS.” “On their block · you need POS” stays.
- `stash_young` / picks: prefer Hard rebuild / Rebuild as counterparties.
- `poach_cuffs`: unchanged (insurance, not tank intent).
- Why line never writes `they need RB` on a refuse position.
- Home Move talks: same veto. Still 1–3 cards. Do not change gap / VA / calc numbers.

---

## 6. Layout (search gone)

No Data top search. Book already has pos / seat / sort chips. Tape already has year chips.
Keep `data-calc-filter` and `data-cuff-q`.

**Data cold load, 390px, top to bottom:**

1. `h2` Data
2. Short sub: `Votes never enter these numbers.`
3. Direction strip (ten seats)
4. Six desk chips + Edit
5. Deal hunt board (6–12 tiles, gated)
6. Hunt page / team view / list drill replace the board when open

No new CSS system. Catalog stays 27. `DATA_SETS` stays 5.

---

## 7. Persist and fetch

| Store | Job |
| --- | --- |
| `seat_data_dash` | Private board `tiles[]` (6–12) |
| `cuckle.data.dash.v1.<league>.<seat>` | Local cache of the board |
| `seat_trade_block` | League-readable listings, owner-write, cap 8 |
| `data/ui/seat-direction.json` | Build artifact; all seats; loaded in `loadMembers`, not `render()` |

---

## 8. CUT / later

- Seventh top tab or seventh Data desk
- Sixth `DATA_SETS`
- Best 10 / Worst 10, bag totals on Home, chart npm
- Career Win-now / Investor moving a number
- Inferring a block from tape volume
- `same_offense` stack graph (later, roster × `players.nfl.json`)
- Shared / league-default boards, drag-and-drop, pizza/radar cards
- Multi-league search as a new warehouse
