# CuckleChunckle — Data tab SDD

The league **deal-research terminal**. Visible tab label is **Data**. Internal `homeTab` stays
`history` (`?tab=history` and `?tab=data` both open it).

**This file is the Data law.** UI chrome also lives in [`UI_SDD.md`](./UI_SDD.md). Product
needle / clocks → [`PRODUCT.md`](./PRODUCT.md). Pipeline HAVE → [`ARCHITECTURE.md`](./ARCHITECTURE.md).
Pricing → [`VALUE_SDD.md`](./VALUE_SDD.md). Memory receipts → [`MEMORY_SDD.md`](./MEMORY_SDD.md).

**Priority:** a recent-window direction review on every seat. Managers see who is Hard rebuild,
who is Win-now, what each seat sold, and only get pings both sides will actually take. A hole is
a bag fact. Intent is the review. Career Win-now must never drive a hunt.

---

## 1. Role and split

| Surface | Job | Limit |
| --- | --- | --- |
| **Home Trade Desk** | 1–3 first-person talks (Fill / Move / Even) | Do not dump a 10-team matcher onto Home |
| **Data** | Who to ping + each team's cycle + research overflow | One cell of the five-tab pill. Do not grow a sixth. |
| **Receipts** | “That’s not how I remember it” — Your board (16 kinds, thirteen labeled doors) | Icon + label on the door. Search / filter / list inside. Verdict + number live on the ticket. Not a sixth pill. Law: [`MEMORY_SDD.md`](./MEMORY_SDD.md). |
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
- `DATA_SETS` stays exactly five. Six Data desks live under **More**: Book · Tape · Seats ·
  Lists · Draft · Cuffs. No seventh desk. Cold load is **Moves** and **League**, not the
  27-id catalog. **Your board** (thirteen labeled doors) sits above that
  cold load ([`MEMORY_SDD.md`](MEMORY_SDD.md)). Encyclopedia stays under More.
- Phone-first (390). Existing CSS. No npm / chart libraries.
- Do not fetch cosmetics / dash / block / direction from `render()`.
- This is **this league’s** rosters. Multi-league is the app path, not a new warehouse.

---

## 3. HAVE — panes, hunts, desks, block

### Cold-load panes

[`generate-page.mjs`](../generate-page.mjs):

- **Moves** (internal pane id `ping`) — **Give** (`move_extras`) and **Get**
  (`fill_holes`) only. No Plan slate and no Star section. Sizes are still Dart /
  Cut / Even / Shift / Star (`micro` → `mega`) as a color on each row. The book
  is not one-per-band. Size describes the piece. It does not move a clock or VA.
  Tap a row to price. A row is born only after tape + direction filters pass.
- **League** — ten full-width cycle rows in place order. Name + badge + one-line why. Tap
  opens the team view. Does **not** call `selectMe`.
- **More** — Book · Tape · Lists · Draft · Cuffs · Seats. Research overflow, not the product.

### Catalog (kept, not the cold load)

[`db/wave19-seat-data-dash.sql`](../db/wave19-seat-data-dash.sql):

- Catalog is **32** unique report ids (27 desks + `trade_mark`, `pick_print`,
  `my_picks`, `season_place`, `vs_you`). Persist `seat_data_dash` +
  `cuckle.data.dash.v2.<league>.<seat>` still exists for Your board + hunt routing.
- The 6–13 tile encyclopedia is **not** the Data cold load. Do not put it back on Moves.
  **Your board** (thirteen doors: Trade THEN, Trade NOW, what my pick
  became, My Picks, who won the year, how I finished, me vs them, who has firsts, never
  left, passed around, draft hits, no backup, biggest names) sits on History
  above Moves/League. That is memory law ([`MEMORY_SDD.md`](MEMORY_SDD.md)),
  not the 27-id catalog. Edit persist still uses `seat_data_dash` +
  `cuckle.data.dash.v2.<league>.<seat>`.

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

