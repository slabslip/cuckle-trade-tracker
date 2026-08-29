# CuckleChunckle — Dashboard Audit & Strategy Review

Audit date **2026-08-29**. Live build `DATA_V = 20260829j`, `main` at the today-blend commit.
Method: four passes — UI code read (`generate-page.mjs`), data integrity scripts over `data/ui/**`,
live click-through on iPhone and desktop, and docs-vs-shipped drift.

**Reviewing UI changes at phone width:** open `preview.html` (deployed at
`https://slabslip.github.io/cuckle-trade-tracker/preview.html`, or locally at
`http://localhost:8766/preview.html`). It frames the real dashboard at 375 / 390 / 402 / 430
and rotates. Cursor's browser has no device presets, so this is the only reliable phone view.
Design Mode cannot select through an iframe — for that, open `index.html` directly and edit
`generate-page.mjs`, never the generated `index.html`.

This file is **findings only**. It is the input to the next SDD pass, not the SDD.
Where this file and `docs/UI_SDD.md` disagree about what exists, **this file is HAVE**.

---

## 1. What we have shipped so far (review)

| Slice | State | Notes |
| --- | --- | --- |
| Even-flatten book (DP Superflex `value_2qb`) | Live | `FLAT_SCALE=10000`, `FLAT_EXP=0.3`, `FLAT_TOP_MIX=0.5`. Untouched. |
| Five named clocks | Live | `t0`, `y1`, `y2`, `y3`, `all` via one "Score as" dropdown. |
| Value Adjustment (VA) | Live | 0.15 rate, damp, **extras capped at 3**, **late 4th = 0.5**. |
| Today = 40% flatten + 60% KTC | Live | Today clock only. Windows stay flatten. |
| Retired → 0 on today | Live | Not on KTC Superflex + no NFL team, plus an explicit set. |
| Weekly KTC snaps | Live | `data/ktc/YYYY-MM-DD.json`, first snap 2026-08-28. |
| Champions Path | Live | `?view=titles`, separate product — correctly outside needle math. |
| Home gold cards + Most lopsided | Live | Replaced Best/Worst aged on league home. |

The value system is in good shape. **The dashboard around it is not.** The defects below are
almost all presentation and plumbing, not pricing.

---

## 2. P0 defects — wrong numbers on screen

Each of these was reproduced with a script against the committed data.

### P0-1 — "Include startup picks" flips the Drafts headline sign
`pickDelta` returns early for startup picks with the **raw player value** instead of a surplus
(`generate-page.mjs:1226`), and `pickRow:1241` blanks the cost column. But startup picks
**do** carry `pick_cost` — 28 of 28 for SF69erss — and the pipeline already ships a correct
`surplus` (Stefon Diggs: cost 3,096, today 2,896, surplus −200).

Observed live on SF69erss's Drafts tab:

| Drafts header | Shown |
| --- | ---: |
| Rookie only | **−18 / pick · 27 graded** (red) |
| Tick "Include startup picks" | **962 / pick · 54 graded** (green) |

One checkbox turns a losing draft record into a winning one and inflates the magnitude ~50×.
The startup rows that appear show **"—"** in the right-hand cost column, so the figure has no
visible denominator — while every other row in the tab means "surplus" in that position.
*Fix:* `if (p.startup) return displayDelta(pickGot(p), p.pick_cost)` and stop blanking the cost.
Generator-only.

### P0-2 — `node build.mjs` does not reproduce the deployed site
`build.mjs` runs five scripts: `sleeper-sync`, `draft-resolve`, `value-snapshot`, `revalue`,
`generate-page`. It does **not** run `apply-value-adjust.mjs` (which is what actually patched the
committed UI JSON with the today blend and VA, because `value_curve.json` is absent from this
checkout) or `title-path.mjs` (which writes `titles.json`). Both `README.md` and
`docs/TRACKER_SDD.md` present `node build.mjs` as *the* rebuild.

Live evidence the two paths are already out of step: `titles.json.as_of` is `2026-08-29` while
`league.today` is `2026-08-28`. Worse, `revalue.mjs` and `apply-value-adjust.mjs` **both** build
`trade_boards`, `hero.even_*`, `partners[].even_*` and `partner_headlines` by independent code
paths, so which one ran last silently determines what the site shows.
*Fix:* one canonical build list; delete the duplicate boards builder. Pipeline-only.

### P0-3 — Third-party bags hide their Value Adjustment
`tradeBags` passes five arguments to `bagBlock` for the two primary bags (`:1137-1138`) but only
**four** for every other party's bag (`:1142`) — `va` is omitted. `bagBlock` therefore prints no
Value Adjustment line while the header total it prints already contains VA.

Measured: 12 third-party bags exist in the data; **4 carry non-zero invisible VA**. Trade
`1277511518384037888` shows a TrumanCooper bag whose legs sum to 12,248 under a header reading
12,960 — 712 unexplained. Third-party bags also never pass through `applyVa`, so they trust the
committed value while the primary bags recompute.
*Fix:* pass `side.value_adjust`; route the side through `applyVa`. Generator-only.

