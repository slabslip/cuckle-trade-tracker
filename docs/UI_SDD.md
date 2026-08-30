# CuckleChunckle — UI SDD (display law)

Phone-first dashboard, generated whole by `generate-page.mjs` into `index.html`. Existing CSS in
that file only. No chart library, no npm, no new tokens, no SlabSlip chrome.

**This file describes what ships.** If it and the generator disagree, the generator wins and this
file is wrong — fix it in the same pass. What we *want* → [`PRODUCT.md`](./PRODUCT.md). What the
scripts emit → [`ARCHITECTURE.md`](./ARCHITECTURE.md). Pricing → [`VALUE_SDD.md`](./VALUE_SDD.md).
Votes → [`VOTES_SDD.md`](./VOTES_SDD.md). Known defects → [`DASHBOARD_AUDIT.md`](./DASHBOARD_AUDIT.md).

---

## 1. Two rooms

**League home** is what you get with no seat picked: the gold alert row, the `Score as` clock, one
**box of four chips**, and the News and Alerts feed. It is the water cooler.

**Team home** is what you get after picking a name in the header. **You are that seat.** Six style
tiles, an optional league chart, your best and worst deal, your two edge partners, your best and
worst rookie pick. Every number is first-person for that `user_id`.

Do not merge them. League home must not grow a personal number, and team home must not become a
league recap.

---

## 2. Chrome

Header: home button · `CuckleChunckle` · team picker. The picker is a `listbox` — `role="option"`
children, arrow keys, `Home`/`End`, `Escape` returns focus to the button. Selecting a name is not
"view as": it swaps the whole app to that seat.

**The trigger always reads "Teams"**, whether or not a seat is taken. It used to swap to the
selected manager's name, which made the one door to the other nine seats read as the current
seat's own button. The seat is not lost to a screen reader by that: the accessible name is
`Teams, TrumanCooper selected` with a seat and `Teams` without one, and the chosen option in the
list still carries `aria-selected="true"`. A generate-time assertion pins the visible label to the
constant, and the button sizes to that label rather than to the widest manager name. Note "Teams"
on the trigger is a different string from the removed "Team" option below, and the assertion for
that option matches its whole call so the two cannot be confused.

**The picker lists managers and nothing else**, in **last season's finishing order**, and the
champion carries a gold crown. Three rules hold it together:

- **No "Team" option.** It used to head the list and clearing the seat was all it did. The home
  button in this same header does that, so the option was a second control saying what the home
  icon already says — and dropping it is what takes the list from 11 rows to 10. That makes the
  home icon the *only* way out of a seat, so a generate-time assertion keeps it wired.
- **The order is derived, never written down.** `title-path.mjs` is the only script that walks
  `previous_league_id`, so it derives the standings there and writes `place` onto
  `data/ui/members.json`, which is the file the picker reads. The rule: **the winners bracket's
  placement games (`p`) settle every team they place, then regular-season record — standings
  points, then points for, then `roster_id` — orders the rest.** The losers bracket is not read;
  its `p` is a place inside the consolation round, not a league place. When 2026 completes it
  becomes the order with no code change. 2025 reads SF69erss, TipsUp, TedCumberbatch,
  KingHenryXXVI, TrumanCooper, DarkWingDucks2023, bigjberg, ChiefGumby, ARae, BubbaCuckShremp.
- **All ten show without scrolling.** Ten options at the 44px minimum plus the menu's padding and
  border is 450px, and the menu is capped just above that rather than at a fraction of the
  screen — `min(56dvh, …)` was 373px on a 667px phone, so the list scrolled. **Do not lower the
  44px to fit a longer list**; raise the cap and re-measure `scrollHeight == clientHeight` at
  568px, the shortest height that has to work. An eleventh seat fails the build.

The crown is an inline SVG in the `#e0b44c` the gold cards already use, `aria-hidden`, so an
option's accessible name stays exactly the manager's name.

**There are two triggers for this one menu.** The header's picker is persistent across every
screen; league home's **Teams** chip (§4) is a second door to the same list. They are not two
controls — `whoOptions()` is the only place a seat option is built, both mounts carry class
`.who-menu`, and the listbox keyboard matches that class rather than either id, so the order, the
crown, the 220px width, the 44px rows and the no-scroll cap cannot drift apart. Generate-time
assertions pin all of that, including that a seat option is emitted in exactly one place.

**Open question:** the chip and the header picker now say the same thing on league home. Keeping
both was the conservative call — the chip was asked for and the picker was not asked to go — but
one of them is redundant there and it is a product decision, not a rendering one.

