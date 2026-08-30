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

## 0. Status — what shipped, 2026-08-29 / 30

The audit was worked in seven slices, one PR each, each merged to `main` so Pages deployed it.
Every heading below carries its own **FIXED** annotation with the commit; this is the index.

| Slice | Commit | Closes |
| --- | --- | --- |
| Name collisions (pre-audit fix) | `fdec099` | P1-13 |
| A — pricing | `452d5db` | P0-5 (D1), P0-6 (D2), P1-9 |
| B — generator correctness | `2f22d5f`, `38885d1` | P0-1, P0-3, P0-7, P1-1, P1-2, P1-3, P1-5, P1-6, P1-11, P1-14, §6 fetch/guards/empty states |
| C — pipeline truth | `7812573` | P0-2, P1-10, `realized_*` |
| D — dead code and payload | `4653091`, `3474f51`, `64f55b0` | §3 dead UI, §3 dead payload |
| E — one source per number | `96d9218`, `ec088f6` | P0-4, P1-4, P1-7, P1-12 (D3), §4.3, §4.4, §6b |
| F — phone and keyboard | `f9fdb39`, `d4997a2` | A1, A2, A3, A4, A5, A7, A7b, A7c, §6 year-filter semantics |
| Delete the league screen (D4b ruling) | `8cdbb3d` | §3 dead UI, §10.2 |
| G — docs | `c36976c` | §7 docs drift |
| Tape restack at phone width | `ab7ef73` | A7d |
| Full-screen trade and real history | `047f573` | P1-8, the back-affordance sweep |
| Formatting pass — text fitting | this commit | A10, §6d F1–F9 |

**Signed deltas, 2026-08-30, `DATA_V = 20260830sd`.** The margin between two sides no longer sits
between them as one unsigned number with an arrow. It is attached to each side and signed: the
winner carries `+648`, the loser `−648`, and every side keeps its bag total as well. That folded
four sign conventions for the same quantity into one (§4.8), and the one convention is written
down in **§4a** so it cannot drift back. It also closes A8.

**Still open, deliberately.** §4.2 posture vocabulary,
§5.1–5.2 ticker duplication, §5.3 the constant `1st` column, A6 (marquee pause),
and the `DATA_V` hand-edit hazard in §6b. None were in the approved
slice list. Plus the `windows` restructure (D3a), which was scoped and written up rather than
half-landed. And the `+`/`−` prefix drift found by the formatting pass (§6d.4), left to
`cursor/signed-deltas-af37`, which is rewriting how a margin's sign is rendered.

**User decisions.** The Home hero is still open (§10.1). The Traders/Drafters lists were ruled on
during this pass — delete (§8b D4b). And the work raised one new one: **D5, the 40/60 KTC blend
has no reader on any reachable screen** (§8c).

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

### P0-1 — "Include startup picks" flips the Drafts headline sign — **FIXED, `2f22d5f`**
Shipped: `pickDelta` returns `displayDelta(pickGot(p), p.pick_cost)` for startup picks and
`pickRow` prints the cost. Recomputed on the committed data, SF69erss's Drafts header with
startup ticked goes **962 / pick → 89 / pick · 54 graded** (rookie-only stays −18 / pick · 27).
The 28 startup rows now print a cost instead of `—`. Ticking the box still moves the sign, but
now it says something true — this seat's startup picks beat their cost by 89 apiece — instead of
reporting raw player value as if it were surplus.
Original finding below.

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

### P0-2 — `node build.mjs` does not reproduce the deployed site — **FIXED, `7812573`**
Shipped: `build.mjs` now runs `sleeper-sync → draft-resolve → value-snapshot → revalue →
title-path → apply-value-adjust → generate-page`. The duplicate boards builder is gone —
`revalue.mjs` no longer emits `trade_boards`, `partner_headlines`, `hero.even_*` or
`realized_*`; `apply-value-adjust.mjs` is the single builder. `revalue.mjs` still runs in a
checkout that has `value_curve.json`; only its board half was removed. `README.md` and
`docs/TRACKER_SDD.md` updated to the seven-step list.
Original finding below.

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

### P0-3 — Third-party bags hide their Value Adjustment — **FIXED, `2f22d5f`**
Shipped: `tradeBags` routes every other-party side through `applyVa` and passes
`side.value_adjust` as the fifth argument, so the line prints. Verified in a headless harness
with all ten seats loaded — 12 third-party bags render, 12 of 12 now have header == legs + VA.
Note that Slice A (`452d5db`) then made VA **0 on every N-way trade**, and all 12 of these bags
belong to the two 3-team trades, so the line they now correctly print reads 0. The fix is what
keeps the header honest if VA policy ever changes; the 712-point gap on
`1277511518384037888` closed because VA went to 0 there, not because the line appeared.
Original finding below.

`tradeBags` passes five arguments to `bagBlock` for the two primary bags (`:1137-1138`) but only
**four** for every other party's bag (`:1142`) — `va` is omitted. `bagBlock` therefore prints no
Value Adjustment line while the header total it prints already contains VA.

Measured: 12 third-party bags exist in the data; **4 carry non-zero invisible VA**. Trade
`1277511518384037888` shows a TrumanCooper bag whose legs sum to 12,248 under a header reading
12,960 — 712 unexplained. Third-party bags also never pass through `applyVa`, so they trust the
committed value while the primary bags recompute.
*Fix:* pass `side.value_adjust`; route the side through `applyVa`. Generator-only.

### P0-4 — The manners tile and the Partners tab disagree on 1 partner in 4 — **FIXED, `96d9218`**
Shipped: one `partnerPer(seat, name, lens)` helper feeds the Partners tab, the home partner
teaser and the manners tile, and one `GRADE_EVEN = 100` replaces the three copies of the
threshold. The tile is now a tally of exactly the grades the tab prints, so they cannot diverge.
`partners[].grade` was deleted from the payload rather than left as a fourth answer.
The manners counts come from `marks.json`, which the pipeline builds with the same
`partnerGrade` over the same per-lens means. Verified by recomputing all 82 partner grades in
the browser against `marks.json`: **0 disagreements on all five lenses** (was 20 of 82 on `all`).
Original finding below.

`marksOf` reads the committed `p.grade` (`:920`), which the pipeline derives from the **today**
clock. The Partners tab recomputes the grade from the **selected lens** (`:1470`).
Measured against lens `all`: **20 of 82 partner grades disagree.** Both screens carry a
"Score as" control, so the home tile renders a today-clock verdict under a Since-trade heading.
*Fix:* one `partnerPer(seat, name, lens)` helper; delete or explicitly label the stored grade.
Both.

### P0-5 — 31 rostered NFL players are valued at zero — **FIXED, `452d5db`** (decision D1)
Shipped rule: **not on the KTC Superflex board *and* no NFL team → 0.** The `tinyRaw` and
`tinyFlat` branches are gone, along with the `TINY_RAW_MAX` / `TINY_FLAT_MAX` constants;
`RETIRED_SLEEPER_IDS` and the `onKtcBoard` early return are untouched.

Not the `noTeam && (tinyRaw || tinyFlat)` the recommendation below proposed — plain AND would
have broken genuine retirement detection for expensive stale rows. Ryan Fitzpatrick carries
flatten **2,014** with no team and no KTC row; under AND he would price at 2,014 instead of 0.

Measured over all 1,736 priced legs in the committed `even` bags:

| | |
| --- | ---: |
| Legs that went 0 → value | **108** |
| Legs that went value → 0 | **0** |
| Distinct names restored | **29** |

Mason Rudolph and Andy Dalton now price **761**, Austin Hooper **856**. Ryan Fitzpatrick,
Ezekiel Elliott, Joe Mixon, Nick Chubb, Adam Thielen and DeAndre Hopkins all still price **0**.

The unresolved-`sid` path was checked because it falls through to `noTeam === true` and zeroes:
**2 legs, 1 name — D'Wayne Eskridge**, who is genuinely out of the league. So no rostered player
reaches 0 through a failed id lookup.
Original finding below.

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

### P0-6 — Value Adjustment breaks zero-sum on 3-team trades — **FIXED, `452d5db`** (decision D2)
Shipped: **VA is 0 on any trade with more than two seats.**

Not the "union of the other bags" the recommendation below proposed. That does not restore
zero-sum: the property needs `sum(gotVA) == sum(sentVA)` across seats, and in an N-way trade a
seat's `sent` bag does not correspond to any single other seat's `got` bag, so there is no
non-arbitrary attribution. VA's whole rationale is a pairwise stud-for-quantity swap; on three
seats the premise is absent, so the honest number is 0.

Threaded as an option rather than guessed inside the function: `applyToSide(side, opts)` takes
`opts.noVa`, which forces `value_adjust` and `value_adjust_sent` to 0 while still recomputing
totals. `applyTrade` computes `const multi = (t.others || []).length > 1` once and passes it to
every side of that trade including `other_bags` and all five windows. The browser's inline
`applyVa(s, noVa)` takes the same flag from `isMulti(t)`.

Re-measured on the shipped data:

| | Before | After |
| --- | ---: | ---: |
| tx `916914658962112512` sum of `today_delta` | +397.39 | **0.00** |
| tx `1277511518384037888` | +26.70 | **0.00** |
| League-wide sum over fully-observed trades | +424.09 | **0.00** |
| Zero-sum breaks across 288 two-team pairs | 0 | **0** |

Original finding below.

VA is computed per seat against **that seat's own counter-bag**. In an N-way trade those bags do
not mirror, so the adjustments never cancel.

Measured: the two 3-team trades sum to **+397.39** and **+26.70** instead of 0, and the
league-wide sum of every fully-observed `today_delta` is **+424.09** — exactly those two numbers.
Two-team zero-sum remains perfect (0 breaks across 288 pairs), so this is specifically the N-way case.
*Fix:* define VA for N-way trades against the union of the other bags, or exclude N-way trades
from VA and say so. Pipeline; product decision first.

### P0-7 — The Trades tab scores trades on clocks they have not lived — **FIXED, `2f22d5f`**
Shipped: `renderTrades` filters with `chipLived` and prints `livedHint` above the list, so its
disclosure branch is finally reachable. The tab and the home tiles now hide the same set.
Original finding below.

`renderTrades` never filters by `chipLived` (`:1279`). On the `y3` lens a two-week-old trade
renders a "First 3 years" number built from a single snapshot, while Home's tiles exclude exactly
those trades via `windowTotal` → `chipLived`. `livedHint` — the function written to disclose this —
is only ever called from Drafts (`:1372`), where `lens` is pinned to `all`, so its disclosure
branch is unreachable.
*Fix:* filter with `chipLived` and print `livedHint` above the list. Generator-only.

---

## 2b. P1 defects (confirmed, with line numbers)

### P1-1 — Shareable links are broken; `?me=` is written but never read — **FIXED, `2f22d5f`**
Shipped: boot resolves `?me=` against **both** display name and `user_id` (`syncUrl` writes the
name, `selectMe` keys on the id), then honours `?t=` to open that trade. An unrecognised value
falls back to league home without throwing. `96d9218` added the matching `?view=league` case, so
that URL no longer needs a seat.
Original finding below.

`syncUrl()` (`generate-page.mjs:497`) writes `?me=<name>&view=trades&t=<tx>&lens=<lens>` on every render.
Boot only reads `lens`, `title`, `view` (`:391`, `:456-457`). **`me` and `t` are never read.**
Because `render()` forces `view = "home"` when there is no `me` (`:1489`), reloading or sharing
any manager URL silently lands on **league home**.
*Fix:* on boot, resolve `me` by name or id, then honour `t`. Generator-only.

### P1-2 — "Most lopsided trades" silently hides the last 12 months on the default lens — **FIXED, `2f22d5f`**
Shipped: `rankWide` gates on `chipLived`, not `windowLived`. The candidate pool on the default
lens went **452 → 576 sides**. Note what did *not* change: the 2026-08-29 trade still does not
appear in Most lopsided, because it is not lopsided enough for a top 10 — the ranking is by
margin, not recency. The bug was that 124 sides could not be ranked at all.
Original finding below.

`rankWide()` (`:634`) gates rows with `windowLived(r.date)`, but `windowLived` maps
`all → 1 year` (`:624`). `chipLived()` (`:599`) deliberately returns `true` for `t0`/`all`;
`rankWide` bypasses it. **124 of 576 sides are excluded** on the default Since-trade lens,
including everything from 2025-08-29 onward. The trades list shows those same deals.
*Fix:* use `chipLived` in `rankWide`. Generator-only.