### P0-4 — The manners tile and the Partners tab disagree on 1 partner in 4
`marksOf` reads the committed `p.grade` (`:920`), which the pipeline derives from the **today**
clock. The Partners tab recomputes the grade from the **selected lens** (`:1470`).
Measured against lens `all`: **20 of 82 partner grades disagree.** Both screens carry a
"Score as" control, so the home tile renders a today-clock verdict under a Since-trade heading.
*Fix:* one `partnerPer(seat, name, lens)` helper; delete or explicitly label the stored grade.
Both.

### P0-5 — 31 rostered NFL players are valued at zero
`isRetired` returns `noTeam || tinyRaw || tinyFlat` (`price-today.mjs:118`). Because the
conditions are OR'd, the `tinyFlat <= 1200` branch zeroes any player under that flatten value
**even when he has a live NFL team**.

Measured: of 124 assets zeroed on today, **31 have a current NFL team** — 108 leg instances,
**22,324 flatten points** erased. Examples: Mason Rudolph (QB, PIT) ×10 legs, Andy Dalton (QB, PHI) ×6,
Trey Sermon (RB, ATL) ×6, Austin Hooper (TE, ATL) ×4, Van Jefferson (WR, WAS) ×4,
Tyler Conklin (TE, DET), Kyle Trask (QB, CAR), Jarrett Stidham (QB, DEN).

These are cheap (flatten 761–1137, raw DP roughly 3–20), so this is **not** the raw-300 floor the
product canon forbids — it is a much lower cut. But "a rostered backup QB is worth exactly 0" is
still a claim the book should not be making, and it is invisible on screen.
*Fix:* require `noTeam && (tinyRaw || tinyFlat)`, or drop `tinyFlat` and lean on the explicit
retired set plus the KTC-board test. Pipeline-only.

### P0-6 — Value Adjustment breaks zero-sum on 3-team trades
VA is computed per seat against **that seat's own counter-bag**. In an N-way trade those bags do
not mirror, so the adjustments never cancel.

Measured: the two 3-team trades sum to **+397.39** and **+26.70** instead of 0, and the
league-wide sum of every fully-observed `today_delta` is **+424.09** — exactly those two numbers.
Two-team zero-sum remains perfect (0 breaks across 288 pairs), so this is specifically the N-way case.
*Fix:* define VA for N-way trades against the union of the other bags, or exclude N-way trades
from VA and say so. Pipeline; product decision first.

### P0-7 — The Trades tab scores trades on clocks they have not lived
`renderTrades` never filters by `chipLived` (`:1279`). On the `y3` lens a two-week-old trade
renders a "First 3 years" number built from a single snapshot, while Home's tiles exclude exactly
those trades via `windowTotal` → `chipLived`. `livedHint` — the function written to disclose this —
is only ever called from Drafts (`:1372`), where `lens` is pinned to `all`, so its disclosure
branch is unreachable.
*Fix:* filter with `chipLived` and print `livedHint` above the list. Generator-only.

---

## 2b. P1 defects (confirmed, with line numbers)

### P1-1 — Shareable links are broken; `?me=` is written but never read
`syncUrl()` (`generate-page.mjs:497`) writes `?me=<name>&view=trades&t=<tx>&lens=<lens>` on every render.
Boot only reads `lens`, `title`, `view` (`:391`, `:456-457`). **`me` and `t` are never read.**
Because `render()` forces `view = "home"` when there is no `me` (`:1489`), reloading or sharing
any manager URL silently lands on **league home**.
*Fix:* on boot, resolve `me` by name or id, then honour `t`. Generator-only.

### P1-2 — "Most lopsided trades" silently hides the last 12 months on the default lens
`rankWide()` (`:634`) gates rows with `windowLived(r.date)`, but `windowLived` maps
`all → 1 year` (`:624`). `chipLived()` (`:599`) deliberately returns `true` for `t0`/`all`;
`rankWide` bypasses it. **124 of 576 sides are excluded** on the default Since-trade lens,
including everything from 2025-08-29 onward. The trades list shows those same deals.
*Fix:* use `chipLived` in `rankWide`. Generator-only.

### P1-3 — The middle margin number is always green
`tradeRow` (`:1163`), `boardTape` (`:658`) and `pickRow` (`:1249`) hardcode
`midCls = "pos"` for any non-zero delta. A deal you lost by 7,292 renders its margin in
the same green as one you won. Direction is carried only by the `←` / `→` glyph, while the
left/right **names** are correctly red/green — so one row shows two different colour languages.
*Fix:* `cls(dlt)` for the middle, or make the middle deliberately neutral everywhere. Generator-only.

### P1-4 — Home partner teaser and the Partners tab compute different numbers
`renderTeamHome` (`:1095-1105`) builds its own per-partner mean from `tradeDelta`.
`renderPartners` (`:1464`) builds another from `windowPer` with a different filter (`!t.incomplete`).
Same partner, same lens, two code paths — they can disagree. `data.partners[].even_per_trade`
from the pipeline is a **third** number, now unused on both screens.
*Fix:* one `partnerPer(seat, name, lens)` helper, used by both. Generator-only.