Under it, a ticker of league bubbles (champion, most lopsided, most active …).

**Tabs** appear only when a seat is picked: `home` · `trades` · `partners` · `drafts`. They are a
`tablist` with roving `tabindex` and arrow keys. There is **no `league` tab** — see §8.

**Score as** is a dropdown, not a row of chips, and it is the only clock control. Five windows:

| Key | Label | What it scores |
| --- | --- | --- |
| `t0` | At trade | Accept day. Picks are still picks. Unfiltered. |
| `y1` | First 1 year | Year-end mean over the first year. Hides deals younger than that. |
| `y2` | First 2 years | Same, two years. |
| `y3` | First 3 years | Same, three years. |
| `all` | Since trade | **Default.** Mean of year-ends from accept through today, became-player. Unfiltered. |

`t0` and `all` are unfiltered; `y1`/`y2`/`y3` hide a deal that has not lived the clock and say so
above the list (`livedHint`). The dropdown button carries a dot when the clock is not `all`.

All five are flatten-only. **The 40/60 KTC blend is not on this menu and is not on any screen** —
it lives in each trade's `even` bag, which `sideOf()` never reaches because every trade has a
`windows.all`. Whether it earns a sixth entry here is an open user decision
(`DASHBOARD_AUDIT.md` §8c).

URL state: `?me=<display name or user_id>&view=<tab>&t=<transaction_id>&lens=<key>&title=<season>`.
Boot reads every one of them; an unknown value falls back to league home rather than throwing.
`history.replaceState` fires only when the URL string actually changes.

---

## 3. League home

**Gold alert row** — two equal cards, stacked under 520px.

- **Recent Trade** · the newest date on the tape. Named for recency, not for a clock, so there is
  no "today" that can disagree with `league.today` and no empty state to caption. Each deal on
  that date shows both seats and both bag totals on the selected clock. Tapping one expands the
  full tape row plus the vote block.
- **Champions Path** · the most recent title, its record, and how the title game went — who they
  beat, the final score, and their top scorer that week. A season with no usable final falls back
  to `· bracket` or `· points race`. Links to the Champions Path screen.

**The chip box** — one card holding **four cells of equal size**: 2×2 below 560px, four across
above it. Two lead somewhere and two are slots nobody has decided on yet.

Equal is a grid property here, not something to eyeball. The columns are `repeat(n, minmax(0, 1fr))`
— `minmax(0, …)` because a track's automatic minimum is `min-content`, so a plain `1fr` would let
`League Data Sets` widen the row instead of wrapping inside its cell — and `grid-auto-rows: 1fr`
is what makes the phone layout's two rows equal to each other rather than each sized to its own
tallest chip. Measured at 320 / 375 / 390 / 1280 the four cells are 127×56, 154.5×56, 162×56 and
209.5×56, identical within each width. The floor is 56px, not 44px, because the longest label has
to hold two lines in a 127px cell at 320px.

Both menus are emitted by the box rather than by their triggers, so both are absolutely positioned
against one ancestor: they drop the full width of the card instead of the width of the cell they
were opened from, and there is a single overflow chain to keep open. A clip anywhere up that chain
is what made the seat picker unusable twice, and it is asserted at generate time.

**Teams** — a second trigger for the header's seat picker, not a second picker. See §2.

**League Data Sets** — one chip, one list on screen. Five sets: Most lopsided trades · Most
passed around · Least traded · Forever players · Homesteaders. It replaced five collapsible packs
stacked down the screen, any number of which could be open at once. The trigger's label is the
constant `League Data Sets`, never the selection — the same convention the seat picker settled on —
and the selected set is named by the `h2` directly below the box, which is the only thing on
screen that says which set you are looking at. **Nothing is selected on a cold load**, and the
home icon and the menu's `None` option both return to that.

It is a popup listbox with the seat picker's keyboard: arrows, `Home`, `End`, `Escape` back to the
trigger. The panel takes the box's full width; capped narrower, it left half of each trade row
visible beside it.

**The two blank chips are `span`s, not `button`s.** No `tabindex`, no `data-*`, no role, nothing
for a handler to find — a dashed edge, a dimmed em dash and `cursor: default`, and `aria-hidden`
because a placeholder is not a reading. This is the ticker's dead-pill rule (below) applied to a
control four times the size: an inert cell that looks pressable is a defect, and the generate-time
guard that closed it for the pills now covers the chip grid too.

`Score as` is a **separate** control and stays one. It picks the clock the figures are computed on;
this picks which list is on screen. Two axes, two menus.

