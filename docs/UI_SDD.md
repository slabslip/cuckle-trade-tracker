# CuckleChunckle — UI SDD (display law)

Phone-first dashboard. Existing CSS in `generate-page.mjs` only. No chart library, no new tokens, no SlabSlip chrome.

---

## 1. Two rooms

**Home = your after-action score.** The first thing you see after picking a name is **your** per-complete-trade needle (became-player today), how many deals are on it, and your last few bags. You are the seat. This is not a league recap.

**League = water-cooler tape.** Best smash / worst beatings, then everyone else’s per-trade and per-pick lists. You are highlighted (`· you`), not the default subject.

Do not merge them. Home teasers may **point** at League (Best smash / Worst chips → League, all-time today). They must not replace the Home hero.

---

## 2. Identity and chrome

- Tiles = the ten canonical names. `?me=TipsUp` (or user id) selects that seat. Serve over HTTP.
- Caption under the title: `{name} · DynastyProcess Superflex · FAAB thrown out`.
- Tabs: `home` · `trades` · `partners` · `drafts` · `league`.
- Lens chips (global, under tabs):
  1. **Became the player** (default) — Today clock.
  2. **Pick at trade day** — T0 identity on the same rows.
  3. **First 3 years** — over-time mean. **Third chip, not a second hero.**

Win-now / Investor is a one-line caption on Home only. It never recolors the hero.

---

## 3. Home (first-person)

| Block | Law |
| --- | --- |
| Hero | One big number: `realized_per_trade` (or `pick_per_trade` if that chip is on). Caption: “per complete trade · received vs what you sent · total … · N complete · K incomplete (no DP row), off this number.” |
| Hero + y3 chip | **Do not** swap the hero to a 3-year average. IN FLIGHT already leaves the hero on today — keep that. The chip may change the **latest-trades** row margins (same as Trades). |
| Style | Caption only. |
| Rookie hit / miss | One line. Surplus = player today − pick cost on draft day. |
| League teasers | Two chips from `trade_boards.today` **all-time**. Not aged, not 3y, not windowed. |
| Partner teasers | Best / Worst / Most from `partner_headlines` (2+ complete when possible). |
| Latest trades | Same row DNA as Trades (below). |
| Latest rookies | Spark: green = player, blue = pick cost. Number = surplus. |

---

## 4. Open trade = first person

Closed row: other name(s) · date · `got {received} / sent {gave up}` · margin = needle for the **active chip**.

Open row:

1. **You received** · total.
2. **You gave up** · total.
3. If **3+ names** (`others.length > 1`): one extra bag per other seat, titled `{name} received`. **No `other_bags` on a 2-team row** (data may still contain them — do not render).
4. If T0 exists **and** the chip is Became-the-player: caption `At accept: {t0_delta} · since then: {aged}`.
5. If the chip is First 3 years: caption that this number is the year-end mean in the 3 years after accept; under-300 **player** years count as 0; if the window has not elapsed, say so.
6. Clock note: became-player vs pick-at-accept vs 3y. Drafter name ≠ trade recipient.
7. Spark + hint (below).

Incomplete: badge `no DP row`; totals show `—` when every shown leg is unpriced; margin `—`.

Flags on a leg: `no DP row` · `as 2028` · `Mid`.

Pick legs expand hop tape (date · from → to · sold|used|held · t0 → out). Hop math stays pick-local except the drafter’s last hop.

---

## 5. First 3 years on the existing spark

The spark already plots **each side’s received bag** at year-end (+ today). Colors: green, blue, gold (max 3 lines). Do not add a library.

**RECOMMEND** to make the window readable, in later slice, without a new chart:

1. Keep the full spark (career context).
2. Caption: `Each line = that side received bag at year-end · row number = received − sent (first 3 years)` when the y3 chip is on; `(today)` otherwise. Draft sparks stay `Green = player · Blue = pick`.
3. Shade the 3-year span: a single `<rect>` in the existing SVG from the first year-end ≥ accept to the last year-end ≤ accept+3y (or today). Use a dim fill (`#1c1c22` / 20% white). No second series.
4. Optional: list the dates that entered the mean (`2020-12-31 · 2021-12-31`) in the caption. That is how you show “2019 YE was empty” without a tooltip stack.