### P1-5 — Null year-ends plot as zero
`spark()` (`:397`) uses `p[k] || 0`. A missing year-end draws a line to the floor, which reads as
"this asset went to zero" rather than "no snapshot". Already flagged as later-slice item 6 in
`UI_SDD.md`; still shipped.
*Fix:* skip the point or break the path. Generator-only.

### P1-6 — Raw data is interpolated into HTML with no escaping
Every render concatenates Sleeper-supplied strings into markup (`l.label`, `p.mine`, `r.name`,
`p.player`, champion `thesis`). A display name or player label containing `<` executes.
The apostrophe hazard is handled; angle brackets are not.
*Fix:* one `esc()` on every data interpolation. Generator-only.

### P1-7 — Tapping a style tile downloads the whole league
`markChart` → `Promise.all(members.map(seatData))` (`:1591`) fetches all ten seat files,
**~7.4 MB of JSON**, to draw one bar chart. On a phone that is the single most expensive
interaction in the app.
*Fix:* ship a small precomputed `marks.json` (10 rows × 6 metrics), or lazy-load on demand
with a skeleton. Pipeline + generator.

### P1-8 — Browser back does not work
`syncUrl` only ever calls `history.replaceState` (`:504`). There is no `pushState` and no
`popstate` listener, so back leaves the app entirely from any depth.
*Fix:* push on view/seat/trade change, restore on `popstate`. Generator-only.

### P1-9 — A receiver-only side shows a total that contradicts its own legs
`applyToSide` (`value-adjust.mjs:68`) only refreshes `today` / `sent_today` / `today_delta`
when **both** sides have priced legs:

```
const pricedGot = priced(side.legs).length;
const pricedSent = priced(side.sent).length;
if (pricedGot && pricedSent) { side.today = bag + gotVa; ... }
```

On a 3-team trade where a seat receives and sends nothing, `pricedSent === 0`, so the legs are
repriced by the today blend but the totals keep the **old flatten sum**.
Live example — tx `916914658962112512` (2023-01-06, SF69erss with ARae and TrumanCooper):
the bag header reads **3,091** while its single line item (2023 2nd → Zach Charbonnet) reads
**3,185**. The stale `today_delta` then feeds the league boards and that seat's per-trade mean.
The browser's `applyVa` returns early on the same condition (`generate-page.mjs:547`), so the UI
repeats the staleness rather than catching it.

Widening the check to include `incomplete` sides finds **5 affected sides across 3 transactions**.
The worst is tx `567502131945091072` / TipsUp: the bag header reads **1,692** while **every one of
its legs prices at 0** (Kenny Golladay, and a 2nd that became Kadarius Toney). A completely
worthless bag is presented as a 1,692 asset.

The rule is structurally missing rather than a one-off: every future one-way, receiver-only, or
incomplete side inherits it, and any change to the today book widens the gap.
*Fix:* recompute totals whenever **either** side has priced legs; treat the empty side as 0 and
say "sent nothing" rather than `0` (already listed as `UI_SDD.md` later-slice item 11). Pipeline + generator.

### P1-10 — `aged` subtracts two different price books
`sides[].aged` is `even.today_delta − even.t0_delta`, but `today_delta` is now the **40/60 KTC
blend** while `t0_delta` comes from the **flatten-only** `windows.t0`. The number therefore
measures the pricing model as much as the passage of time.

Measured across all 576 sides: mean absolute difference between shipped `aged` and a
same-book `windows.all.delta − windows.t0.delta` is **1,025**. Both sides of the trade dated
`2026-08-29` — zero elapsed time — report `aged` of ±25.

Live impact is currently **nil**, because the only screen that displayed `aged` is the
unreachable board screen (§3). It is latent, and it is in the data.
*Fix:* compute `aged` from one book, or ship a flatten `today_delta_flat` for it. Pipeline-only.

### P1-11 — Filter state leaks across seats
`clearLeague` (`:481`) resets `me`, `data`, `view`, `openId`, `partnerName`, `openPick`,
`openDraft`, `markOpen`, `titleYear` — but **not** `year`, `lens`, `draftSort`, `draftRounds`,
`draftStartup`, or `openPacks`. Pick 2019 in one seat's Trades, go home, pick a different seat:
its Trades tab is filtered to a season it may not have, the filter dot stays lit, no checkbox
reads as checked, and there is no "no trades in 2019" copy — just an empty list.
*Fix:* reset filters in `clearLeague`, and add empty-state copy. Generator-only.

### P1-12 — `history.replaceState` fires on every render
`render` (`:1506`) calls `syncUrl` unconditionally and `syncUrl` (`:504`) calls `replaceState`,
so every accordion toggle is a history write. Safari throttles around 100 calls per 30 s and
begins dropping them with a console warning; opening trade rows quickly reaches that.
*Fix:* only sync when a URL-bearing piece of state actually changed. Generator-only.