**Most lopsided trades** — top 10 sides by absolute margin on the selected clock, deduped to one
side per transaction. This is the **permanent** replacement for the old Best 10 / Worst 10 board
(§8). Filtered by the lived clock, so `all` shows the newest deals, and it is the one set the
`Score as` clock acts on.

**The ticker** carries a pill per set, which selects it and scrolls to it. A pill with no
destination — `Most active`, `Least active`, whose league-wide Traders list was deleted in D4b —
is a static `span`, not a `button`: they shipped as buttons carrying an empty destination, so they
looked pressable and were ignored on every tap.

---

## 4. Team home

**Six style tiles**, all read from `data/ui/marks.json` (§7). Tapping one opens a ten-row league
chart for that metric, sorted, with your seat highlighted. The chart draws from the rows already
loaded at boot; it must never fetch a seat file.

| Tile | Reads | Labels |
| --- | --- | --- |
| Run | total and per-deal on the selected clock | Ahead / Behind / Even |
| Volume | two-way trade count | Hyper 80+ / Active 40–79 / Quiet |
| Posture | picks-for-players vs players-for-picks | Buys picks / Buys players / Swap shop (within 5) |
| Manners | partner grades **on the selected clock** | Extracts / Gets extracted / Fair |
| Aging | mean of (`all` delta − `t0` delta) on 2-team deals | Aged up / Aged down / Held (±100) |
| Draft | mean rookie surplus | Hit factory >200 / Miss factory <−500 / Mixed |

Then: **Best deal**, **Worst deal**, two **Partners** (your best and worst per-deal), and your
rookie **hit** and **miss**.

Every one of those partner numbers comes from `partnerPer()`, the single per-partner helper. The
tile and the Partners tab cannot disagree, because the tile is a tally of exactly the grades the
tab prints. ±100 is the one `GRADE_EVEN` threshold in the browser; `apply-value-adjust.mjs` holds
the matching `EVEN`.

**No Home hero.** The old single big `realized_per_trade` number is gone and the `.hero` CSS with
it. Whether a hero returns is still an open user decision — do not invent one.

---

## 5. A trade row

Closed: `you {received} ← margin → {sent} {them}`, with the date beneath. The margin is
`round(today) − round(sent_today)` on the selected clock — round each bag, then subtract, so the
middle always equals the difference of the two figures shown. Margin colour follows its sign;
`—` and `0` are neutral.

The row is a `<button>`; the expanded detail is its **sibling**, not its child, because the detail
holds clickable pick legs and a button may not contain a button. `aria-expanded` tracks the state,
and focus survives the rebuild that expanding triggers.

Open:

1. **You received** · total, then each leg with its value.
2. **You gave up** · total, then each leg.
3. **Value Adjustment**, when non-zero, as its own line in the bag it belongs to.
4. One extra bag per other seat when `others.length > 1`, titled `{name} received`, with the same
   Value Adjustment line. Two-team rows carry no `other_bags` in the payload at all.
5. Pick legs expand a hop tape: date · from → to · sold | used | held.
6. Spark of each side's received bag at year-end plus today. A missing year-end is a **gap**, not
   a zero.

Incomplete side: badge `no DP row`, totals `—` when every shown leg is unpriced, margin `—`, and
**Value Adjustment 0**.

Leg flags: `no DP row` · `as 2028` · `Mid`.

---

## 6. Tabs

**Trades** — year filter (radios in a `radiogroup`; exactly one year at a time) plus the clock.
Filtered by the lived clock, same as the home tiles, with `livedHint` above the list.

**Partners** — one row per partner: complete count, deal count, grade, per-deal margin. Tapping one
lists that partner's deals on the selected clock.

**Drafts** — rookie surplus (player today − pick cost on draft day) and a startup toggle. Startup
picks carry a real `pick_cost`, so their margin is `player − cost` like every other pick. Sort by
date or by surplus; filter by round (no 5th rounders exist in this league). This tab pins the
clock to `all`.

**Champions Path** (`?view=titles`) — one entry per title season: previous season, offseason, then
the year they won. Deliberately outside the trade needle: nothing here feeds a delta.

---

## 7. Where numbers come from

The pipeline owns all arithmetic. The browser formats.