Do **not** draw a fourth line for the 3y mean. The chip number is the mean; the spark is the path.

---

## 6. Best / Worst

HAVE: complete 2-team only; clocks **today_delta** and **aged**; windows 3m / 6m / 1y / 3y / all by **trade date**; Home teasers = all-time today.

**Third clock on these boards? RECOMMEND no** until the 3y lens is trusted (short windows, pick-floor, dropped 2019 YE). Shipping “Best 3-year smash” now would crown 2026 deals whose “3 years” is floored-today.

When (if) it ships: same window chips, a third clock labeled **First 3 years**, still 2-team complete only, still exclude incomplete and null T0-aged rules as today.

---

## 7. Partners and drafts

- Partners: 2-team complete only. ±100 = you extract / they extract / even. 3-team excluded from the grade, included in Trades.
- Drafts: Rookie 2020–26 surplus; Startup 2019 by player today (no 2019 pick cost). Sparks as Home rookies.

---

## 8. Phone-first, CSS-only

- Viewport + safe-area padding already in `index.html`. Keep 44px targets.
- One column of bags on small screens; two at `min-width: 640px`.
- Tiles 2-up on phone, 5-up when wide (ten names).
- Existing variables only (`--bg --card --line --text --muted --dim --green --red`).
- No Tailwind, no Recharts, no new font.

---

## 9. Later slices (list, do not implement)

Errors, waste, and edges to fix **after** the 3y chip is trusted. Not this spec pass.

1. **Stop shipping `other_bags` on 2-team `slimTrade`.** UI already hides them. Biggest easy shrink of `me/*.json` (SF69erss is 561 KB).
2. **`trade_boards.sides` (574 rows) in `league.json`.** Needed for client-side windows. If we add a 3y clock later, do not duplicate the whole side object — add one number per row, or rank on rebuild and ship the five window packs.
3. **Apostrophe hazard.** Fixed for captions (JSON `fetch`, HTML text). Keep it that way. `Wan'Dale`, `Ja'Marr`, `De'Zhaun` are in labels and board headlines. Never `'` + label + `'` inside a `<script>`.
4. **`?me=` race.** Abort or serialize `selectMe`. Board `data-open-me` chains `selectMe` then `view = trades`.
5. **Home hero vs y3 chip mismatch.** Either disable the hero change (current, correct) and dim the chip’s effect on Home’s latest-trades, or add one line under the hero: “Rows below use First 3 years; this number is still today.”
6. **Spark `|| 0`.** Null year-ends draw a crash. Use skip / gap, or omit that x.
7. **Trade row is a `<button>` wrapping hop expanders.** Legal-ish (divs), messy for a11y. Later: `div.row` + keyboard. Don’t nest real buttons.
8. **Click-handler leftovers.** One long `if` on `#app`. Home teaser `data-board` forces League. Adding chips will collide unless names stay distinct (`data-lens` / `data-board` / `data-window`).
9. **Duplicate pricing.** `partnersFor` twice in self-check; `year_ends` + `pick_year_ends` on every slim trade; unused `t0_legs` on the open row (HAVE computes them, UI does not list T0 legs — aged caption only). Fine until files hurt.
10. **Provisional 3y on 2025–26 rows.** Visual: a `not yet 3y` badge so a +406 on a four-day-old trade is not read as a career grade.
11. **3-team receiver-only.** If `sent` is empty, say “you sent nothing” instead of `sent 0`.
12. **Incomplete IDP copy.** “no DP row” is true; “IDP / not on Superflex board” is kinder for Bosa / Parsons.
13. **Publish cadence.** Not a UI feature. A line in the caption (`as of 2026-08-28`) is enough until someone automates `node build.mjs`.

Ponytail: every item above is a delete or a caption unless Truman asks for a new clock.