### P1-13 — Name collisions silently skip the KTC blend — **FIXED 2026-08-29**
Shipped in `main` at `fdec099`. `nflNameIndex` now ranks candidates (Superflex position +8,
on a roster +4, active +2, higher id as tiebreak) instead of taking the first id, and `ktcValue`
gained the KTC name-index fallback. 22 legs across 4 assets corrected, no zero flips.
Also closes a latent hole at the top of the book: `Josh Allen` matches the Buffalo QB and a
Jacksonville linebacker, both active and rostered — previously resolved correctly only by id order.
Original finding below.

`nflNameIndex` (`price-today.mjs:62`) keeps the **first** id per normalized name across 11,836
Sleeper players; **357 names collide**, and the first id is often a retired namesake. Legs that
resolve by name — became-pick legs, which have no `player:{id}` key — therefore look up the wrong
player, miss KTC, and quietly fall back to flatten-only.

Measured: **4 names, 22 leg instances**:

| Became | Resolves to | Should be | Shown | Should be |
| --- | --- | --- | ---: | ---: |
| Kenneth Walker | 4634, WR, no team, inactive | 8151, RB, KC | 5,186 | ~5,500 |
| Antonio Williams | 7203, no team, inactive | 13301, WAS | 2,984 | ~2,884 |
| Kyle Williams | 94, DT, no team, inactive | 12547, NE | 1,989 | ~2,099 |
| Kaleb Johnson | 2967, G, no team, inactive | 12504, RB, PIT | 1,675 | ~1,800 |

Each miss is only a few hundred points, but note how close this sits to a much worse failure:
these players are saved from `isRetired` only because KTC's *name* index happens to list them.
A spelling difference there and a rostered starter would price at **0**.
*Fix:* prefer the active/rostered id on collision, and give `ktcValue` the same name-index
fallback `isRetired` already uses. Pipeline-only.

### P1-14 — Attribute injection, not just element injection
Extending §P1-6: unescaped data also lands **inside attribute values** —
`data-partner="` (`:884`, `:1471`), `data-who="` (`:476`), `data-title="`. A Sleeper display name
containing a double quote breaks out of the attribute, which is a second injection vector and
also silently breaks the click handlers that read those datasets.
*Fix:* the same `esc()`, applied to attributes as well as text. Generator-only.

---

## 3. Dead code and dead payload

### Dead UI: the entire league board screen is unreachable
`renderLeague()` (`:1391`), `renderTradeBoards()` (`:1437`), `rankSides()` (`:1422`) and
`monthsAgo()` (`:1413`) implement Best 10 / Worst 10 with an As-of-today vs Aged toggle and
3m/6m/1y/3y/all window chips. The only buttons that set `view = "league"` live **inside**
`renderTradeBoards` (`:1596`, `:1598`), and `render()` rewrites `view = "league"` back to
`"home"` in both branches (`:1489-1490`). **Nothing can reach it.**
Also dead: `boardClock`, `boardWindow`, `draftTab` (`:371`, set at `:1660`, never read),
and the `y1/y2/y3/t0` branches of `pickWindowEnd` (`:1206`) because `renderDrafts` pins
`lens = "all"` (`:1339-1340`, restored at `:1387`).

### Dead payload — measured

Per-seat files (10 seats, **7.4 MB** total):

| Key | Bytes | Read by UI? |
| --- | ---: | --- |
| `trades[].other_bags` | 3,061,704 | Only when `others.length > 1`. **85 of 87** Truman trades are 2-team and still ship them. |
| `trades[].windows` | 2,090,852 | Yes — but `legs`+`sent` are 1,462,347 of it, five near-duplicate leg lists per trade. |
| `trades[].even` | 467,286 | Yes (fallback). |
| `trades[].realized` | 450,030 | **No.** `sideOf` (`:540`) only falls back past `windows[lens]` **and** `even`. |
| `recent_trades` | 509,423 | **No.** Not referenced anywhere. |
| `trades[].year_ends` | 162,612 | **No.** `tradeBags` prefers `even_year_ends` (`:1145`), same size. |
| `partner_headlines` | 2,239 | **No.** |
| `legs[].drafted_by` | 14,410 | **No.** |
| `legs[].value_flat` | 7,364 | **No** (pipeline-only). |
| `hero` | 4,037 | Only `hero.two_way`. |
| `style` | 1,320 | Only the two `sold_*` counts. |

`league.json` (**717 KB**):

| Key | Bytes | Read by UI? |
| --- | ---: | --- |
| `trade_boards.sides` | 524,596 | Yes — `rankWide`, `daySides`. |
| `review_trades` | 141,587 | **No.** |
| `trade_boards.today` / `.aged` | 39,224 | **No** (only the dead board screen). |
| `drafters_rookie` / `drafters_startup` | 5,010 | **No** (only the dead board screen). |