**League pane** on Data (not a seventh desk). Ten full-width rows in place order. Name,
cycle badge, one-line why. Claimed seat marked. Tap opens the per-team view. Does **not**
call `selectMe` (that is Teams).

**Per-team view** (`dataSeat`):

1. Back to League
2. Name + cycle badge + one-line why
3. Buy / sell / refuse (omit empty). Do not dump last-window sold/got — that duplicates intent.
4. Bag facts vs intent (`thin RB — not shopping RB`)
5. Moves — 1–3 rows that pass both sides’ intent. Empty: `No feasible move with this seat.`
6. Price a deal (A = you, B = them). Optional Open team home via `selectMe`.

**Hunt gates:**

- `move_extras` (Give) and `fill_holes` (Get) are a **color book**, not one
  leftover copied to three tanks, and not a forced one-per-size sampler.
  - **Dart** (`micro`, gray) — late pick / cheap leftover
  - **Cut** (`small`, blue) — clear leftover
  - **Even** (`mid`, gold) — mid-starter, window stays
  - **Shift** (`large`, orange) — aging starter or a 1st
  - **Star** (`mega`, red) — stud / identity piece
- Book peek: up to 8 unique assets, grouped gray → red. Unique seat preferred,
  not required.
- Dart / Cut Give → tanks who buy young or picks.
- Even → Reload / anyone who buys that pos and does not refuse the starter.
- Shift / Star Give of a starter or stud → only if they **buy** that pos. Empty
  `buy[]` is a no. Never ARae RB starter. Refuse still vetoes. A Reload / Win-now
  label is not a free pass on a stud.
- **Tape overlay** (`dataDashMoveOk`, from the claimed seat file + direction):
  1. Never Give a piece back to the seat you received it from.
  2. Never Get a piece back from the seat you sent it to.
  3. A player received in the last 60 days is not on Give.
  4. A stud received in the last 120 days is not on Give.
  5. Direction `studs.in` / `by_pos.in` on you plus `studs.out` / `by_pos.out`
     on them is the same reverse when the seat file is still cold.
  6. Do not Give a Shift/Star into a seat already **deep** at that pos unless
     they buy it.
- Get from a tank is leftover they **sell**, never `they need RB`.
- `block_fits`: same veto on “they need POS.” “On their block · you need POS” stays.
- `stash_young` / picks: prefer Hard rebuild / Rebuild as counterparties.
- `poach_cuffs`: unchanged (insurance, not tank intent).
- Why line never writes `they need RB` on a refuse position.
- Home Move talks: same veto. Still 1–3 cards. Do not change gap / VA / calc numbers.

Moves has no Plan schema on screen. `dataDashPlanImpact` is rank-only for the
per-team 1–3 ideas. It is not a third pane.

---

## 6. Layout (search gone)

No Data top search. Book uses pos / seat / sort dropdowns. Tape already has year chips.
Keep `data-calc-filter` and `data-cuff-q`.

**Data cold load, 390px, top to bottom:**

1. `h2` Data
2. Quiet law: `Votes never enter these numbers.`
3. Three panes: **Moves · League · More**
4. Moves body (Give book + Get book) or League cycle list or More doors.
   League why always lists held 2027s plus a pace caption (short / long / aging
   core / …). Pace describes. It does not move a clock.
5. Hunt page / team view / desk replace the panes when open

No new CSS system. Catalog stays 27. `DATA_SETS` stays 5. Titles are the definition:
Give, Get, Dart, Star, Hard rebuild. Keep explanations to one short line.
Do not write Blow. Do not put a Plan / Star section back on Moves.

---

## 7. Persist and fetch

| Store | Job |
| --- | --- |
| `seat_data_dash` | Private hunt/desk `tiles[]` (kept; not the cold-load UI) |
| `cuckle.data.dash.v2.<league>.<seat>` | Local cache of that list |
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