### P1-3 — The middle margin number is always green — **FIXED, `2f22d5f`**
Shipped: `tradeRow`, `pickRow` and `boardTape` all use `cls(delta)`, so the middle follows its
sign, and `—` / `0` are explicitly neutral rather than green. `boardTape` outlived the board it
was named for — it is what the Recent Trade card expands into.
Original finding below.

`tradeRow` (`:1163`), `boardTape` (`:658`) and `pickRow` (`:1249`) hardcode
`midCls = "pos"` for any non-zero delta. A deal you lost by 7,292 renders its margin in
the same green as one you won. Direction is carried only by the `←` / `→` glyph, while the
left/right **names** are correctly red/green — so one row shows two different colour languages.
*Fix:* `cls(dlt)` for the middle, or make the middle deliberately neutral everywhere. Generator-only.

### P1-4 — Home partner teaser and the Partners tab compute different numbers — **FIXED, `96d9218`**
Shipped with P0-4: both screens call `partnerPer()`. The third number,
`partners[].even_per_trade`, no longer ships to the browser.
Original finding below.

`renderTeamHome` (`:1095-1105`) builds its own per-partner mean from `tradeDelta`.
`renderPartners` (`:1464`) builds another from `windowPer` with a different filter (`!t.incomplete`).
Same partner, same lens, two code paths — they can disagree. `data.partners[].even_per_trade`
from the pipeline is a **third** number, now unused on both screens.
*Fix:* one `partnerPer(seat, name, lens)` helper, used by both. Generator-only.

### P1-5 — Null year-ends plot as zero — **FIXED, `2f22d5f`**
Shipped: `spark()` treats a missing year-end as a gap — the path breaks rather than dropping to
the floor — and a run of one surviving point draws a `<circle>` so it is still visible.
Original finding below.

`spark()` (`:397`) uses `p[k] || 0`. A missing year-end draws a line to the floor, which reads as
"this asset went to zero" rather than "no snapshot". Already flagged as later-slice item 6 in
`UI_SDD.md`; still shipped.
*Fix:* skip the point or break the path. Generator-only.

### P1-6 — Raw data is interpolated into HTML with no escaping — **FIXED, `2f22d5f`**
Shipped with P1-14: one `esc()` helper, applied to every data interpolation in text and in
attributes.
Original finding below.

Every render concatenates Sleeper-supplied strings into markup (`l.label`, `p.mine`, `r.name`,
`p.player`, champion `thesis`). A display name or player label containing `<` executes.
The apostrophe hazard is handled; angle brackets are not.
*Fix:* one `esc()` on every data interpolation. Generator-only.

### P1-7 — Tapping a style tile downloads the whole league — **FIXED, `96d9218`**
Shipped: `data/ui/marks.json`, **6 KB**, 10 seats × 6 metrics × 5 clocks, loaded once at boot.
`marksOf`, `teamMarks` and `markChart` all read it; `markChart` no longer calls `seatData` at
all. The most expensive interaction in the app went from **~7.4 MB** of seat JSON to **0 bytes**.
Original finding below.

`markChart` → `Promise.all(members.map(seatData))` (`:1591`) fetches all ten seat files,
**~7.4 MB of JSON**, to draw one bar chart. On a phone that is the single most expensive
interaction in the app.
*Fix:* ship a small precomputed `marks.json` (10 rows × 6 metrics), or lazy-load on demand
with a skeleton. Pipeline + generator.

### P1-8 — Browser back does not work — **FIXED, `20260830nv`**
Shipped: a `screenKey()` — seat, view, title year, and the open full-screen trade — decides
`pushState` versus `replaceState`, and a `popstate` listener rebuilds state from the entry.
Moving between screens pushes; expanding a row or moving the clock still only replaces, so
**P1-12 stays closed**: measured, twelve trade-row toggles leave `history.length` unchanged.

Each pushed entry carries its own depth in `history.state.d`, read back out of the popped entry
rather than counted locally, so Forward is as exact as Back. That number is what lets the in-app
back chip call `history.back()` only where the app owns an entry behind the current one and fall
back to a named parent screen on a cold deep link — the chip and the browser button therefore
cannot land in different places. Walked from three depths:

| | |
| --- | --- |
| home → list → trade, Back ×2, Forward ×2 | depth 0→1→2→1→0→1→2, URL and heading correct at each stop |
| seat → trades tab → partners tab, Back ×3 | returns through both tabs to league home |
| titles → title detail, Back vs the "All champions" chip | both land on the list at depth 1 |
| Escape on the full-screen trade | same destination as the chip |
| Back at depth 0 | leaves the site, which is correct, and is exactly what the chip guards against |

The "All champions" chip was a real disagreement found while verifying this: it ran through
`data-title=""`, which **pushed a fresh titles entry**, so the browser's Back then returned to the
detail the chip claimed to have left. It routes through the one back handler now.

Original finding below.

`syncUrl` only ever calls `history.replaceState` (`:504`). There is no `pushState` and no
`popstate` listener, so back leaves the app entirely from any depth.
*Fix:* push on view/seat/trade change, restore on `popstate`. Generator-only.

### P1-9 — A receiver-only side shows a total that contradicts its own legs — **FIXED, `452d5db`**
Shipped: `applyToSide` refreshes `today` / `sent_today` / `today_delta` when **either** bag has
priced legs, and for `incomplete` sides too; `value_adjust` stays 0 whenever the side is
incomplete. The browser's `applyVa` mirrors it — the early return is now
`if (!got.length && !sent.length) return s;`.

Verified over every side of all 586 trades — five windows plus `even`, both bags, `other_bags`
included, incomplete and one-way included: **3,528 sides, 7,176 bag totals, 0 violations** of
`today == sum(priced legs) + value_adjust` (was 5 across 3 transactions), and 0 violations of
`today_delta == today − sent_today`.
tx `567502131945091072` / TipsUp now reads **0** over legs that all price 0, instead of 1,692.
tx `916914658962112512` / SF69erss reads **3,185**, matching its single Zach Charbonnet line,
instead of 3,091.
Original finding below.

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

### P1-10 — `aged` subtracts two different price books — **FIXED, `7812573`**
Shipped: `aged` is `windows.all.today_delta − windows.t0.today_delta`, both flatten, so it
measures elapsed time and nothing else. Both sides of the 2026-08-29 trade now report `aged` of
**0** instead of ±25.
Original finding below.

`sides[].aged` is `even.today_delta − even.t0_delta`, but `today_delta` is now the **40/60 KTC
blend** while `t0_delta` comes from the **flatten-only** `windows.t0`. The number therefore
measures the pricing model as much as the passage of time.

Measured across all 576 sides: mean absolute difference between shipped `aged` and a
same-book `windows.all.delta − windows.t0.delta` is **1,025**. Both sides of the trade dated
`2026-08-29` — zero elapsed time — report `aged` of ±25.

Live impact is currently **nil**, because the only screen that displayed `aged` is the
unreachable board screen (§3). It is latent, and it is in the data.
*Fix:* compute `aged` from one book, or ship a flatten `today_delta_flat` for it. Pipeline-only.

### P1-11 — Filter state leaks across seats — **FIXED, `2f22d5f`**
Shipped: `clearLeague` also resets `year`, `lens`, `draftSort`, `draftRounds`, `draftStartup`
and `openPacks`. Empty-state copy was added at the same time, so a genuinely empty list now says
so instead of showing a bare filter bar.
Original finding below.

`clearLeague` (`:481`) resets `me`, `data`, `view`, `openId`, `partnerName`, `openPick`,
`openDraft`, `markOpen`, `titleYear` — but **not** `year`, `lens`, `draftSort`, `draftRounds`,
`draftStartup`, or `openPacks`. Pick 2019 in one seat's Trades, go home, pick a different seat:
its Trades tab is filtered to a season it may not have, the filter dot stays lit, no checkbox
reads as checked, and there is no "no trades in 2019" copy — just an empty list.
*Fix:* reset filters in `clearLeague`, and add empty-state copy. Generator-only.

### P1-12 — `history.replaceState` fires on every render — **FIXED, `96d9218`**
Shipped: `syncUrl` builds the URL string, compares it to the current one, and returns without
touching history when nothing changed. Expanding rows no longer writes history at all.
Original finding below.

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

### P1-14 — Attribute injection, not just element injection — **FIXED, `2f22d5f`**
Shipped: `esc()` covers `data-partner`, `data-who`, `data-title`, `data-pick`, `data-year` and
every other data-bearing attribute, so the datasets the click handlers read stay intact.

A second escaping bug surfaced while verifying this one and is worth recording, because it had
been shipping silently and no source-level review would have caught it. `generate-page.mjs`
builds `index.html` from a template literal, so a `\d` written in the generator arrived in the
browser as a bare `d`. Two regexes were affected: `pieceWeight`'s late-4th test
`/^pick:\d{4}:4:/` and `yearsOn`'s `/\.0$/`. The first meant the **browser** weighted late 4ths
at 1 while the **pipeline** weighted them at 0.5, so the inline `applyVa` and `value-adjust.mjs`
disagreed on any bag containing one. Fixed in `38885d1` by double-escaping. The lesson: the
standing "inline `applyVa` matches `value-adjust.mjs`" check must extract the function from the
**generated `index.html`**, not from `generate-page.mjs`. It now does.

Extending §P1-6: unescaped data also lands **inside attribute values** —
`data-partner="` (`:884`, `:1471`), `data-who="` (`:476`), `data-title="`. A Sleeper display name
containing a double quote breaks out of the attribute, which is a second injection vector and
also silently breaks the click handlers that read those datasets.
*Fix:* the same `esc()`, applied to attributes as well as text. Generator-only.

---

## 3. Dead code and dead payload

### Dead UI: the entire league board screen is unreachable — **boards DELETED 2026-08-30 (D4a)**

*Update: the Best/Worst board described below was briefly made reachable, then removed for good by
user decision (D4a). `renderLeague()` and its Traders/Drafters lists went with it on a second
ruling (D4b). **This entire dead screen is gone**, along with `draftTab`, the dead
`pickWindowEnd` branches and the unreachable `pieceWeight` label branch. `boardTape` is the one
survivor — Most lopsided and the Recent Trade card render it. Original finding below.*

`renderLeague()` (`:1391`), `renderTradeBoards()` (`:1437`), `rankSides()` (`:1422`) and
`monthsAgo()` (`:1413`) implement Best 10 / Worst 10 with an As-of-today vs Aged toggle and
3m/6m/1y/3y/all window chips. The only buttons that set `view = "league"` live **inside**
`renderTradeBoards` (`:1596`, `:1598`), and `render()` rewrites `view = "league"` back to
`"home"` in both branches (`:1489-1490`). **Nothing can reach it.**
Also dead: `boardClock`, `boardWindow`, `draftTab` (`:371`, set at `:1660`, never read),
and the `y1/y2/y3/t0` branches of `pickWindowEnd` (`:1206`) because `renderDrafts` pins
`lens = "all"` (`:1339-1340`, restored at `:1387`).

### Dead payload — **CUT, `4653091` + `64f55b0`**

Removed from the seat files: `other_bags` on two-team trades (kept only where
`others.length > 1`, which is 6 of 586), `realized`, `recent_trades`, `year_ends`,
`partner_headlines`, `legs[].drafted_by`, `hero` beyond `two_way`, and `partners[].grade`.
`legs[].value_flat` was **kept** deliberately: in a checkout without `value_curve.json` it is
the only record of the flatten price, and repricing from it is idempotent.

Removed from `league.json`: `review_trades`, `drafters_startup`, and — after the board was
deleted (D4a) — `trade_boards.today` / `.aged`. A `trade_boards.sides` row now ships exactly the
six things the page reads: `transaction_id`, `date`, `user_id`, `name`, `other`, `headline`, and
`windows[lens].{got, sent, incomplete}`. The full row, with `today_delta`, `t0_delta`, `aged`,
`snaps` and per-window VA, still exists inside the pipeline for its own self-checks — it is just
not shipped.

Measured on disk after the cut:

| | Audited | Now |
| --- | ---: | ---: |
| Seat files, all ten | 7.4 MB | **2.94 MB** |
| `league.json` | 717 KB | **266 KB** |
| `marks.json` (new) | — | 5.9 KB |

A **60% cut** to what a phone downloads, with no visible change. Every screen was re-rendered
against the trimmed payload before it shipped.

`drafters_rookie` and `league.traders` were **not** deleted, because `renderLeague()` read them at
the time. That screen has since been deleted too (D4b), so `league.traders` survives on a
different reader — `leagueBubbles()`, for the ticker pills — and `drafters_rookie` (~2.5 KB) now
has none. It is the last known dead field on the wire.