**Roughly 4.2 MB of 7.4 MB in seat files and 185 KB of 717 KB in `league.json` is never read.**
Restructuring `windows` to one leg list plus five values per trade saves ~1.2 MB more.
That is a **~70% payload cut** with no visible change.

---

## 2c. Live reproduction

Five defects were re-tested by clicking the deployed site (desktop, `DATA_V=20260829j`).
All five reproduce:

| Test | Result |
| --- | --- |
| Select TrumanCooper → trades → reload that exact URL (`?me=TrumanCooper&view=trades`) | **Lands on league home.** Team picker resets to "Team". (P1-1) |
| Drafts → tick "Include startup picks" | Header goes **−18 → 962 / pick**; startup rows show "—" as their cost. (P0-1) |
| Trades rows, won vs lost | Middle number is **green in both cases** — `−364`, `−24`, `−169`, `−732` losses all render a green middle. (P1-3) |
| League home → Most lopsided trades, default Since-trade lens | Dates run 2019-09-16 … **2024-02-13**. Nothing from the last 12 months, while the gold card above it shows a 2026-08-29 trade. (P1-2) |
| Expand a trade → click a player name | **Row collapses.** Drag-selecting the text does not collapse it, so the defect is specifically the click target. (A1) |

An earlier automated pass over the same screens reported "zero defects, production-ready".
It tested deep links with a **fake** id (`?me=999999999`), saw the fallback to league home, and
recorded that as graceful error handling — the fallback *is* the bug, and real ids hit it too.
Worth remembering when reading any clean bill of health: verify the specific claim, not the mood.

---

## 3b. Data integrity — what passed

Scripted over all 10 seats, 586 trade sides, recomputing from legs with the live modules:

| Invariant | Result |
| --- | --- |
| Stored VA matches `value-adjust.mjs` recompute (cap 3, half 4ths) | **0 stale** across all sides and windows |
| Stored today values match `price-today.mjs` recompute (retired 0, 40/60) | **0 stale** across all legs |
| `today_delta == today − sent_today` | 0 violations |
| Zero-sum on complete **2-team** trades | 0 breaks across 288 pairs |
| Cross-seat mirroring (legs, dates, flags) | exact on all pairs |
| Both seats present for every 2-team trade | 288 of 288 |
| Non-finite / NaN / out-of-range values | 0 |
| `titles.json` and `members.json` consistency | clean |
| `today == sum(priced legs) + value_adjust` | **5 violations** (§P1-9) |
| Zero-sum on **3-team** trades | **2 of 2 broken** (§P0-6) |

**Leg-level pricing is sound — the wrappers are not.** Every value the book computes for an
individual asset is correct and current: no stale VA, no stale blends, no drift. What fails is
what surrounds the legs — totals on degenerate sides (§P1-9), VA on N-way trades (§P0-6),
the retired test over-reaching onto rostered players (§P0-5), and the name join silently
skipping KTC (§P1-13).

One latent aggregate is also wrong: `realized_total` / `realized_per_trade` describe a book that
is no longer in the file — up to ~37,000 off, with sign flips on four seats (ChiefGumby stored
−10,092 against an actual +14,688). It is harmless **only** because the UI never reads it, which
is exactly the kind of field §3 recommends deleting rather than repairing.

---

## 4. Inconsistencies that should be identical

1. **Margin colour** — names use `cls(delta)`, middle uses hardcoded `pos` (§P1-3).
2. **Posture vocabulary** — Champions Path says "Bought players" (`postureLab`, `:766`);
   manager home says "Buys players" (`marksOf`, `:917`). Same concept, two labels.
3. **Partner grade threshold ±100** — implemented three times: `partnerLine` (`:883`),
   `renderPartners` (`:1470`), and the pipeline's `partnerGrade` (`apply-value-adjust.mjs:30`).
   The stored `grade` field is then ignored by both screens.
4. **Two "today" clocks** — `dayAlert` uses the browser clock (`tapeDay()`, `:1039`), everything
   else uses `league.today` (`:624`). Data already contains a side dated `2026-08-29` while
   `league.today` is `2026-08-28`, so the two disagree in production right now.
5. **VA computed twice** — pipeline `value-adjust.mjs` bakes it into the JSON; the browser
   recomputes it in `applyVa` (`:543`). They agree today (verified: cap 3, `pieceWeight`,
   equal-length early return, damp). Nothing keeps them in sync but discipline.
6. **Guard style** — `data.trades.map` unguarded in `renderTrades` (`:1278`) and
   `data.trades.filter` in `renderPartners` (`:1480`), versus `(data.trades || [])` elsewhere.
   `t.others.length` is read without a guard in both partner paths.
7. **Delta rounding** — `displayDelta` rounds each side before subtracting (deliberate, commented).
   `rankSides` (dead) sorted on raw unrounded `today_delta`. Keep one rule when boards return.

---

## 5. Redundant information

1. **The league ticker duplicates every pack.** `leagueBubbles` (`:705`) emits Most passed around,
   Least traded, Forever players, Homesteader — each of which is also a pack directly below it.
   It also pushes **two** Forever bubbles: a count and then the first name (`:723-724`).