| File | Size | Holds |
| --- | --- | --- |
| `members.json` | <1 KB | the ten seats |
| `league.json` | 266 KB | `today`, `traders`, `player_lists`, `trade_boards.sides` (plus `drafters_rookie`, now unread) |
| `marks.json` | 6 KB | 10 seats × 6 metrics × 5 clocks — everything the tiles and the chart need |
| `me/<user_id>.json` | 156–602 KB | that seat's trades, partners, drafts |
| `picks.json` | 111 KB | hop tape per asset key |
| `titles.json` | 4 KB | Champions Path |
| `votes.json` | <1 KB | fallback vote tallies when Supabase is unreachable (opinion only — never value) |

Votes are the one number that does **not** come from the pipeline. The live league tally is read
from Supabase and `localStorage` is the source of truth for this device's own ballot; committed
`votes.json` is the fallback. See [`VOTES_SDD.md`](./VOTES_SDD.md).

A `trade_boards.sides` row ships exactly what the page reads: `transaction_id`, `date`, `user_id`,
`name`, `other`, `headline`, and `windows[lens].{got, sent, incomplete}`. The full row, with
`today_delta`, `t0_delta`, `aged`, `snaps` and the per-window Value Adjustment, exists only inside
the pipeline for its own checks.

The browser's inline `applyVa()` is a clone of `value-adjust.mjs` and must stay numerically
identical to it over every side; that is a standing check. `tradeDelta` is memoised per trade and
clock — it used to be called inside sort comparators, roughly 2,000 recomputations per home render.

Nothing the UI does not read should ship. `other_bags` on two-team trades, `realized`,
`recent_trades`, `year_ends`, `partner_headlines`, `legs[].drafted_by`, `hero` beyond `two_way`,
`partners[].grade`, `league.review_trades` and `drafters_startup` were all removed for this reason.
`league.drafters_rookie` (~2.5 KB) is the one that got away — it lost its last reader when the
league screen was deleted, and `revalue.mjs` still emits it.

Before deleting a field, check it against the current generator, not against a snapshot. That is
not a style note: `drafters_rookie` was **kept** during the payload cut precisely because
`renderLeague()` read it at the time.

---

## 8. There is no league screen

The board screen (`renderTradeBoards`, `rankSides`, `monthsAgo`, `boardScore`, the `boardClock` /
`boardWindow` state and their handlers) is **deleted**. The user removed it once before the audit
was written, an agent restored it on the audit's recommendation, and the user removed it again on
sight. **Most lopsided trades is the permanent replacement. Do not propose it a third time.**

`renderLeague()` and the two lists it held — `Traders · per complete two-way` and
`Drafters · rookie surplus per pick` — are **also deleted**, by a separate user ruling. `league`
is no longer in `VIEWS`; `?view=league` is an unknown view and falls through to league home like
any other. `boardTape` outlived the board it is named for: it is what Most lopsided and the
Recent Trade card both render.

`league.traders` still ships because `leagueBubbles()` reads it for the Most active / Least
active ticker pills. `league.drafters_rookie` now has **no reader at all** and is the one piece of
known-dead payload still on the wire.

---

## 9. Phone and keyboard

- 375px is the target, not 390px: a 390px device with a scrollbar leaves 375px usable.
- Every grid track that holds text gets `min-width: 0`. Names ellipsize; **figures never truncate**.
- The four tabs share one row and never wrap.
- 44px minimum on every tap target, including the team menu, the year filter rows, the picker and
  the Score as button. When a list of them stops fitting, the list's cap gives way, not the 44px.
- One column of bags on a phone, two at `min-width: 640px`.
- `aria-expanded` on every expandable row. `Escape` closes whatever is topmost: picker, then the
  clock menu, then a filter panel, then an open pick, draft or trade.
- `render()` replaces the whole subtree, so it re-finds the focused control by its `data-*`
  attributes afterwards.
- Existing variables only (`--bg --card --line --text --muted --dim --green --red`). No Tailwind,
  no chart stack, no new font.

---

## 10. Rules that do not bend

- **One identity per number.** Today-blend, pick-at-accept, the year windows and hop-local P&L are
  separate stories. Never average two clocks.
- **Windows stay flatten-only.** `t0`/`y1`/`y2`/`y3`/`all` never get the KTC blend; do not backfill
  KTC onto a historical clock.
- **Incomplete ≠ zero.** No DP row → list it, drop it from the average.
- **Zero-sum on complete two-team today-deltas.** Value Adjustment is 0 on any trade with more than
  two seats, because a seat's `sent` bag does not correspond to any single other seat's `got` bag.
- **Champions Path stays out of trade-needle math.**
- **Votes are opinion.** They live in their own file behind their own two doors and never reach a
  delta, a grade or a ranking.
- **Ties are legal.**