The `windows` restructure — one leg list plus five values instead of five near-duplicate leg
lists, worth roughly another 1.2 MB — was **not** attempted. It changes the data contract the
browser reads on every row and could not be landed safely alongside the generator slices. It is
written up as the remaining half of D3 in §8b.

Original measurements below.

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

**Re-tested on the deployed site after Slices A–F, `DATA_V=20260829u`.** All five are gone:
the manager URL reloads onto that seat's Trades tab with the picker showing the name; the Drafts
header reads 89 / pick with startup ticked and every startup row prints a cost; losing rows
render a red middle; Most lopsided ranks over the full 576-side pool; and clicking a player name
inside an open row no longer collapses it, because the detail is a sibling of the button rather
than its child.

An earlier automated pass over the same screens reported "zero defects, production-ready".
It tested deep links with a **fake** id (`?me=999999999`), saw the fallback to league home, and
recorded that as graceful error handling — the fallback *is* the bug, and real ids hit it too.
Worth remembering when reading any clean bill of health: verify the specific claim, not the mood.

---

## 3a. Verification traps — read before trusting any "no overflow" or "it builds" claim

Both of these produced **false all-clears** during this project's fix passes. They are recorded
because several earlier "verified, no problems" reports were measured with the broken method.

### `documentElement.scrollWidth` clamps
`document.documentElement.scrollWidth` silently reports the viewport width even when content
overflows. A card was measured "no overflow" at 375px while actually rendering **589px wide**.
Only `document.body.scrollWidth` reported honestly.

**Use `body.scrollWidth`**, and stress-test with a name far longer than any real one — the real
worst case (`DarkWingDucks2023`) fits, so real data hides the bug.

### A dead server means you are measuring someone else's build
An agent's `python3 -m http.server` exited instantly because another agent already held the port.
It then spent a full measurement round reading **a different build**, and its greps returned false
positives (`padding: 10px 12px` also matches `button.mark`) that made the wrong build look correct.

**Require provenance**, not just a number: confirm the port is yours, and checksum the served bytes
against the bytes on disk before believing a measurement.

*This reproduced again during the signed-delta pass, 2026-08-30.* A `python3 -m http.server 8791`
died on `OSError: [Errno 98] Address already in use` because another agent already held 8791 — and
`curl` on that port still answered `200` with a complete, plausible dashboard. The served md5 did
not match the on-disk `index.html` and the build's `DATA_V` was absent from the served bytes, which
is what caught it. **Both checks are needed:** confirm the listening PID on the port is yours
(`netstat -ltnp | grep ':<port> '`), and assert the served page carries your unique `DATA_V`.
A 200 with sensible-looking HTML is not evidence of anything.

### A git conflict marker inside the template literal is valid JavaScript
The whole page is one template literal in `generate-page.mjs`, so `<<<<<<< HEAD` landing inside it
is just string content. `node --check` passes. The generator runs. `index.html` ships carrying
`<<<<<<< HEAD`, **two** `DATA_V` lines and `>>>>>>>`, and the only visible symptom is whichever
cache key the browser reached last.

This happened during the signed-delta pass, 2026-08-30, on the second rebase onto a moving `main`
— and `node generate-page.mjs && node --check` reported success on the broken file. The guard is
now in `generate-page.mjs`: it refuses to write a page containing any conflict marker, and asserts
**exactly one** `DATA_V`. Both were verified to fire, and both were verified to be invisible to
`node --check`. **`node --check` is not a merge check.** After any rebase that touches the
generator, regenerate and confirm the guards ran.

### `scrollWidth` is 0 on an inline element, so the ellipsis test passes vacuously
`el.scrollWidth > el.clientWidth` is the usual "is this ellipsized" test, but a non-replaced
**inline** box has no scroll box and reports `scrollWidth` **0**. During the A7d pass this made
"clipped numbers: 0" meaningless for `.margin`, which is a plain `<span>` inside `.mid` — the test
could not have failed. `.names` and `.val` happened to answer honestly only because they are flex
items, and flex items are blockified.

Either check `display` first, or measure the text itself: `Range.selectNodeContents(el)` then
`getBoundingClientRect()` gives the real ink box for any element, inline included. Compare that
against the nearest ancestor whose `overflow-x` is not `visible` and you get an answer that holds
for every box in the row.

**And a clipped element's ink box is not evidence of overflow** — if the element clips its own
overflow, its ink legitimately extends past its border box. Skip those, or every ellipsized name
reports as a spill. `body.scrollWidth` is the arbiter for whether anything actually escaped.

### A control's border box is not its tap target
The 44px sweep read `getBoundingClientRect().height` on every button, and reported the `All
trades` icon as a 26px violation on three screens. It is not one: it grows its own target with
`button.all-trades::after { position: absolute; inset: -10px; }`, which a rect on the *button*
cannot see. Hit-testing outward from the centre with `elementFromPoint` measures the target a
finger actually finds — 114×44 — and it is identical on `origin/main`, so the sweep was inventing
a defect rather than finding one. This is the mirror image of the traps above: a harness that
lies in the safe direction still costs a real fix somewhere else. Any 44px check must fall back
to hit-testing before it calls a short box a defect.

### The row that measures fine and still reads wrong
Every numeric check can pass on a row a person would call broken. The signed-delta pass had
`body.scrollWidth` equal to the viewport, zero clipped figures and zero ellipsized names at
320px — and the rows were still wrong, because the delta and the total wrapped onto *different*
lines and the orphaned total left-aligned under a right-aligned side. No spill, no clip, no
ellipsis: nothing in the harness had an opinion about it. It was visible immediately in a
screenshot, and then confirmed by grouping each side's children by their `top` and asserting the
delta and its total share a line. **Read the screenshots.** Then, once the eye finds a defect,
write the geometric assertion that would have caught it.

### An ellipsised cell reports two client rects on one line
`Range.getClientRects()` is the right way to measure inline ink (above), but a `nowrap` cell
that is actually ellipsising returns **two** rects — the full text and the clipped box — with
identical `top` and `bottom`. Counting rects therefore reads every truncated name as a wrapped
one, which is the §3a "row that measures fine and still reads wrong" probe firing backwards:
it invents a wrap on exactly the cells that are behaving correctly.

Count **distinct rect tops**, not rects. Found while stress-testing the champ card's scoreboard
with `DarkWingDucks2023`; the real layout was one line in every case.

### A cell that ellipsises has no baseline to align to
`text-overflow: ellipsis` requires `overflow: hidden`, which makes the box a scroll container,
and a scroll container has no baseline of its own — CSS Box Alignment synthesizes one from its
**border box**. So `align-items: baseline` across such cells is really aligning border boxes,
and cells with different `font-size` or `line-height` end up on visibly different baselines.

Measured on the champ card's scoreboard: a 16px score between two 15px names sat **1px** off
them, invisible to the eye and to `body.scrollWidth`, and caught only by comparing each cell's
ink bottom. The fix is not a nudge — it is to make every cell on such a line share a font-size
and line-height, so the synthesized baselines are identical by construction. **A row of
ellipsising cells cannot mix type sizes and stay aligned.**

### The systemic cause behind §6c A7
A `1fr` grid track's automatic minimum is `min-content`, so a grid item refuses to shrink and
`text-overflow: ellipsis` never engages without an explicit `min-width: 0`. This is why trade
**values** clipped to `8,96` at phone width, and the same omission was independently rediscovered
in the Champions Path caption. It is **systemic across this app's grid layouts**, not one
component — fix it everywhere, not at each reported site. As of `20260830tr` the live page carries
16 `min-width: 0` guards; as of `20260830fm1`, **25** — the formatting pass swept the grids and
flex rows the earlier reports had not named (§6d, F3).

The guard is necessary and **not sufficient**. It decides *who* gives way when a row does not fit;
it cannot make a row fit. Once `min-width: 0` let the figures win, the names lost by exactly as
much — see A7d, where the answer was to change the arrangement rather than to keep choosing which
half of the row to sacrifice.

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

**Re-run after Slices A–F**, same script over the same 10 seats, plus the checks the slices
added. Every line is clean:

| Invariant | Result |
| --- | --- |
| `today == sum(priced legs) + value_adjust`, every side and window | **3,528 sides / 7,176 bag totals, 0 violations** |
| `today_delta == today − sent_today` | 0 violations |
| Stored VA matches a fresh `value-adjust.mjs` recompute | 0 stale |
| Stored today values match a fresh `price-today.mjs` recompute | 0 stale |
| Zero-sum on complete 2-team trades | 0 breaks across **288** pairs |
| Zero-sum on N-way trades | **2 of 2 exact** (0.00, 0.00) |
| League-wide sum of fully-observed `today_delta` | **0.00** (was +424.09) |
| Generated `index.html`'s inline `applyVa` vs `value-adjust.mjs`, every side | identical |
| `marks.json` vs a browser recompute of all six metrics × 10 seats × 5 clocks | identical |
| NaN / Infinity anywhere in the shipped payload | 0 |
| `apply-value-adjust.mjs` self-checks | pass |

Two self-check expectations were **updated, not weakened**, because Slice A legitimately moved
them: the CeeDee VA check now expects ~3,322 rather than the pre-blend 5,500–6,000 band, and the
board checks read from `sides` directly instead of the trimmed `league.trade_boards`. Both still
assert a specific number.

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

**Status:** 1, 3, 4, 6, 7 and 8 are fixed; 2 and 5 are not.

1. **Margin colour** — **FIXED, `2f22d5f`** (§P1-3).
2. **Posture vocabulary** — **STILL OPEN.** Champions Path still says "Bought players" while
   manager home says "Buys players". Cosmetic, not in the approved slice list.
3. **Partner grade threshold ±100** — **FIXED, `96d9218`.** One `GRADE_EVEN` in the browser and
   one `EVEN` in `apply-value-adjust.mjs`; the stored `grade` field was deleted.
4. **Two "today" clocks** — **FIXED, `96d9218` + `ec088f6`.** `dayAlert` no longer reads the
   browser clock. It takes the later of `league.today` and the newest trade date on the tape, so
   a user west of UTC never sees "0 trades today" and the 2026-08-29 side is not orphaned by a
   `league.today` of 2026-08-28. The card was then renamed **Recent Trade** — named for recency
   rather than for a clock — which removes the disagreement rather than papering over it.
5. **VA computed twice** — **STILL OPEN by design.** The pipeline bakes VA into the JSON and the
   browser recomputes it in `applyVa`. Removing the duplication is the remaining half of D3 and
   needs the `windows` data contract to change first. What did change: the two are now held
   equal by an invariant that extracts `applyVa` from the **generated `index.html`** and
   compares it to `value-adjust.mjs` over every side. That check found the escaped-backslash
   divergence in §P1-14 that reading the source never would have.
6. **Guard style** — **FIXED, `2f22d5f`.** `data.trades`, `t.others` and the partner paths are
   all guarded.
7. **Delta rounding** — **RESOLVED.** `rankSides` was unified onto `displayDelta` rounding in
   `4653091` and then deleted with the board in `3474f51`, so `displayDelta` is now the only
   rule in the file.
8. **Four sign conventions for the same quantity** — **FIXED, 2026-08-30, `DATA_V = 20260830sd`.**
   The same number — a value delta — was written four different ways: an arrow glyph beside an
   unsigned figure in a tape row's middle column, an explicit `+` prefix on the Value Adjustment
   leg and the "Ahead" tile, colour with no sign at all on the Partners tab and the Drafts
   average, and a bare number in the mark-chart stat lines. The user's report was about the
   consequence rather than the cause: the margin sat between the two sides as one number, so
   *who* won had to be decoded from a glyph. §4a is the single convention that replaced all four.

   *A note on numbering.* This item was requested as "P1-11". P1-11 in this file is
   **filter state leaks across seats**, fixed in `2f22d5f`; the sign-convention finding had no
   number of its own, so it is recorded here as §4.8 with §4a as its resolution.

---

## 4a. The signed-delta convention — one rule, do not let it drift back

**A signed, coloured value sits next to the thing it describes.** Positive is `+N` in
`--green`, negative is `−N` in `--red`, and the sign is always explicit.

| Case | Renders as | Ink |
| --- | --- | --- |
| Gain | `+648` | `--green` |
| Loss | `−648` | `--red` |
| Tie | `0` — no sign | neutral (`--text`) |
| No delta (incomplete / unpriced) | `—` | neutral. **Never invent a sign for a number that does not exist.** |

**Four functions, and nothing else may format a delta.** All four are in the inline script:

- `signedNum(d)` — the text. One `Math.round`, one glyph pair (`+` and U+2212), one em dash.
- `signedCls(d)` — the colour class, `cls(d)` with 0 and null forced neutral.
- `tapeMargin(d)` — the **only** emitter of the markup: `<span class="delta pos">+648</span>`.
- `tapeFigures(d, valHtml)` — the **only** emitter of a tape side's delta-and-total pair, which
  it wraps in one `.figs` span so the two cannot be separated by a line break. Every `.side-line`
  goes through it; see "How the crowding was absorbed" below for why that matters.

`tapeMargin` kept its old name deliberately. The three tape rows were already funnelled through
it so the convention could not drift between the trades list, the lopsided board and the Drafts
tab; every screen now shares the same funnel. Where a delta appears inside a prose sentence (the
style tiles' captions) `signedNum` supplies the text and the sentence keeps its own ink, because
colouring one word inside a grey caption is less legible, not more.

**What a side's delta means.** Each side's delta is its own bag minus the other bag on that row.
On a complete two-team trade those bags are the two seats, so each side's delta is that seat's
result and the pair is an exact mirror — `+648` against `−648`. That redundancy is the point: it
is what makes "who won, by how much" readable without decoding a glyph. Zero-sum holds, so the
mirror is a property of the data and not a display trick (§3b: 0 breaks across 288 pairs).

**Three-team trades.** The mirror does not hold per seat above two seats, and the row does not
pretend otherwise. The right column is the counterparties *together* — their names joined, and
the bag this seat gave up between them — so its delta is this seat's result negated, which by
conservation is also those two seats' combined result, exact to within the ±1 that rounding
three bags separately can leave. The caption carries `3-team · combined` so it cannot be read as
one seat's individual result, and the expanded detail breaks out each seat's own bag by name.
Verified on both of the league's N-way trades across all five clocks: seat deltas sum to 0 or −1.

**The arrow is gone, and so is the middle column.** Once both sides are signed, `←` / `→` (and
the stacked `↑` / `↓`) was a third encoding of a fact the sign and the colour already carry.
Removing it also removed the centre grid track, so a tape row is `1fr 1fr` and the date/caption
row that already spanned the full width below it is all that remains of the middle. A tape row
is one line shorter on phones than it was.

**Names are no longer coloured by who won.** The colour moved onto the figure it describes.
This is what closes A8: a red *player* name in a Drafts row read as "bad player" rather than
"the pick underperformed". The Drafts row still has a second colour language — the origin label,
green for own and gold for acquired — and that one is deliberate: it is provenance, not value.

**Enforced at generate time.** `generate-page.mjs` asserts the three helpers survived into the
generated page, and asserts the *absence* of every hand-rolled form it replaced: `cls(dlt)`,
`cls(s)`, `cls(-s)`, `cls(-dlt)`, `cls(p.per)`, `cls(p.surplus)`, `cls(avg)`, `cls(per)`,
`(total > 0 ? "+" : "")` and `(va > 0 ? "+" : "")`. It also asserts the tape's own CSS survived,
including both `.figs` directions and the auto margin that pushes the pair right. Adding a delta
site that formats its own sign, or that builds its own `.val`, fails the build. Do not weaken
these; extend them.

**One deliberate exception.** The Value Adjustment leg takes the sign rule but keeps its gold
ink (`#d4c07a`), because it is an adjustment *inside one bag*, not a result against another
side. Counts are not deltas and stay unsigned — "56 two-way", "27 graded", "4 extracts".

**How the crowding was absorbed.** A tape side now states three things rather than two, so the
row was re-measured rather than assumed. Stacked (≤700px) a side's two figures travel together at
the right of its line — one auto margin, on the figure pair — so the deltas line up in one column
and the totals in another and a pair of side lines is comparable at a glance.

The pair also *wraps* as a pair, and this took a fourth element to get right. At 320px the widest
rows run ~15px short, so the figures drop beneath the name rather than the name truncating —
`overflow-wrap: anywhere` on the name was tried first and rejected, because it rendered
`DarkWingDucks2023` as `DarkWingDucks20 / 23`, which reads as a rendering accident. But emitted as
two loose flex children the delta and the total then wrapped *independently*: the delta stayed up
on the name's line and the total dropped alone onto the next one, left-aligned at x=29 while the
rest of its right-aligned side sat at x=291. A bare `12,621` under a name, at the opposite edge
from every other figure, reads as belonging to nothing. Twelve sides did this — three on the
lopsided board, eight in the trades tab, one in Drafts.

`tapeFigures(d, valHtml)` fixes it by emitting the delta and the total inside one `.figs` span, so
the pair is a single flex child and wraps as a unit, right-aligning to the same edge as an
unwrapped side. `.figs` is `row-reverse` on the right side of the wide tape (so each delta stays
beside its own name with the totals inboard) and plain `row` when stacked (so both sides read
name → delta → total). The base nowrap ellipsis on `.names` stays as the last resort for a name
wider than a whole line.

Verified at 320, 360, 375, 390, 430, 640, 641, 660, 700, 720 and 1280px, with real names and with
a stress name 2.4× the longest real one plus a six-digit delta: **zero figures clipped, zero
manager names ellipsized, zero sides with the delta split from its own total,
`body.scrollWidth` equal to the viewport in every case.** Figures do wrap at 320px on the widest
rows — that is the intended relief valve — but only ever as a pair.

Two generate-time guards keep it that way: `.val` must be emitted exactly once in the whole
inline script (i.e. only from inside `tapeFigures`), and every `.side-line` the generator emits
must contain a `tapeFigures(` call. Both were confirmed to fire on a deliberately broken build
that `node --check` accepted.

**Where a signed delta renders.** Every one of these goes through `tapeMargin`:
`tradeRow` (trades list, Best/Worst deal, the expanded header, and the full-screen trade
review's flat form) · `boardTape` (Most lopsided, the row under the Recent Trade card, and the
league-wide trades list) · `pickRow` (Drafts, where the two sides are the player and the pick's
draft-day cost) · the Recent Trade card's own two chips · `partnerLine` and the Partners tab ·
`draftLine` · the Drafts average caption · the six style tiles' captions and the mark-chart stat
lines · `bagBlock`'s Value Adjustment leg · the Most-lopsided league bubble.

---

## 5. Redundant information

**Status: none of these were in the approved slice list. All five stand.** They are cosmetic or
editorial rather than wrong-number defects, which is why they were left.

1. **The league ticker duplicates every pack.** `leagueBubbles` (`:705`) emits Most passed around,
   Least traded, Forever players, Homesteader — each of which is also a pack directly below it.
   It also pushes **two** Forever bubbles: a count and then the first name (`:723-724`).
   **Changed shape, 2026-08-30 (`20260830lds2`).** The five packs are one **League Data Sets**
   dropdown with one list on screen, so a pill is no longer beside the list it names — it is now
   the shortcut that *selects* that list. The duplication is gone by construction for four of the
   five; only the set currently chosen is on screen under its own pill. The two Forever pills
   remain, and both select the same set.

   The pill defect underneath this one **is** fixed. `Most active` and `Least active` carried
   `pack: ""`, which emitted no data attribute at all, so they rendered as buttons and were
   ignored on every tap — a control that looks pressable and is not. Their destination, the
   league-wide Traders list, was deleted in D4b and nothing replaced it, so they are static
   `span` pills now rather than dead buttons. A generate-time assertion refuses to ship a pill
   carrying an empty destination.
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

**Fixed in `2f22d5f`:** `selectMe` and `seatData` route through one `getJson()` that checks
`res.ok` before parsing — GitHub Pages returns an HTML 404 body, so the old code threw inside
`.json()` and froze the app mid-interaction — and shows a visible message on failure.
`chapterHtml` guards `picks_in` / `picks_out`. Empty seats get copy on all four tabs instead of
a bare filter bar.
**Fixed in `f9fdb39`:** the year filter is `type="radio"` in a `role="radiogroup"`, matching the
behaviour it always had.
**Still open:** the rapid seat-switching race. Two `selectMe` calls still resolve in arbitrary
order and the last write wins. It was not in the approved slice list.

Original findings below.

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

**FIXED, `96d9218`.** `tradeDelta` memoises per `(trade, lens)` in a `WeakMap`, the tiles read
`marks.json` instead of recomputing, and `rankWide` computes each side's score once before the
dedupe and sorts on the stored key. `markChart`'s ~1,160 `applyVa` calls went to **0** — it now
reads ten precomputed rows. The remaining calls are the rows actually on screen.

`DATA_V` is also a hand-edited string literal (`:361`), so cache correctness depends on a human
bumping a letter in the same commit as a data rebuild. With a 600 s CDN cache, a forgotten bump
serves stale data with no signal. Derive it from `league.today` or a content hash at generate time.
**Still open** — it was not in the approved slice list, and every slice bumped the letter by hand
(`20260829k` → `u`), which is exactly the discipline the finding says should not be load-bearing.

---

## 6c. Accessibility and mobile

**A1–A5, A7, A7b and A7c are fixed in `f9fdb39`** (spacing follow-up in `d4997a2`). **A8 is
fixed by the signed-delta convention (§4a), 2026-08-30.** A6 was not in the approved slice list
and stands. What shipped:

- **A1** — `tradeRow` and `pickRow` wrap `row-top` in a `button.row-x-btn` and place `.detail`
  as its **sibling** inside a `.row-x` wrapper, so no button contains a button. Pick legs became
  real `<button>` elements. Clicking a player name in an open row no longer collapses it.
- **A2** — a global `keydown` handler, `Escape` closing whatever is topmost, and focus preserved
  across the wholesale `innerHTML` rebuild by re-finding the control by its `data-*` attributes.
- **A3** — `aria-expanded` on `tradeRow`, `pickRow` and `boardTape`.
- **A4** — `#whoMenu` is a real listbox: `role="option"` children, arrow keys, `Home`/`End`,
  `Escape`, focus restored to the trigger. The four tabs are a `tablist` with roving `tabindex`.
- **A5** — 44px minimum on `.who-menu button` (was 28), `#yearFilters label` (was 26),
  `button.who` and `.score-btn` (were 36), `button.pack-head` and `#scoreAs button.score-opt`.
- **A7** — `min-width: 0` on every grid track that holds text, ellipsis on names,
  `white-space: nowrap` and `flex: 0 0 auto` on the figures. Re-measured at 375px: no numeric
  cell truncates on any screen. **Names ellipsize; figures never do** — which is the right way
  round, because the figure is the product.
- **A7d** — the other half of A7, and the reason "names ellipsize" was only ever half an
  answer: with the figures safe, **all ten** display names ellipsized at 375px and 390px.
  `SF69erss`, the second-shortest name in the league, rendered as `SF69e...`; on the lopsided
  board `DarkWingDucks2023` was allotted **0px**, because the caption sharing the middle
  column sized that `auto` track to its own max-content and the two `1fr` tracks, now free to
  shrink, gave up everything. Neither state was acceptable: the row simply cannot fit
  `name + figure | margin | figure + name` inline at 390px, so the arrangement changed rather
  than the content. Below 640px the tape is one column — one full-width line per side — and
  the caption spans the row instead of sitting in the middle column. Measured per name against
  the space its line offers: **257px at 375px and 272px at 390px against 155px for the longest
  name**, versus −9px to 65px before. Zero ellipsized names and zero clipped figures across
  1,298 rendered names and 2,040 figures, at 375, 390, 431, 480, 561, 768 and 1280.
  640px is where the inline arrangement measurably fits; at 561px it still gave
  `DarkWingDucks2023` 152px against the 165px it needs.
  **The breakpoint moved to 700px on 2026-08-30**, when each side gained a signed delta (§4a):
  the wide tape then came 2.1px short at 641px and only cleared the longest name from 650px, so
  the threshold is that measured floor plus headroom — 27px spare per side against today's
  longest name and widest delta. It is a measured number, not a round one; re-measure it if
  either side ever gains another figure. Re-verified over 641, 660, 700, 760, 820, 880, 920,
  1024, 1280 and 1600px: zero manager names ellipsized, zero figures spilled.
  The arrow was direction rather than data, and it is **gone** as of §4a: once both sides carry
  a signed figure the glyph was a third encoding of what the sign and the colour already say.
  `tapeMargin()` survives as the single emitter, now shared by every screen and not just the
  three tape rows, so the convention cannot drift between them.
  `.day-in-vals` in the Recent Trade card carries the same name-and-figure pair and was fixed
  with it: the pair now wraps, so the figure drops to its own line only when the name needs the
  width. Stress-testing that card also turned up the one box on home with no wrap guard at all —
  the card's `X vs Y` headline, whose ink escaped and took `body.scrollWidth` to **447 at a
  375px viewport** while `documentElement.scrollWidth` still read 375. Pre-existing, identical
  on `main`, fixed here with `overflow-wrap: anywhere`. The two gold cards still measure 136/136.
- **A7b** — the four tabs are `flex: 1 1 0` with `flex-wrap: nowrap` and share one row at 375px.
- **A7c** — a `max-width: 460px` media query shrinks the brand and the picker so the header's
  right edge sits inside the viewport. Re-measured on the deployed page after the fact: the
  Team button's right edge is **374px of 390** and **359px of 375**, and `body.scrollWidth`
  equals the viewport at both. A7c is genuinely closed and was **not** implicated in A9 below.

**A9 — the same slice regressed the seat picker, and it is fixed in `f21a64b`.** `f9fdb39` also
changed `h1.brand` from `overflow: visible` to `overflow: hidden`, in the same hunk that gave
`h1.brand a` its ellipsis. `#whoMenu` is absolutely positioned against `.who-wrap`, which lives
inside `h1.brand`, so the clip cut a **472.6px** menu down to the header's **44px** content box:
one option of eleven painted and hit-testable. The clip also made `h1.brand` a scroll box, so
`paintWho`'s `focus()` on the selected option scrolled it **53px** and took the home icon and the
brand out of view. Note `7f97711` had already set `overflow: visible` for exactly this reason
("keep the team list on screen"), making this the second landing of the same clip — so the fix
adds a generate-time assertion beside the regex-escape guards. Neither the ellipsis nor A7c needs
the clip: with it removed, `body.scrollWidth` still equals the viewport at 375px and 390px.

*Method note, for §3a.* `document.documentElement.scrollWidth` reported the viewport width at
every step here and would have hidden any overflow; `document.body.scrollWidth` is the one that
moves. And `getBoundingClientRect()` does **not** reflect ancestor clipping — the menu reported a
full 472.6px box while only 44px was on screen. What caught it was `elementFromPoint` at each
option's centre (1 of 11 hittable, 11 of 11 with the clip removed, 1 again when it was restored).

**A10 — the Champions Path detail runs 1,051px wide at a 375px viewport. FIXED in the formatting
pass — see §6d, defect F1.** The ruling asked for below was taken: a pick list is not a figure, so
it stacks under its label and wraps, in a `.leg.list` variant that leaves the trade bags' rule
alone. Re-measured at every width: `body.scrollWidth` equals the viewport on that screen at 320,
375, 390, 430, 768 and 1280. The original finding follows.
Found while sweeping every screen during the navigation pass, on a screen that pass did not
otherwise change. `bagLine` puts a `·`-joined pick list into a `<b>` inside `.leg`, and
`.leg > b { flex: 0 0 auto; white-space: nowrap; }` — the rule that keeps a *figure* from
ellipsizing — refuses to wrap it. "Picks in" for the 2025 chapter measures **1,012px** on its own.

Measured on `origin/main` (`b57c820`) and on the navigation branch: `body.scrollWidth` **1051**
at both 375px and 390px, identical on both builds, so it is **pre-existing and not a regression**.
`documentElement.scrollWidth` reads 375 throughout — §3a again.

Left unfixed deliberately. `.leg > b` is shared with the trade bags, where "figures never
ellipsize" is the point, so the fix has to be scoped to the chapter (`overflow-wrap: anywhere`
on a `.chapter .leg > b`, or a wrapping list rather than one nowrap string) and that is a change
to a screen the navigation pass was not given. It needs a ruling, not a drive-by.