2. **The ticker DOM is emitted twice** (`row + row`, `:747`) for the marquee loop, so screen
   readers read the whole feed twice.
3. **Every Champions Path row is labelled "1st"** (`:871`) — a constant in a column that
   otherwise carries information.
4. **A trade's delta appears twice** when a row is open: in the collapsed header and again
   as the difference of the two bag totals. Acceptable, but the bag totals are the ones
   carrying VA, so the header should be the derived one, not a parallel computation.
5. **Home shows Best deal / Worst deal / Partners / Draft** which are the first rows of the
   Trades / Partners / Drafts tabs. Fine as teasers — but Best/Worst are recomputed from a
   full sort of all trades on every render rather than reusing the tab's own ordering.

---

## 6. Edge cases and error handling

- `selectMe` (`:507`) and `seatData` (`:643`) have **no `catch`**. A failed seat fetch leaves the
  app half-rendered with no message. Only `loadMembers` has a fallback (`:1700`).
- Rapid seat switching races (`UI_SDD.md` later-slice item 4, still open): two `selectMe` calls
  resolve in arbitrary order, last write wins.
- `chapterHtml` reads `ch.picks_in.length` and `ch.picks_out.length` unguarded (`:797-798`) —
  a title window missing those arrays throws.
- Unknown `?view=` falls through to `renderLeagueHome` (`:1503`) — graceful. Unknown `?lens=`
  is validated (`:392`) — good. Unknown `?title=` renders the list — good.
- Year filter uses **checkboxes that behave as radios** (`:1292`); only one year can be active,
  and unchecking sets `all`. Wrong control semantics for both mouse and screen reader.
- Incomplete handling is sound: `applyVa` returns early (`:544`), bags show `no DP row`,
  totals show `—`. Verified in the pipeline self-checks.

---

## 6b. Render cost

Every render rebuilds `app.innerHTML` wholesale and recomputes VA from legs for every row.
Benchmarked with the shipped inline implementation:

| Render | `applyVa` calls | ms (desktop V8) |
| --- | ---: | ---: |
| `renderTeamHome` + `teamMarks` | ~2,000 | ~9 |
| `markChart` (10 seats) | ~1,160 | ~5 |
| `renderPartners` | ~710 | ~2 |

Multiply by five to eight on a phone. The cost is structural, not algorithmic bad luck:
`renderTeamHome` (`:1091`) calls `tradeDelta` **inside a sort comparator**, `renderPartners`
(`:1468`) calls `perOf` twice per comparison and again in the `.map`, and `rankWide` (`:638`)
calls `windowScore` inside both the dedupe and the sort. Each `applyVa` compiles regexes and
spreads two `Math.max` calls.
*Fix:* memoize by `(transaction_id, lens)` and sort on precomputed keys.

`DATA_V` is also a hand-edited string literal (`:361`), so cache correctness depends on a human
bumping a letter in the same commit as a data rebuild. With a 600 s CDN cache, a forgotten bump
serves stale data with no signal. Derive it from `league.today` or a content hash at generate time.

---

## 6c. Accessibility and mobile

