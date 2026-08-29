# CuckleChunckle — Dashboard Audit & Strategy Review

Audit date **2026-08-29**. Live build `DATA_V = 20260829j`, `main` at the today-blend commit.
Method: four passes — UI code read (`generate-page.mjs`), data integrity scripts over `data/ui/**`,
live click-through on iPhone and desktop, and docs-vs-shipped drift.

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

## 2. P0 / P1 defects (confirmed, with line numbers)

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

Only **one** trade is affected today (magnitude 94), but the rule is structurally missing: every
future one-way or receiver-only side inherits it, and any change to the today book widens the gap.
*Fix:* recompute totals whenever **either** side has priced legs; treat the empty side as 0 and
say "sent nothing" rather than `0` (already listed as `UI_SDD.md` later-slice item 11). Pipeline + generator.

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

## 3b. Data integrity — what passed

Scripted over all 10 seats, 586 trade sides, recomputing from legs with the live modules:

| Invariant | Result |
| --- | --- |
| `today == sum(priced legs) + value_adjust` | **1 violation** of 586 (§P1-9); all others exact |
| `today_delta == today − sent_today` | 0 violations |
| Stored VA matches `value-adjust.mjs` recompute (cap 3, half 4ths) | 0 stale |
| Stored today values match `price-today.mjs` recompute (retired 0, 40/60) | 0 stale |
| Zero-sum on complete 2-team trades | 0 breaks across 288 pairs |
| Both seats present for every 2-team trade | 288 of 288 |
| Non-finite / NaN values in legs | 0 |

**The book is arithmetically sound.** Every defect in this audit is presentation, plumbing,
payload, or the one structural gap in §P1-9 — not pricing.

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

## 9. Proposed fix order

**Slice 1 — correctness, generator-only, no data change**
`?me=`/`?t=` on boot · `rankWide` uses `chipLived` · middle margin uses `cls()` ·
`esc()` on interpolation · spark null gaps · `catch` on seat fetches · guard `data.trades`.

**Slice 2 — delete the dead**
Remove `renderLeague`/`renderTradeBoards`/`rankSides`/`monthsAgo`/`boardClock`/`boardWindow`/
`draftTab` and the dead `pickWindowEnd` branches. Stop shipping `other_bags` on 2-team trades,
`realized`, `recent_trades`, `year_ends`, `partner_headlines`, `drafted_by`, `review_trades`,
`trade_boards.today`/`.aged`, `drafters_*`.

**Slice 3 — one source per number**
`partnerPer()` helper · single grade threshold constant · single "today" clock (`league.today`) ·
decide VA ownership · precomputed `marks.json`.

**Slice 4 — consistency and a11y**
One posture vocabulary · ticker stops duplicating packs and stops double-rendering ·
year filter becomes radios · back-button history · Champions Path "1st" column earns its keep.

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