### The back-affordance sweep, 2026-08-30

Every place a user drills in, and whether they can get out. Done as part of the full-screen trade
work; the ruling applied was *add a control only where a user is genuinely stuck, and never a
second control that says what the home icon already says*.

| Drill-in | Before | Now |
| --- | --- | --- |
| Full-screen trade (`?view=trade`) | did not exist | **`← Back` chip added.** Its parent varies — league home or the trades list — so it cannot be inferred from the screen. Escape does the same thing. |
| League trades list (`?view=trades`, no seat) | did not exist | **Nothing added, on purpose.** Its parent is always league home, which is what the home icon in the header already does. |
| Champions Path detail | `All champions` chip | **Kept, rewired.** It pushed a fresh titles entry, so browser Back returned to the detail the chip claimed to have left. Both pop the same entry now. |
| Champions Path list | home icon only | Unchanged. Parent is league home; the home icon is that. |
| Partner detail (`partnerName`) | **stuck.** No toggle, and the Partners tab could not clear it because `render()` only reset `partnerName` when `view !== "partners"` — which it never was. | **Second tap on the open partner closes it**, the Partners tab clears it, and Escape closes it. No new chrome: the partner list stays on screen above the detail, so this is a dismiss, not a navigation. |
| Expanded trade row, per-seat Trades tab | toggle + Escape | Unchanged, and deliberately still inline — see the note in §10.7. |
| Expanded draft pick / draft row | toggle + Escape | Unchanged. Not stuck. |
| Year filter, Drafts filter, Score as | outside click + Escape | Unchanged. Not stuck. |
| Packs, style tiles, mark chart | toggle + Escape | Unchanged. Not stuck. |
| A selected seat | home icon | Unchanged, plus browser Back now leaves the seat. |

The home icon was checked as present, 44×44 and at 16,16 on **every** screen above, at 375px and
390px, and it clears the seat and returns to league home from all of them.

**A11 — the seat menu scrolled on a short phone, and the option that scrolled it was redundant.
FIXED, this pass.** The picker carried eleven options: a `Team` row whose only job was
`clearLeague()`, then the ten managers. Eleven at the A5 minimum of 44px is 494px of content
against a `max-height: min(56dvh, calc(100dvh - 72px))` cap, which is **473px on an 844px phone
and 373px on a 667px one** — so on the most common phone in the league fewer than nine of eleven
managers were reachable without scrolling a 168px-wide menu.

Both halves were wrong, and the redundant one is what made the other affordable. `Team` is the
back-affordance ruling above in miniature: a second control saying what the home icon already
says. Dropping it takes the list to 10 × 44 + 10 = **450px**, and the cap is now sized to that
list — `min(calc(10 * 44px + 16px), calc(100dvh - 88px))` — rather than to a fraction of the
screen. The second term is the room genuinely below the button (16px body padding, the 44px brand
row, the 4px offset, 24px of clearance) and only bites in landscape, where nothing fits ten rows.

**The 44px did not move, and must not.** A5 raised these from 28px precisely because this is the
most-used control in the app; shrinking them is the cheapest way to make any future list fit and
it is the wrong one. The build now fails if `.who-menu button` stops declaring 44px, if the cap
reverts, if a `Team` option reappears, or if an eleventh seat would need more than the cap allows.

Measured with the menu open, on a server whose bytes were checksummed against the on-disk build
(§3a trap 2) and whose page carried this pass's `DATA_V`:

| Viewport | `scrollHeight` | `clientHeight` | Options ≥ 44px | Hit-testable | Fully in viewport |
| --- | ---: | ---: | ---: | ---: | ---: |
| 375 × 568 | 448 | 448 | 10 of 10 | 10 of 10 | 10 of 10 |
| 390 × 667 | 448 | 448 | 10 of 10 | 10 of 10 | 10 of 10 |
| 390 × 844 | 448 | 448 | 10 of 10 | 10 of 10 | 10 of 10 |
| 1280 × 900 | 448 | 448 | 10 of 10 | 10 of 10 | 10 of 10 |

Hit-testing is `elementFromPoint` at each option's centre, not `getBoundingClientRect` — the A9
method note again: the rect reported a full 472.6px box while 44px was on screen. `1 of 11` is
what A9 looked like; `10 of 10` is what this looks like. `body.scrollWidth` equals the viewport
at 375 and 390 throughout (`documentElement.scrollWidth` would have, too, and proves nothing).

The order is now last season's finish, derived in `title-path.mjs` from the winners bracket's
placement games with regular-season record for the teams it does not place, and written as
`place` onto `members.json`. It is **not** needle data and never enters the value book, VA, the
lens windows, `today_delta` or a partner grade; `apply-value-adjust.mjs` was not run. First place
carries a gold `#e0b44c` crown that is `aria-hidden`, so the option's accessible name is still
exactly the manager's name — confirmed against the computed accessibility tree, all ten.