| # | Sev | Issue |
| --- | --- | --- |
| A1 | P1 | **Interactive controls nested inside buttons.** `tradeRow` (`:1164`) and `pickRow` (`:1266`) place the expanded `.detail` — containing clickable `.leg[data-pick]` divs (`:437`) — *inside* the `<button>`. Invalid HTML; the hop toggles have no role, tabindex, or key handler. Any tap inside an open row that misses a `data-pick` bubbles to `.row[data-id]` (`:1668`) and **collapses the row**, so you cannot even select text in an expanded trade. |
| A2 | P1 | **No keyboard support anywhere.** Not one `keydown` handler, `tabindex`, `Escape` handler, or focus call in 1,710 lines. `render` replaces `app.innerHTML` wholesale, destroying focus — expanding trade #40 returns focus to `<body>`. |
| A3 | P1 | **`aria-expanded` only on two of five expandables.** `pack` (`:687`) and `mark` (`:906`) set it; `tradeRow`, `pickRow`, and `boardTape` — the three primary accordions — set nothing. None use `aria-controls`. |
| A4 | P1 | **Broken listbox and non-tabs.** `#whoMenu` has `role="listbox"` (`:342`) but its children are plain buttons with no `role="option"`/`aria-selected`; no arrow keys, no Escape, no focus move or restore. The four tabs (`:1494`) have no `role="tablist"`/`tab`/`aria-selected` and the panel no `role="tabpanel"` — while `#yearFilters` *does* carry `role="group" aria-label`, so the pattern exists unevenly. |
| A5 | P1 | **Sub-44px targets in a file that enforces 44px elsewhere.** `.who-menu button` **28px** (`:72`) — the seat picker, the most-used control in the app; `#yearFilters label` **26px** (`:308`); `button.who` **36px** (`:56`); `.score-btn` **36px** (`:247`). |
| A6 | P2 | **Auto-scrolling marquee with no pause control** (`.ticker-track`, 48 s loop, `:134`). `prefers-reduced-motion` is respected (`:139`) but that is not a substitute for a control. |
| A7 | **P1** | **Grid overflow clips real numbers at true phone width.** `.row-top.tape` is `1fr auto 1fr` (`:96`) and `.names` has no `min-width: 0` or ellipsis. Reproduced in `preview.html` at 390px with a desktop scrollbar present (375px usable): the trade row for BubbaCuckShremp rendered its value as **"8,96"** and DarkWingDucks2023 as **"3,0"** — the figures the whole product exists to show, truncated. At a full 390px the numbers fit but `DarkWingDucks2023` sits flush against the edge, one character from clipping. Any longer display name, or a user with larger text, clips. `overflow-x: hidden` (`:22`) then hides the evidence. |
| A7b | P2 | **The four nav tabs wrap onto two lines at 390px** (`home trades partners` / `drafts`), which reads as a rendering accident rather than a layout. Reproduced in `preview.html`. |
| A7c | **P1** | **The brand header overflows the viewport at 390px.** The "Team" seat picker's right edge measures **410px** on a 390px viewport, so the most-used control in the app hangs off the screen. `overflow-x: hidden` on `html, body` hides the evidence rather than fixing it, and `button.who` already caps at `min(158px, calc(100vw - 120px))`, so the overflow is coming from the flex row (`h1.brand` with `overflow: visible`), not the button's own width. Measured on `main` before and after an unrelated change, so it is pre-existing and not a regression. |
| A8 | P2 | **Three colour languages in one Drafts row.** `pickRow` colours the player's name by pick surplus (`:1268`), the origin label by own-vs-acquired (`:1271`), and the middle number always green (`:1249`). A red player name reads as "bad player", not "the pick underperformed". |
| — | — | **Contrast is fine.** `--muted` 6.59:1, `--dim` 5.38:1, `--red` 4.91:1, `--green` 10.41:1, gold 9.46:1 — all clear AA. Safe-area handling and `viewport-fit=cover` are correct. |

Also dead CSS: `.hero` / `.hero b` (`:91`) is never emitted — the original product promise of one
big number survives only as a stylesheet rule. Plus `a.back`, `.day-scroller`, `.day-chip`,
`.draft-head`, `.filter-hint`.

---

## 7. Docs drift (what the SDD says vs what ships)

`docs/UI_SDD.md` is materially out of date:

- It specifies **three lens chips** ("Became the player", "Pick at trade day", "First 3 years").
  We ship **five windows in a dropdown** (`t0`, `y1`, `y2`, `y3`, `all`).
- It specifies a **`league` tab** and a Home **hero number** (`realized_per_trade`).
  Neither exists: tabs are `home/trades/partners/drafts`, and home leads with six style tiles.
- It predates Champions Path, the gold alert row, Most lopsided trades, VA, the KTC blend,
  and retired→0.
- `PRODUCT.md` still lists "Today (default)" as flatten-only became-player; today is now a
  40/60 KTC blend with retired→0.
- Later-slice items 1 (`other_bags`), 4 (`?me=` race), 6 (spark `|| 0`), 7 (row-in-button a11y),
  9 (duplicate pricing) are **all still open** and all confirmed above.

---

## 8. Strategy review

**What is working.** The value spine is coherent: one book, five named clocks, never averaged,
VA as an explicit bag-level line rather than a hidden fudge, and a today clock that now tracks
market consensus without contaminating history. The KTC blend cut mean error against KTC from
2,005 (raw DP) to ~223 on blended names. Champions Path stays cleanly out of the needle.

**What is drifting.** Three things, in order of cost:

1. **The UI has outgrown its spec.** Home became a six-tile personality panel; the league board
   screen was replaced by packs and then left in the codebase, unreachable. There is no longer a
   single "your score" number anywhere, which was the original product promise. Decide whether
   that promise is retired or restored — do not leave it ambiguous.
2. **The same number is computed in two places on purpose.** VA in the pipeline and in the
   browser; partner means in the pipeline, on home, and on the partners tab; grade thresholds in
   three files. Every one of these is a future "the site says two different things" bug.
   The browser should either recompute everything from legs (and the pipeline stops shipping
   derived fields) or recompute nothing (and the pipeline ships one row per lens).
3. **Payload is ~3× what it needs to be**, mostly `other_bags` the UI refuses to render and five
   copies of every leg list. This is the cheapest large win available.

**The decision that unblocks the SDD:** *where does derived value live?* Everything above is a
symptom of that one unanswered question. Recommendation — **pipeline owns all arithmetic**,
ships one flat row per trade per lens (delta, got, sent, VA, and a single leg list with five
values), and the browser only formats. That kills §P1-4, §P1-7, most of §4, and ~70% of bytes.

---

## 8a. Removing a link can orphan its destination

Logged because it cost a follow-up fix. The user asked to remove the "Champions path" text link under
the brand header. That link was also the only thing naming the **Champions Path screen itself** —
`renderTitles()` opened straight into a caption. Removing the link left the destination untitled.
Fixed by adding `<h2>Champions Path</h2>` to the list view (`main` at `908174f`).

The general lesson for the remaining slices: several elements in this app do double duty as
navigation and as page titles. Before deleting one, render the thing it points at.

---

## 8b. Decisions needed before code

Four of the fixes below change numbers on screen, so they need a ruling first. Everything else
is unambiguous repair.

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | **Rostered cheap players: 0 or flatten?** `isRetired` ORs `tinyFlat <= 1200`, so Mason Rudolph (PIT), Andy Dalton (PHI) and 29 others price at 0 despite having a team. | Change to `noTeam && (tinyRaw \|\| tinyFlat)`. A rostered QB2 prices at his flatten value (761–1137), not 0. Explicit retired set still wins. |
| D2 | **VA on 3-team trades.** Per-seat bags do not mirror, so VA never cancels: +424.09 league-wide. | Compute each seat's VA against the **union** of the other bags, restoring zero-sum. Alternative — exclude N-way trades from VA and caption it. |
| D3 | **Where does derived value live?** VA, partner means, and grade thresholds are each implemented two or three times. | Pipeline owns all arithmetic; ships one flat row per trade per lens; browser only formats. Kills P0-4, most of §4, ~70% of bytes. |
| D4 | **Does the Home hero return, and do Best 10 / Worst 10 come back?** The board screen already works and is merely unreachable; `.hero` CSS survives with nothing emitting it. | Restore Best/Worst as a real screen (cheap — delete the two lines that force `view = "home"`), and either restore the hero or formally retire it. |

---

## 9. Proposed fix order

**Slice 1 — wrong numbers, generator-only, no data change**
Startup surplus (P0-1) · third-party bag VA line (P0-3) · `rankWide` uses `chipLived` (P1-2) ·
Trades tab filters `chipLived` + prints `livedHint` (P0-5) · middle margin uses `cls()` (P1-3) ·
`?me=`/`?t=` on boot (P1-1) · `esc()` on text **and** attributes (P1-6, P1-13) ·
spark null gaps (P1-5) · `catch` on seat fetches · guard `data.trades` · empty-state copy ·
reset filters in `clearLeague` (P1-11).

**Slice 1b — pipeline truth**
One canonical build list in `build.mjs`, including `apply-value-adjust.mjs` and `title-path.mjs`;
delete the duplicate `trade_boards` builder (P0-2) · stop zeroing rostered players (P0-5) ·
decide VA on N-way trades (P0-6) · recompute totals when any side has priced legs (P1-9) ·
prefer the rostered id on name collisions and give `ktcValue` a name fallback (P1-13) ·
`aged` from one price book (P1-10) · delete `realized_*` rather than repair it.

**Slice 2 — delete the dead**
Remove `renderLeague`/`renderTradeBoards`/`rankSides`/`monthsAgo`/`boardClock`/`boardWindow`/
`draftTab` and the dead `pickWindowEnd` branches. Stop shipping `other_bags` on 2-team trades,
`realized`, `recent_trades`, `year_ends`, `partner_headlines`, `drafted_by`, `review_trades`,
`trade_boards.today`/`.aged`, `drafters_*`.

**Slice 3 — one source per number**
`partnerPer()` helper feeding home tile and Partners tab (P0-4) · single grade threshold constant ·
single "today" clock (`league.today`) · decide VA ownership · precomputed `marks.json` (P1-7) ·
memoize `tradeDelta` and sort on precomputed keys (§6b).

**Slice 4 — consistency and a11y**
One posture vocabulary · ticker stops duplicating packs and stops double-rendering ·
year filter becomes radios · back-button history (P1-8) · stop `replaceState` on every render
(P1-12) · unnest interactive controls from buttons (A1) · keyboard and focus (A2–A4) ·
44px targets (A5) · Champions Path "1st" column earns its keep.

**Slice 5 — rewrite the specs**
`UI_SDD.md` to match five windows, four tabs, gold cards, packs, Champions Path.
`PRODUCT.md` today-clock definition to include the KTC blend and retired→0.

---

## 10. Open questions for Truman

1. **Is the Home hero coming back?** One number for "how you have done", or is the six-tile
   panel the answer now?
2. **Should Best 10 / Worst 10 return** as a real screen, or is Most lopsided the permanent
   replacement? (The code for boards already exists and works — it is just unreachable.)
3. **Drafts on a lens.** Today the Drafts tab pins Since-trade and hides the dropdown. Should
   rookie surplus respond to the lens, given "got" would be a windowed mean while "sent" stays
   draft-day cost — two clocks in one number?
4. **Retired detection.** The current rule is "not on KTC + no NFL team", plus an explicit list.
   Do you want an explicit retired list as the only source of truth instead?
5. **Publish cadence.** `league.today` is `2026-08-28` while the tape already has a
   `2026-08-29` trade. Automate the rebuild, or caption the staleness?