**Keyboard and focus on the new screens — what was done, and what was not.** Done: every new
control is a real `<button>`, so it is in the tab order and fires on Enter and Space with no extra
code; a navigation moves focus to the destination screen's `<h2 class="screen-h" tabindex="-1">`
and scrolls to the top; `focusSelector` recognises that heading, which fixed a bug the pass
introduced and then measured — the *second* render behind a screen (the seat file arriving, a vote
settling) threw focus back to `<body>` a moment after the navigation had placed it, so the
observed landing was `BODY` on four of six steps and is `H2.screen-h` on all of them now; a screen
with no heading of its own (league home, a seat's home) lands on `#app`, which is now
`tabindex="-1"`, rather than on `<body>`; Escape leaves the full-screen trade and closes an open
partner detail.

Not done, and still open from A2–A4: `render()` still replaces `app.innerHTML` wholesale rather
than patching, so focus survives only by being re-found afterwards. There is no focus trap and no
`aria-live` region, so the vote acknowledgement on the league list is announced only because focus
lands on the heading above it. The 288-row list has no roving `tabindex` — it is 288 tab stops.
None of that was in scope here.

Original findings below.

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
| A8 | P2 | **Three colour languages in one Drafts row — FIXED 2026-08-30 (§4a).** Was: `pickRow` coloured the player's name by pick surplus, the origin label by own-vs-acquired, and the middle number always green, so a red player name read as "bad player" rather than "the pick underperformed". Now the name is plain ink, the middle number is gone, and green/red belongs to the signed surplus alone. The origin label keeps its green/gold because that is provenance, not value. |
| — | — | **Contrast is fine.** `--muted` 6.59:1, `--dim` 5.38:1, `--red` 4.91:1, `--green` 10.41:1, gold 9.46:1 — all clear AA. Safe-area handling and `viewport-fit=cover` are correct. |

Also dead CSS: `.hero` / `.hero b` (`:91`) is never emitted — the original product promise of one
big number survives only as a stylesheet rule. Plus `a.back`, `.day-scroller`, `.day-chip`,
`.draft-head`, `.filter-hint`. **All removed in `4653091`.** Note that deleting `.hero` does not
answer the hero question — it only stops pretending the answer is already in the file (§10.1).

---

## 6d. The formatting pass — every box, button and cell, measured

Asked for as *"ensure that text on each box and button and cell is formatted properly to fit and
show all of the text clearly and consistently"*. Done as a measurement, not a look: the real page
driven through **22 screen states at 320 / 375 / 390 / 430 / 768 / 1280**, twice — once on the
committed data and once with a 27-character manager name and a 33-character player name
substituted, because the league's real worst case (`DarkWingDucks2023`) happens to fit in several
places where the layout is still broken.

**Sequencing.** Two other passes were in flight when this was scoped. `cursor/trade-row-layout-af37`
(the tape restack, A7d) and `cursor/trade-screen-nav-af37` (the full-screen trade, the league
trades list, P1-8) both landed on `main` mid-inventory, at `ab7ef73` and `047f573`. This branch was
rebased onto them and re-baselined against `66d924b` rather than measuring the older page; the two
new screens are in the numbers below. The seat-picker rebuild then landed too (`dcbb6cd`: managers
only, last season's order, the champion crowned), which touches the one control this pass had also
widened, so this branch was rebased a second time and every number below is from the merged result.
The two changes turned out to want the same thing from different directions — F7 widened the menu
so a long name is not cut, and `dcbb6cd` capped its height so all ten fit without scrolling — so
the merge keeps both the 220px width and the no-scroll cap.

`cursor/signed-deltas-af37` then landed as well (`cd49002`), which is the branch §6d.4 had
deliberately left the `+`/`−` prefix drift to. It restacks the tape row around a signed delta per
side and relabels the seat trigger to a constant "Teams" at `width: max-content`. That last part
retired one of this pass's own fixes: F5 pinned the picker to 108px at 320px to buy the brand back
the width it needed, and a `max-content` picker on a five-letter label asks for 78px where it used
to take 128px, so the pin would only have handed the space back. It was removed rather than left
to fight the new rule, and the numbers below were taken again on the merged result — a third full
sweep, not an edit of the second.
The row restack is why the tape rows are absent from the table: it had already fixed them, taking
clipped names from 1,054 findings to 24.

### 6d.1 Method, and why it is stated

Every trap in §3a applies to this pass, so each one has a specific counter:

| Trap | Counter used here |
| --- | --- |
| `documentElement.scrollWidth` clamps to the viewport | Every overflow number below is `document.body.scrollWidth`. The `documentElement` figure is printed beside it in the table, and it reads a clean 320/375/390 over a document that is genuinely 1,051px wide. |
| A dead server means measuring another build | A purpose-built static server that exits non-zero on `EADDRINUSE` instead of dying quietly, stamps `x-serve-root` and its pid on every response, on a port confirmed free. The served bytes are md5-checksummed against the on-disk `index.html` **before and after** every run, and every screen state records the `DATA_V` it saw. A run that saw two different values fails rather than reporting. |
| `scrollWidth` is 0 on an inline box | Clipping is only asserted where the element's own computed `overflow-x` is `hidden` or `clip`; wrapping defects are measured from `Range.getClientRects()`, which gives a real ink box for inline content. |
| A clipped element's ink legitimately exceeds its border box | Container overflow is only reported where `overflow-x` is `visible`, so an ellipsized name is not counted as a spill. |
| A visually-hidden box is clipped on purpose | New. `.sr-only` on the seat heading is the standard screen-reader pattern: a 1px box with its overflow hidden, so the words reach a screen reader without reaching the screen. Read naively it is the worst clip in the app — 55px of text in 1px, on twelve screens at every width, 144 findings and 144 more as a vertical clip. A box a pixel wide or tall is not showing text to anyone, so the probe skips it. |
| An invisible hit area reads as both an overflow and a small target | New, and it produced eight false P0s on the first post-rebase run. `button.all-trades` is a 26px pill whose 44px tap area is an unpainted `::after { content: ""; inset: -10px }`, which is real to a finger and invisible to an eye. Naively that pill measures a 10px spill it has no content for, and a 26×95px target, and its parent row inherits the spill. The probe now discounts an absolutely positioned pseudo-element that paints nothing — no background, border, shadow or content — from overflow, and counts it towards the tap target instead. Both readings were wrong in opposite directions, and the label was in fact fitting exactly: 93px of content in 93px of box. |
| `preview.html` renders its iframe at 366px, not 390px | Not used. All widths are true viewports via `Emulation.setDeviceMetricsOverride`. |

A build was **not** measured while it was being edited: the baseline lives in its own worktree on
its own port and is never written to. The first attempt at this got that wrong — the working build
was rebuilt underneath a running measurement — which is why the end-of-run checksum exists.

### 6d.2 The inventory, before

`DATA_V = 20260830nv`, `main` at `66d924b`. Severity is by the house rule: a clipped **figure**
first, then anything escaping the viewport, then text truncated past usefulness, then awkward
wrapping. *(synthetic only)* marks a defect that real data hides.

#### Document wider than the viewport

| Screen | Data | Viewport | `body.scrollWidth` | `documentElement.scrollWidth` |
| --- | --- | ---: | ---: | ---: |
| Champions Path · detail | real | 320 | **1051** | 320 |
| Champions Path · detail | real | 375 | **1051** | 375 |
| Champions Path · detail | real | 390 | **1051** | 390 |
| Champions Path · detail | real | 430 | **1051** | 430 |
| Champions Path · detail | real | 768 | **1051** | 768 |
| Champions Path · detail | 30-char names | 320 | **1051** | 320 |
| Manager home · style tile | 30-char names | 320 | **339** | 320 |
| Champions Path · detail | 30-char names | 375 | **1051** | 375 |
| Champions Path · detail | 30-char names | 390 | **1051** | 390 |
| Champions Path · detail | 30-char names | 430 | **1051** | 430 |
| Champions Path · detail | 30-char names | 768 | **1051** | 768 |

#### Elements

| Sev | Element | Defect | Screens | Widths | Worst measurement | Sample |
| --- | --- | --- | --- | ---: | --- | --- |
| P0 | `div#app > div.chapter` | overflows its box | Champions Path · detail | 320 375 390 430 768 1280 | 1034px of content in a 286px box @320px | Previous season 18 trades · league |
| P0 | `body > div#app` | overflows its box | Champions Path · detail, Manager home · style tile +2 more | 320 375 390 430 768 1280 | 1035px of content in a 288px box @320px | ← All champions 2025 champion SF69 |
| P0 | `div.chapter > div.leg` | overflows its box | Champions Path · detail | 320 375 390 430 768 1280 | 684px of content in a 258px box @320px | Picks in 2027 2nd · 2027 2nd · 202 |
| P0 | `div.leg > b` | escapes the viewport | Champions Path · detail | 320 375 390 430 768 | right edge 715px in a 320px viewport @320px | 2027 2nd · 2027 2nd · 2024 4th · 2 |
| P0 | `div.mark-chart > div.mark-bar` | overflows its box *(synthetic only)* | Manager home · style tile | 320 | 310px of content in a 262px box @320px | 5. BartholomewCuckleshremp2026 Ahe |
| P0 | `div.mark-bar > div.mark-bar-top` | overflows its box *(synthetic only)* | Manager home · style tile | 320 | 310px of content in a 262px box @320px | 5. BartholomewCuckleshremp2026 Ahe |
| P0 | `div#app > div.mark-chart` | overflows its box *(synthetic only)* | Manager home · style tile | 320 | 322px of content in a 286px box @320px | Ahead or behind Since trade 1. Bub |
| P0 | `button.row > div.row-top` | overflows its box *(synthetic only)* | Partners tab, Partners tab · detail | 320 | 285px of content in a 262px box @320px | BartholomewCuckleshremp2026 5 comp |
| P0 | `div.mark-bar-top > span.lab.pos` | escapes the viewport *(synthetic only)* | Manager home · style tile | 320 | right edge 339px in a 320px viewport @320px | Ahead |
| P0 | `div#app > button.row` | overflows its box *(synthetic only)* | Partners tab, Partners tab · detail | 320 | 297px of content in a 286px box @320px | BartholomewCuckleshremp2026 5 comp |
| P0 | `div.nav > button.tab` | overflows its box | Manager home, Manager home · style tile +8 more | 320 | 70px of content in a 64px box @320px | partners |
| P0 | `div.nav > button.tab.on` | overflows its box | Partners tab, Partners tab · detail | 320 | 70px of content in a 64px box @320px | partners |
| P1 | `a.champ-alert > div.date` | clipped *(synthetic only)* | League home, Brand header · seat menu +2 more | 320 375 | needs 331px, has 262px @320px | Top scorer · Christopher Vanderhoo |
| P1 | `div#whoMenu.who-menu > button` | clipped *(synthetic only)* | Brand header · seat menu | 320 375 390 430 768 1280 | needs 234px, has 166px @320px | BartholomewCuckleshremp2026 |
| P1 | `div.side-line > span.names.neg` | clipped *(synthetic only)* | League trades list, League home · packs +4 more | 320 375 768 | needs 278px, has 211px @320px | Christopher Vanderhoosenbergerson |
| P1 | `div.side-line > span.names.pos` | clipped *(synthetic only)* | League trades list, League home · packs +4 more | 320 375 768 | needs 278px, has 211px @320px | Christopher Vanderhoosenbergerson |
| P1 | `div.side-line > span.names` | clipped *(synthetic only)* | Drafts tab, Drafts tab · filter +2 more | 320 375 | needs 278px, has 211px @320px | Christopher Vanderhoosenbergerson |
| P1 | `h1.brand > a` | clipped | League home, Brand header · seat menu +20 more | 320 | needs 147px, has 100px @320px | CuckleChunckle |
| P1 | `button.vote-opt > b` | clipped | Trade review screen, Trade review · hops, League trades · row open | 320 | needs 123px, has 101px @320px | KingHenryXXVI |
| P1 | `div.lens-row-left > div.caption` | clipped | Trades tab, Trades tab · year filter +2 more | 320 | needs 79px, has 66px @320px | Filter by year |
| P2 | `h1.brand > a` | tap target under 44px | League home, Brand header · seat menu +20 more | 320 375 390 430 768 1280 | 100×27px @320px | CuckleChunckle |
| P2 | `div.ticker-track > button.bubble` | tap target under 44px | League home, Brand header · seat menu +2 more | 320 375 390 430 768 1280 | 231×40px @320px | Champion 2025 · SF69erss |
| P2 | `button.score-opt > span` | orphan last line | League home · Score as | 320 375 390 430 768 1280 | 2 lines, last is "deals." at 33px of 215px @320px | Who won after 2 years. Hides young |
| P2 | `div.vote > p.caption` | orphan last line | Trade review · hops, Trade review screen, League trades · row open | 320 375 | 4 lines, last is "book." at 34px of 251px @320px | Your vote, on this device only — t |
| P2 | `div#app > p.caption` | orphan last line | League trades list | 320 430 768 | 4 lines, last is "on." at 19px of 274px @320px | Every trade on the league tape, ne |
| P2 | `div.stat > span` | orphan last line | Champions Path · detail | 320 375 390 430 | 2 lines, last is "out" at 19px of 90px @320px | player 17 in / 11 out |
| P2 | `button.mark > span` | orphan last line | Manager home, Manager home · style tile | 320 375 430 1280 | 7 lines, last is "Fair." at 22px of 106px @320px | You came out ahead vs 4 partners.  |
| P2 | `div.hop > span` | orphan last line | Trades tab · hops, Drafts tab · pick open, Trade review · hops | 320 430 768 1280 | 3 lines, last is "held" at 27px of 163px @320px | 2026-08-19 · TedCumberbatch → ARae |
| P2 | `button.leg > span` | orphan last line | Drafts tab · pick open | 320 | 2 lines, last is "(ARae)" at 40px of 181px @320px | 2026 3rd · became Ted Hurst (ARae) |
| P2 | `div.path-hero > p.thesis` | orphan last line | Champions Path · detail | 390 | 3 lines, last is "roster." at 47px of 315px @390px | Finished 2nd in points. Repeat cha |
| P2 | `div.chapter > div.caption` | orphan last line | Champions Path · detail | 320 430 | 2 lines, last is "×2" at 70px of 338px @430px | Traded with TrumanCooper ×5 · Bubb |
| P2 | `button.mark.neg > span` | orphan last line | Manager home, Manager home · style tile | 430 768 | 2 lines, last is "deal." at 27px of 152px @430px | -18,028 net, about -291 per deal. |
| P2 | `button.mark.neg.on > span` | orphan last line | Manager home · style tile | 430 | 2 lines, last is "deal." at 27px of 152px @430px | -18,028 net, about -291 per deal. |
| P2 | `div.hops > div.date` | orphan last line *(synthetic only)* | Drafts tab · pick open | 375 390 | 2 lines, last is "ARae" at 31px of 286px @375px | Christopher Vanderhoosenbergerson  |
| P2 | `div.bag > h3` | orphan last line *(synthetic only)* | Drafts tab · pick open | 430 | 2 lines, last is "2,500" at 46px of 367px @430px | Christopher Vanderhoosenbergerson  |

### 6d.3 What was fixed

| # | Defect | Fix |
| --- | --- | --- |
| **F1** | **A10.** `bagLine` puts a `·`-joined pick list into `.leg > b`, which is `white-space: nowrap; flex: 0 0 auto` because everywhere else that `<b>` is a figure. Neither wrapped nor shrank: **1,051px inside every viewport from 320 to 768**, and the `Picks in` label beside it collapsed to `min-content` and rendered **one letter per line**. | `.leg.list` — the list stacks under its label and wraps. Scoped to the variant, so the trade bags' "figures never wrap" rule is untouched. |
| **F2** | The champion card's championship and top-scorer lines each end in a **score**, on one `nowrap` line. The figure is furthest from the left edge, so it is what a long name pushes off first: a 33-character player name took `45.6` with it entirely. | `champFinalCaption` returns the words and the figure separately; `.champ-fig` pins the figure and lets only the name ellipsize. Both lines still say what they said. |
| **F3** | `min-width: 0` coverage. The guards existed on the tape row and the gold cards only. Without one, a 30-character name pushed the mark chart's label to **339px in a 320px viewport** and spilled the Partners row out of its own card. | Guards added to `.row-top`, `.bags`, `.hop`, `.mark-bar-top`, `.pack-head` and `.stats`. The live page now carries **25**, up from 16. |
| **F3b** | The guard is necessary, not sufficient: a name with no space in it offers no soft wrap opportunity, so `.row-top` still spilled 23px. | `.row-top:not(.tape) .names { overflow-wrap: anywhere }`. These rows carry one name and one figure and can afford a second line — the opposite call from the tape, which is dense and ellipsizes. |
| **F4** | Figures that could wrap after their own minus sign: `.row-top`'s margin, `.hop`'s value, the mark chart's label. | `flex: 0 0 auto; white-space: nowrap` on each, asserted at generate time. |
| **F5** | **320px, which nothing here had ever been checked at.** The brand read `CuckleChunc…` (100px of the 147px it needs); `partners` spilled its own nav tab by 6px; `Filter by year` was cut to `Filter by ye…`, which names nothing; the two vote buttons side by side clipped `KingHenryXXVI`. | One `max-width: 360px` block: the nav gaps and tab padding shrink, the Score as button takes its own line, the vote options stack, and the brand steps down one size. No font was shrunk to win space except the brand's own. The part that pinned the picker to 108px was **removed on the final rebase** — the trigger became `width: max-content` on a constant label and now measures 78px, so pinning it would only give the space back. The brand's step is kept: at 1.2rem the title needs 147px of the 158px now available, which fits by 11px, and 11px is under one character of headroom on a line that has clipped twice (A7c). |
| **F6** | A bag heading was `<who> received · 12,345` in one wrapping line, so a long name put the bag's **total alone on a second line**, reading as a figure belonging to nothing. | Built as the same pinned label-and-figure pair as a tape row, a partner row, a hop and the champion card. One shape for one role. |
| **F7** | The seat menu cut a 27-character name to `BartholomewCuckl…` at 168px, at every width. | 220px. It floats over the page and is anchored to the right edge, so it is not bound by its trigger, and it still yields to the viewport. |
| **F8** | Two sub-44px targets in a file that enforces 44px everywhere else (A5's rule): the ticker pills at **40px**, and the brand link at **27px tall** next to a 44px home button. | 44px on both. The line box carries it on the brand link rather than padding, which would push the ellipsis off the text. |
| **F9** | Sentences that explain a value — style tiles, stat boxes, Score as options, vote captions — stranded a single short word on the last line (`Fair.`, `deals.`, `out`) inside boxes small enough that the orphan reads as a fault. | `text-wrap: pretty` on those roles. Where it is unsupported the text wraps exactly as it does today, so this can only improve. |

### 6d.4 What was deliberately left

- **`+` prefix drift — left to another branch, and that branch has since landed.** A positive
  figure was `+1,234` on the style tiles and the Value Adjustment line, and `1,234` on the Partners
  tab, the home partner teaser, the Drafts header and Best/Worst deal — all of them green either
  way. Real drift, and worth one helper. It was left alone because `cursor/signed-deltas-af37` was
  actively rewriting exactly these numbers, and two branches editing the sign of the same value is
  how it ends up rendered twice. That branch merged during this pass and did it properly: one
  `tapeMargin()` emits every delta in the app as a single `.delta.pos` / `.delta.neg` span. The
  drift is closed, by the branch that owned it. Deferring it was the right call and is recorded
  here so the deferral is not mistaken for an oversight.
- **Dates and thousands separators are already consistent** and were checked rather than assumed:
  every date on screen is ISO `YYYY-MM-DD` through `esc()`, and every figure goes through one
  `fmt()`. Nothing to fix.
- **Names still ellipsize under synthetic 30-character stress** on the tape rows, the seat menu and
  the champion card. That is the house rule working, not a defect: the figure is intact in every
  one of those cases, and a long proper noun is the thing that is supposed to give.
- **Orphans in flowing prose** — the league trades intro, the vote caption at one width. A
  paragraph ending in a short word is typography, not a rendering fault; only the ones inside small
  fixed boxes were treated.
- **A6** (marquee pause) and **A8** (three colour languages in a Drafts row) are unchanged: both are
  behaviour and colour, not text fitting.

### 6d.5 After, and the assertions that hold it

#### Document wider than the viewport

| Screen | Data | Viewport | `body.scrollWidth` | `documentElement.scrollWidth` |
| --- | --- | ---: | ---: | ---: |

#### Elements

| Sev | Element | Defect | Screens | Widths | Worst measurement | Sample |
| --- | --- | --- | --- | ---: | --- | --- |
| P1 | `div.date.champ-fig > span` | clipped *(synthetic only)* | League home, League home · seat picker open +2 more | 320 375 390 | needs 302px, has 230px @320px | Top scorer · Christopher Vanderhoo |
| P1 | `div.mark-bar-top > span.names` | clipped *(synthetic only)* | Manager home · style tile open | 320 375 | needs 277px, has 211px @320px | 5. BartholomewCuckleshremp2026 |
| P1 | `div.side-line > span.names` | clipped *(synthetic only)* | Drafts tab, Drafts tab · filter panel open +4 more | 320 768 | needs 296px, has 258px @768px | Christopher Vanderhoosenbergerson |
| P1 | `button > span.who-name` | clipped *(synthetic only)* | League home · seat picker open | 320 375 390 430 768 1280 | needs 210px, has 194px @320px | BartholomewCuckleshremp2026 |
| P2 | `div#app > p.caption` | orphan last line | League trades list | 320 430 768 | 4 lines, last is "on." at 57px of 274px @320px | Every trade on the league tape, ne |
| P2 | `div.leg.list > b` | orphan last line | Champions Path · detail | 320 375 390 430 1280 | 5 lines, last is "2nd" at 59px of 238px @320px | 2025 3rd · 2025 3rd · 2026 4th · 2 |
| P2 | `button.mark.neg > span` | orphan last line | Manager home, Manager home · style tile open | 320 430 768 | 4 lines, last is "3." at 25px of 114px @320px | 5 partners came out ahead vs you.  |
| P2 | `div.vote > p.caption` | orphan last line | Trade review · full screen, Trade review · leg hops open +1 more | 375 | 3 lines, last is "book." at 70px of 278px @375px | League tally as of 03:27 AM; votes |
| P2 | `div.hop > span` | orphan last line | Drafts tab · pick expanded, Trade review · leg hops open +1 more | 375 430 1280 | 3 lines, last is "used" at 36px of 189px @375px | 2025-08-14 · DarkWingDucks2023 → T |
| P2 | `div.chapter > div.caption` | orphan last line | Champions Path · detail | 430 | 2 lines, last is "×2" at 70px of 338px @430px | Traded with TrumanCooper ×5 · Bubb |
| P2 | `button.mark.pos > span` | orphan last line | Manager home, Manager home · style tile open | 768 | 2 lines, last is "graded)." at 68px of 336px @768px | Rookie picks usually turn into mor |
| P2 | `button.mark > span` | orphan last line | Manager home, Manager home · style tile open | 1280 | 2 lines, last is "picks." at 62px of 368px @1280px | 18 players sold for picks vs 13 th |
| P2 | `h3 > span` | orphan last line *(synthetic only)* | Drafts tab · pick expanded | 375 430 | 3 lines, last is "trade" at 40px of 232px @375px | Christopher Vanderhoosenbergerson  |
| P2 | `div.hops > div.date` | orphan last line *(synthetic only)* | Drafts tab · pick expanded | 375 390 | 2 lines, last is "TipsUp" at 42px of 286px @375px | Christopher Vanderhoosenbergerson  |

Across all six widths, both data sets, every screen:

| Measure | Before | After |
| --- | ---: | ---: |
| Screens where `body.scrollWidth` exceeds the viewport | 11 | **0** |
| Worst `body.scrollWidth` | **1,051px** | 0 over |
| Elements escaping the viewport | 11 | **0** |
| Elements overflowing their own box | 70 | **0** |
| Tap targets under 44px | 312 | **0** |
| Clipped **figures** | 0 | **0** |
| Clipped text elements | 112 | 31 |
| Orphaned last lines | 87 | 56 |
| Vertically clipped elements | 0 | **0** |

Per width, worst case of the real and synthetic runs:

| Viewport | max `body.scrollWidth` | escapes | box overflows | clips | sub-44px | orphans |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 320px | 1051 → **320** | 3 → **0** | 40 → **0** | 81 → **10** | 52 → **0** | 18 → **8** |
| 375px | 1051 → **375** | 2 → **0** | 6 → **0** | 17 → **6** | 52 → **0** | 17 → **12** |
| 390px | 1051 → **390** | 2 → **0** | 6 → **0** | 1 → **5** | 52 → **0** | 9 → **3** |
| 430px | 0 over | 2 → **0** | 6 → **0** | 0 → **1** | 52 → **0** | 12 → **15** |
| 768px | 1051 → **768** | 1 → **0** | 6 → **0** | 12 → **8** | 52 → **0** | 15 → **10** |
| 1280px | 0 over | 1 → **0** | 6 → **0** | 1 → **1** | 52 → **0** | 16 → **8** |

Every remaining clip is a **proper noun with a real ellipsis**, and none is truncated past
recognition: the six distinct clipped elements show between **76% and 95%** of their string, the
worst being `Top scorer · Christopher Vanderhoosenbergers…` at 230 of the 302px it wants — with
its score pinned and whole beside it, which is the entire point of F2. **Nothing numeric clips
anywhere, in either data set, at any width**, and nothing clips vertically.

Four of the six only appear under the synthetic 27- and 33-character names; the real league
produces two, both at 768px only. The count fell from 61 to 31 between the two final runs without
this branch changing: the signed-delta tape restack that landed on `main` in between moved the
stacked-row breakpoint to 700px, which fixed side-line names this pass had left ellipsizing.

**Where the clip count rises it is the fix, not a regression.** Read the selectors, not the count:
`a.champ-alert > div.date` clipped as a whole line and the *score* was the part lost;
`.champ-fig > span` now clips the *name* by 72px with the score pinned and whole. `.mark-bar-top`
stopped spilling 48px past the viewport and started ellipsizing a name instead. Each of those is a
worse number and a better page — a defect converted from "the value is gone" into "the name is
shortened", which is the trade the house rule asks for. Nothing numeric clips in either column.

**Held by assertions, not by care.** Every rule above is one deletion away from returning silently,
because none of them changes what the page *says* — only whether you can read all of it. So
`generate-page.mjs` now fails the build if `.leg.list`, `.champ-fig`, the bag header pair, the
`max-width: 360px` block or any of the `min-width: 0` guards go missing, and separately if any of
the three rules that **pin a figure** is removed. Verified by deleting one and watching the build
fail. And in the page, 24 checks at 320/375/390/430 for what this pass was told not to break —
`h1.brand` unclipped, all eleven seat options laid out at 44px, the two gold cards equal to the
pixel, both champion lines with their figures whole, no green loss margin across 288 league rows,
no sub-44px target, `body.scrollWidth` equal to the viewport. The same script fails **8 of those
24** against the build before this branch, so the checks have teeth.


---

## 7. Docs drift (what the SDD says vs what ships) — **FIXED, this commit**

`docs/UI_SDD.md` was rewritten against the shipped generator rather than patched: five windows in
a Score as dropdown, four tabs, the gold alert row, packs, Champions Path, VA, the row structure,
the deep-link contract, the trimmed payload, and the phone/keyboard rules. `PRODUCT.md`'s today
clock now states the 40/60 KTC blend and retired→0, and its VA section states the N-way rule.
`ARCHITECTURE.md` was updated to the seven-step pipeline and the current data shapes.
`TRACKER_SDD.md` had its Best/Worst row corrected.

Original finding below.

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
| D1 | **Rostered cheap players: 0 or flatten?** | **RULED, shipped `452d5db`.** ~~`noTeam && (tinyRaw \|\| tinyFlat)`~~ — plain AND would have priced Ryan Fitzpatrick at 2,014. Shipped rule is **not on the KTC board AND no NFL team → 0**. See P0-5. |
| D2 | **VA on 3-team trades.** | **RULED, shipped `452d5db`.** ~~Union of the other bags~~ — that does not restore zero-sum. **VA is 0 on any trade with more than two seats.** See P0-6. |
| D3 | **Where does derived value live?** | **RULED: pipeline owns all arithmetic, browser only formats.** Half shipped in `96d9218` — one `partnerPer`, one grade threshold, one today clock, precomputed `marks.json`, memoised `tradeDelta`. See D3a for the half that did not. |
| D4 | **Does the Home hero return, and do Best 10 / Worst 10 come back?** The board screen already works and is merely unreachable; `.hero` CSS survives with nothing emitting it. | ~~Restore Best/Worst as a real screen (cheap — delete the two lines that force `view = "home"`), and either restore the hero or formally retire it.~~ **Best/Worst half REVERSED by user decision 2026-08-30 — see D4a. The hero question is still open.** |

### D3a — the half of D3 that did not ship: one flat row per trade per lens

The single-source **helpers** landed. The single-source **data contract** did not, and the split
is deliberate rather than an oversight, so here is exactly what remains and why.

**Shipped.** `partnerPer()` feeds every partner number. `GRADE_EVEN` is the only threshold in the
browser. `dayAlert` and everything else read one clock. `marks.json` replaced the ten-seat
download. `tradeDelta` is memoised. Those are the wins that do not require the browser and the
pipeline to renegotiate what a trade looks like.

**Not shipped.** The browser still recomputes VA from legs in `applyVa`, because the payload
still ships five near-duplicate leg lists per trade — one per window — rather than one leg list
plus five values. Collapsing that is worth roughly another 1.2 MB and would let `applyVa` be
deleted outright, but it changes the shape every render path reads, and Slices B, D, E and F were
already all editing `generate-page.mjs` in sequence. Landing a contract change on top of them
would have meant re-verifying every screen against a payload no invariant script yet understood.

**The concrete proposal, for a later pass.** A trade ships:

```
{ transaction_id, date, others, incomplete,
  legs: [ { key, label, kind, became, flag,
            v: { t0, y1, y2, y3, all }, today } ],
  sent: [ ...same shape... ],
  w:    { t0: {got, sent, va, va_sent}, y1: {...}, ... } }
```

One leg list. Five values per leg instead of five copies of the leg. The per-window totals and
VA are precomputed, so `sideOf(t)` becomes an index into `w[lens]` and `applyVa` disappears from
the browser along with the standing "must stay numerically identical" check.

**Do this only with the invariant script rewritten first**, against the new shape, and only when
no other slice is touching `generate-page.mjs`. The single check that caught the worst bug of
this whole pass — inline `applyVa` extracted from the generated `index.html` versus
`value-adjust.mjs` — is exactly the check that the new contract removes, so its replacement
(shipped `w[lens]` versus a fresh `value-adjust.mjs` recompute) has to exist before the cutover,
not after.

---

### D4a — Best 10 / Worst 10: reversed by user decision, 2026-08-30

This recommendation was implemented and then **rejected on sight by the user**, who had already
removed Best/Worst from league home once before this audit was written. Seeing the restored
`Best 10 · Worst 10` chip under Most lopsided, they said: *"idk where this came from we removed
it. remove again. keep just most lopsided trade."*

**"Most lopsided trades" is the permanent replacement for Best/Worst on league home.** The
preference has now been stated twice. Do not propose restoring the board a third time.

Removed in `main` (`cursor/drop-best-worst-af37`, `DATA_V = 20260829t`): the league-home chip,
`renderTradeBoards`, `rankSides`, `monthsAgo`, `boardScore`, the `boardClock` / `boardWindow`
state, the `[data-board]` / `[data-window]` / `[data-open-me]` handlers, and the now-unreachable
`button.chip.on` rule. This closes most of the §3 "dead UI" item and the boards part of Slice 2.

### D4b — the Traders and Drafters lists: ruled, delete. 2026-08-30

The question raised below was put to the user and answered: **delete.** `renderLeague()`, the
back-to-league-home chip, the dispatch branch, `league` in `VIEWS`, the boot branch honouring
`?view=league` and the two `view !== "league"` exemptions in `render()` are all gone (`8cdbb3d`).
`?view=league` is now an unknown view and lands on league home like any other.

`league.traders` **stays** — `leagueBubbles()` reads it for the Most active / Least active ticker
pills. `league.drafters_rookie` (~2.5 KB) now has no reader at all and is the last known piece of
dead payload on the wire; `revalue.mjs` still emits it, so removing it is a payload pass.

This closes §10.2. It also closes the loop on the payload cut: `drafters_rookie` was deliberately
**kept** in `4653091` *because* `renderLeague()` read it then. A field's readers are a moving
target, which is why "check it against the current generator, not against a snapshot" is written
into `UI_SDD.md` rather than left as a habit.

The original open question follows.

**Open, and a user decision — not a worker decision.** `renderLeague()` was never only Best/Worst.
It also renders two league-wide lists that nobody objected to and that the user may never have
seen: `Traders · per complete two-way` and `Drafters · rookie surplus per pick`. Those are left
intact and `renderLeague()` still renders them, but with the chip gone **no visible control routes
there** — only a hand-typed `?me=<seat>&view=league` reaches it (boot ignores `?view=` without a
seat, §P1-1). So the two lists are now **unreachable in the UI, pending a ruling**: give them
their own entry point, fold them into an existing screen, or delete them with
`league.traders` / `league.drafters_rookie`. This is exactly the §8a trap in reverse — the
destination outlived its only link — so it is logged rather than silently resolved.

Consequently `league.json`'s `trade_boards.today` / `.aged` and `drafters_startup` now have **no
reader at all**, and `sides` is read only by `rankWide` / `daySides`. §P1-10 (`aged` subtracts two
price books) is now fully latent: nothing renders `aged`. Those three fields were dropped from the
shipped `league.json` in `64f55b0`.

---

## 8c. D5 — the 40/60 KTC blend has no reader left. New, and a user decision.

Found while writing §7, not during the audit. It is the one thing in this pass that I do not
think should be resolved by a worker, so it ships unresolved and flagged.

**The blend lives in `even`. The UI renders `windows[lens]`.** `sideOf(t)` is
`applyVa((t.windows && t.windows[lens]) || t.even || t.realized)`. Every one of the 586 trades
carries `windows.all`, so the `t.even` fallback **never fires** — measured, 0 of 586. And the
windows are flatten-only by product law: `apply-value-adjust.mjs` says so on line 2, and the rule
"windows never get the KTC blend" is explicit canon.

So the 40/60 blend, which is what the KTC snapshot work exists for, currently reaches the screen
**nowhere**. The one remaining reader is `league.traders[].even_per_trade`, which renders only
inside `renderLeague()` — itself unreachable since D4a.

Measured, `even.today_delta` against the `windows.all.today_delta` the page actually draws:

| | |
| --- | ---: |
| Complete sides compared | 582 |
| Mean absolute difference | **975** |
| Largest | **5,715** on tx `784631189796454400` |

This is not a bug to fix in passing — every available fix changes numbers on screen:

1. **Accept it.** The blend is a pricing-quality improvement to a book the UI does not surface,
   and "Since trade" honestly means *a mean over year-ends*, not *today*. Then say so in
   `PRODUCT.md` and stop describing the blend as if users see it.
2. **Add a sixth clock, "Today".** `even` becomes a selectable window alongside the five. Costs a
   dropdown entry and a `windows.today` key; violates nothing, because it is a named clock rather
   than a blend into an existing one.
3. **Make `all` mean today rather than a mean.** Cheapest to implement, and the one I would not
   do without an explicit ruling: it silently redefines the default clock every number on the
   site is currently computed under.

**Recommendation: 2.** It is the only option that surfaces the blend without redefining anything
already on screen, and a named clock is how this product has handled every other price question.
But it adds a clock, and "do not add a fourth clock" is standing law in `TRACKER_SDD.md` §8 —
which is exactly why this is Truman's call and not mine.

---

## 9. Proposed fix order

**All of Slices 1, 1b and 3 shipped, and Slice 2 shipped except the `windows` restructure.**
Slice 5 is this commit. Slice 4 shipped only its accessibility half. The order below is kept as
written for the record; §0 is the index of what actually landed and in which commit. Note that
the executed order was A (pricing) → B (generator) → C (pipeline) → D (dead code) → E (one
source) → F (phone) → G (docs), which puts 1b's pricing changes **before** Slice 1 — deliberately,
so the generator work was verified against the final book rather than a book about to move.

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

**Slice 2 — delete the dead** — **shipped**, except the `windows` restructure (D3a).
~~`renderTradeBoards`/`rankSides`/`monthsAgo`/`boardClock`/`boardWindow`~~ (D4a) ·
~~`renderLeague`~~ (D4b, `8cdbb3d`) · ~~`draftTab` and the dead `pickWindowEnd` branches~~ ·
~~`other_bags` on 2-team trades, `realized`, `recent_trades`, `year_ends`, `partner_headlines`,
`drafted_by`, `review_trades`, `trade_boards.today`/`.aged`, `drafters_startup`~~.
`drafters_rookie` is the one left: it was kept because `renderLeague` read it, and lost that
reader afterwards.

**Slice 3 — one source per number**
`partnerPer()` helper feeding home tile and Partners tab (P0-4) · single grade threshold constant ·
single "today" clock (`league.today`) · decide VA ownership · precomputed `marks.json` (P1-7) ·
memoize `tradeDelta` and sort on precomputed keys (§6b).

**Slice 4 — consistency and a11y**
~~year filter becomes radios~~ · ~~stop `replaceState` on every render (P1-12)~~ ·
~~unnest interactive controls from buttons (A1)~~ · ~~keyboard and focus (A2–A4)~~ ·
~~44px targets (A5)~~ — **all shipped**. Still open: one posture vocabulary · ticker stops
duplicating packs and stops double-rendering · ~~back-button history (P1-8)~~ ·
Champions Path "1st" column earns its keep.

**Slice 5 — rewrite the specs** — **shipped, this commit.**
`UI_SDD.md` to match five windows, four tabs, gold cards, packs, Champions Path.
`PRODUCT.md` today-clock definition to include the KTC blend and retired→0.

**Slice 6 — what is left after this pass.** In the order I would take it:
`windows` restructure and delete the browser's `applyVa` (D3a, needs the invariant rewritten
first) · the D5 ruling on the KTC blend (§8c) · drop `drafters_rookie` from `revalue.mjs` ·
~~back-button history (P1-8)~~ **shipped, `20260830nv`** · derive `DATA_V` instead of hand-editing it (§6b) ·
seat-switch race (§6) · price the newest trade on its own date (§10.5) ·
the cosmetic set in §5 · posture vocabulary · A6 · ~~A8~~ **shipped with the signed-delta
convention, `20260830sd`** (§4a).

---

## 10. Open questions for Truman

1. **Is the Home hero coming back?** One number for "how you have done", or is the six-tile
   panel the answer now?
2. ~~**Should Best 10 / Worst 10 return** as a real screen, or is Most lopsided the permanent
   replacement?~~ **Answered 2026-08-30: Most lopsided is the permanent replacement; the board is
   deleted (D4a).** ~~And the orphaned Traders / Drafters lists?~~ **Also answered: delete
   (D4b, `8cdbb3d`).** There is no league screen. Only `league.drafters_rookie` outlives it, with
   no reader, pending a payload pass.
3. **Drafts on a lens.** Today the Drafts tab pins Since-trade and hides the dropdown. Should
   rookie surplus respond to the lens, given "got" would be a windowed mean while "sent" stays
   draft-day cost — two clocks in one number?
4. **Retired detection.** The current rule is "not on KTC + no NFL team", plus an explicit list.
   Do you want an explicit retired list as the only source of truth instead? Now shipped as
   stated, and the unresolved-id path was checked: **2 legs, 1 name**, genuinely retired (P0-5).
5. **Publish cadence.** `league.today` is `2026-08-28` while the tape already has a
   `2026-08-29` trade. Automate the rebuild, or caption the staleness? The **display** half is
   handled — the Recent Trade card takes the later of the two dates (§4.4) — but the **pricing**
   clock is still a day behind the tape, so the newest trade is priced on yesterday's board.
6. **NEW — does the KTC blend get a screen?** See §8c / D5. It has no reader on any reachable
   screen, and the gap between it and what the page draws averages 975 across 582 sides.
7. **NEW — a trade now opens two different ways depending on where you tapped it.** The
   navigation pass was told to make the Recent Trade card and the new league trades list open a
   trade **full screen**, and to leave the per-seat Trades tab's inline expansion alone. It did
   both, so the app now has two vocabularies for the same object:

   | Where you tap a trade | What happens |
   | --- | --- |
   | Recent Trade card, Most lopsided, league trades list | opens `?view=trade` as its own screen |
   | A seat's Trades tab, Best/Worst deal on a seat's home, a partner's deals | expands inline in place |

   Most lopsided was folded into the full-screen half rather than left as a third case: it is a
   league-wide list rendered by the same `boardTape` as the new list, and splitting them would
   have meant two behaviours for one component. The remaining split is league-wide versus
   per-seat, which is at least a line you can state — but nobody asked for it, so it is logged
   rather than resolved. Ruling wanted: does the per-seat Trades tab go full screen too, or is
   inline-inside-a-seat the deliberate difference?
8. **NEW — the league trades list is 288 of the league's 290 trades.** It is sourced from
   `league.trade_boards.sides`, which is 576 rows and carries **only complete two-team trades**:
   the two three-team deals (`916914658962112512`, `1277511518384037888`) have no row there, on
   any lens. The list's caption says "every trade on **the league tape**" rather than "every trade
   in the league" for that reason. Shipping the missing two means either putting N-way trades on
   the tape or reading the 2.94 MB of seat files, so it is a payload decision.

   Related, and worth knowing: `voteBlock`'s "three-team trade, voting is off here" branch is
   therefore **unreachable from every screen that renders it** — no board row can name an N-way
   trade. The guard is kept because it is the correct guard, not because it currently fires.
