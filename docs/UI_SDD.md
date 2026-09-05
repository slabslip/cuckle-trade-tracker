# CuckleChunckle — UI SDD (display law)

Phone-first dashboard, generated whole by `generate-page.mjs` into `index.html`. Existing CSS in
that file only. No chart library, no npm, no new tokens, no SlabSlip chrome.

**This file describes what ships.** If it and the generator disagree, the generator wins and this
file is wrong — fix it in the same pass. What we *want* → [`PRODUCT.md`](./PRODUCT.md). What the
scripts emit → [`ARCHITECTURE.md`](./ARCHITECTURE.md). Pricing → [`VALUE_SDD.md`](./VALUE_SDD.md).
Votes → [`VOTES_SDD.md`](./VOTES_SDD.md). Cosmetics → [`COSMETICS_SDD.md`](./COSMETICS_SDD.md).
Known defects → [`DASHBOARD_AUDIT.md`](./DASHBOARD_AUDIT.md).

---

## 1. Two rooms

**Home** (no seat picked) is the daily paper: top tabs **Home | Teams | Ledger | History**, then
the digest — signed-in **Your 3** (notifications only), one Recent Trade card, **Price a deal**,
signed-in **On your roster** news, and the News Feed pull-up. It is the water cooler. The `Score as`
clock is not on it; the clock lives in the brand header on screens it applies to (§2a).

**Your 3** may name a wager or an uncast vote. Omit the strip when signed out. When signed in
and nothing is waiting, keep the heading and leave the slot blank — do not fill it. That is an
*action*, not a personal bag number. Lineup recaps, waivers, and bag totals stay off Home. The
calculator door stays under Recent Trade — it is not a Your 3 row.

**Team home** is what you get after picking a name in the **Teams** tab. **You are that seat.**
Six style tiles, an optional league chart, your best and worst deal, your two edge partners, your
best and worst rookie pick. Every number is first-person for that `user_id`.

Do not merge them. Home must not grow a personal number, and team home must not become a league
recap.

---

## 2. Chrome

Header: home button · `CuckleChunckle`. That is all of it. **There is no seat picker in the
header** — league home's **Teams** chip (§3) is the only way into a seat, on the ruling that the
chips are the access points. Both items in the row go home: the icon and the brand link share one
handler, and either clears the seat from any screen.

**The flow is two taps, deliberately.** Home icon to leave the seat you are in, Teams chip to enter
another, where the header picker did it in one. That cost was stated and accepted. What makes it
safe is that the home icon leaves a seat from *every* screen — a seat's four tabs, the full-screen
trade, a deep-linked seat — which was verified on the shipped build before the picker was removed,
not assumed. `clearLeague()` is the only exit now, so a generate-time assertion covers both the
listener and that the function still drops `me`, `data` and the view rather than only repainting.

`h1.brand` keeps `overflow: visible` and keeps its assertion, even though no menu opens from the
header any more. The row still holds two focusable targets with outline rings, a clip here turns it
into a scroll box, and it has been re-clipped twice already (7f97711, then f9fdb39). The invariant
is cheaper to keep than to rediscover.

**The seat menu**, mounted on the Teams chip, is a `listbox` — `role="option"` children, arrow
keys, `Home`/`End`, `Escape` returns focus to the chip. Selecting a name is not "view as": it swaps
the whole app to that seat.

**The trigger always reads "Teams"**, whether or not a seat is taken. It used to swap to the
selected manager's name, which made the one door to the other nine seats read as the current
seat's own button. The seat is not lost to a screen reader by that: the accessible name is
`Teams, TrumanCooper selected` with a seat and `Teams` without one, and the chosen option in the
list still carries `aria-selected="true"`. A generate-time assertion pins the visible label to the
constant. Note "Teams" on the trigger is a different string from the removed "Team" option below,
and the assertion for that option matches its whole call so the two cannot be confused.

**The menu lists managers and nothing else**, in **last season's finishing order**, and the
champion carries a gold crown. Three rules hold it together:

- **No "Team" option.** It used to head the list and clearing the seat was all it did. The home
  button does that, so the option was a second control saying what the home icon already says —
  and dropping it is what takes the list from 11 rows to 10. The home icon is the *only* way out
  of a seat, so a generate-time assertion keeps it wired.
- **The order is derived, never written down.** `title-path.mjs` is the only script that walks
  `previous_league_id`, so it derives the standings there and writes `place` onto
  `data/ui/members.json`, which is the file the menu reads. The rule: **the winners bracket's
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

**One list, one mount, and the seams stay welded anyway.** `whoOptions()` is the only place a seat
option is built, the chip's menu carries class `.who-menu` rather than a copy of its rules, and the
listbox keyboard matches that class rather than the menu's id. That was written when there were two
mounts and it survives the removal of one: a build asserts a seat option is emitted in exactly one
place, and that `whoOptions()` is mounted in exactly one — a second mount has to be declared, not
assumed. The header picker's own guards were **re-pointed onto the chip**, not dropped: the
constant label, the accessible name carrying the seat, the ten options, the crown on first place,
the 44px rows and the no-scroll cap.

**A menu that opens from the middle of the page is not on screen just because it is in the DOM.**
The header picker never needed to care — it sat in the brand row at the top. Both chip menus do:
focusing an option scrolls *that option* into view and nothing else, which left 1 of 10 managers
and 2 of 6 data sets visible at 375px. `showMenu()` scrolls by the least amount that puts the whole
panel inside the viewport, and both openers call it. It is asserted, along with the
`focus({ preventScroll: true })` that has to come first.

Under the header, a ticker of league bubbles (champion, most lopsided, most active …).

**Tabs** appear only when a seat is picked: `home` · `trades` · `partners` · `drafts`. They are a
`tablist` with roving `tabindex` and arrow keys. There is **no `league` tab** — see §8.

**Score as** is a dropdown, not a row of chips, and it is the only clock control. It lives in the
brand header, top right (§2a). Five windows:

| Key | Label | What it scores |
| --- | --- | --- |
| `t0` | At trade | Accept day. Picks are still picks. Unfiltered. |
| `y1` | First 1 year | Year-end mean over the first year. Hides deals younger than that. |
| `y2` | First 2 years | Same, two years. |
| `y3` | First 3 years | Same, three years. |
| `all` | Since trade | **Default.** Mean of year-ends from accept through today, became-player. Unfiltered. |

`t0` and `all` are unfiltered; `y1`/`y2`/`y3` hide a deal that has not lived the clock and say so
above the list (`livedHint`). The dropdown button carries a dot when the clock is not `all`.

### 2a. Where the clock lives, and where it does not

It is **persistent chrome in the brand header, top right**, in the space the seat picker held until
`11e5401`. Six screens each rendered their own copy of it before; a global setting rendered six
times is one control with six chances to disagree with itself, and the user asked for it in the
header. The trigger is static markup inside `h1.brand` and is **painted, not rendered** —
`render()` replaces `#app` wholesale, and a control that has to survive every navigation cannot
live inside it. `paintLens()` runs after the body is built, because `renderDrafts()` pins the clock
for its own render and restores it on the way out.

The visible label is **the window alone** — `Since trade ▾`, not `Score as Since trade ▾`. The
prefix measures 54px, and the 288px brand row at 320px does not have it: with the prefix the app's
own name ellipsises at 320, 375 *and* 390. Without it the widest window name (`First 2 years`)
takes 107.7px of the 109.1px the row leaves, and the wordmark stays whole. `Score as` moved into
the accessible name, where it costs nothing. If that 1.4px ever goes, **the title gives way, not
the control**: `h1.brand a` carries the ellipsis and the trigger does not, because a control never
truncates before a wordmark does.

It **hides on Champions Path and on Drafts**, which are the two screens the clock cannot move.
`renderTitles()` reads no clock at all — no `lens`, no `chipLived()`, no `clockName()` — and the
Drafts tab pins the clock to `all` for the whole of its render, so every pick is graded from accept
day whatever the control says. Leaving it visible there would put a control on screen that visibly
does nothing, which is the ticker's dead-pill defect (§below) in a new place. The set of screens the
clock is *offered* on is therefore exactly the set that rendered it before: league home, a seat's
home, both trades lists, partners and the full-screen trade. The selected window is state, not
markup, so a trip through Drafts or Champions Path brings the control back reading what it read on
the way in.

Its panel is absolutely positioned against `.lens-wrap` inside the `h1`, which is why
`h1.brand { overflow: visible }` is **load-bearing again** and still asserted: a clip there would
cut a 418px panel down to the 44px header, which is exactly how the seat picker shipped unusable
twice (A9). `.lens-wrap` stacks at `z-index: 5`, above `.filter-wrap` at 4 and `.ds-wrap` at 3, so
an open panel paints over the chip box it drops across — verified by hit-testing the overlap point,
not by reading the sheet. Opening it closes every other popup and opening any of them closes it, so
two menus can never be open over each other.

All five are flatten-only. **The 40/60 KTC blend is not on this menu.** Trade rows still read
`windows[lens]`. The calculator (`?view=calc`) is the first screen that **renders** the today /
`even` blend. Whether the blend also earns a sixth Score-as entry is an open user decision
(`DASHBOARD_AUDIT.md` §8c).

URL state: `?me=<display name or user_id>&view=<tab>&t=<transaction_id>&lens=<key>&title=<season>&tab=<homeTab>`.
`tab` is `teams` / `ledger` / `history` when those top tabs are open; omitted on Home.
Stored `homeTab=league` is an alias for Home. Boot reads every param; an unknown value falls back
to Home rather than throwing. `history.replaceState` fires only when the URL string actually changes.

### 2b. Top tabs

Four chips, one row, no wrap: **Home | Teams | Ledger | History**. First tab label is **Home**.
`homeTab` stores `home`. Ledger may badge. No fifth tab. Calculator and Titles and Emblems are
sub-screens (`?view=calc`, `?view=cosmetics`), not tabs.

---

## 3. Home

**Your 3** — omit if signed out. Signed-in: at most three notification rows (wager / uncast vote),
or a blank reserved slot when nothing is waiting. Tap → Ledger or the deal vote. Do not fill
with the calculator or a news teaser.

**Recent Trade** · the newest date on the tape. Named for recency, not for a clock. Existing H2H
gold card + “Who won this trade?”. Do not restyle into a new card system.

**Price a deal** · under the deal. Opens `?view=calc`.

**On your roster** — signed-in only. Up to three feed items that tag that manager’s players,
ranked by category + recency (injury is one tag among roster move, depth chart, and the rest).
Omit when signed out or when nothing hits the seat. The News Feed pull-up stays the league-wide
preview and is not skipped to avoid a duplicate.

Draft Data, Cuffs, Champions Path, and League Data Sets live on **History**, not stacked on Home.

### 3b. Calculator

`?view=calc`. Two seats stacked (Team 1 gets / Team 2 gets). Search lives under each header and
only that roster. Selected assets are rows (name, pos/team, value, remove). Compare bar + favor
copy + closest leftover pieces from the short roster. Price book is today / `even` (flatten +
40/60 KTC) plus Value Adjustment via the existing `applyVa`. Votes do not appear on a
hypothetical and do not change the number.

### 3c. Titles and Emblems

Profile barracks (`?view=cosmetics`). Shared catalog of 25. Equip one title and one emblem.
Locked shows the requirement; unlocked shows the receipt. Visual only. Where equipped cosmetics
paint across the app is later — not this file yet. See [`COSMETICS_SDD.md`](./COSMETICS_SDD.md).

**History** holds Draft Data, Cuffs, Past Champions, and the league lists. **Teams** is the door
into a seat (header picker stays gone — §2).

**League Data Sets** (History) — one list on screen. Five sets: Most lopsided trades · Most
passed around · Least traded · Forever players · Homesteaders. It replaced five collapsible packs
stacked down the screen, any number of which could be open at once. The trigger's label is the
constant `League Data Sets`, never the selection — the same convention the seat picker settled on —
and the selected set is named by the `h2` directly below the box, which is the only thing on
screen that says which set you are looking at. **Nothing is selected on a cold load**, and the
home icon and the menu's `None` option both return to that.

It is a popup listbox with the seat menu's keyboard: arrows, `Home`, `End`, `Escape` back to the
trigger. The panel takes the box's full width; capped narrower, it left half of each trade row
visible beside it.

**Its height is capped to its own list, not to a slice of the viewport.** The old cap,
`min(100dvh - 96px, 480px)`, was a number six options never reach, so it never bit: the panel
measured 439px at 320px and simply hung off the bottom of the screen. The cap is now
`min(calc(6 * 76px + 34px), calc(100dvh - 96px))` — six rows at the 76px a two-line option takes at
320px, five 4px gaps, 12px of padding and 2px of border — which is the same rule the seat menu is
held to, and the build checks the option count against it, so a sixth set fails rather than ships.
With `showMenu()` (§2) the whole panel is on screen when it opens: **6 of 6 options inside the
viewport at 320, 375, 390 and desktop, `scrollHeight == clientHeight` at all four**, against 4, 1,
3 and 6 before.

**The two blank chips are `span`s, not `button`s.** No `tabindex`, no `data-*`, no role, nothing
for a handler to find — a dashed edge, a dimmed em dash and `cursor: default`, and `aria-hidden`
because a placeholder is not a reading. This is the ticker's dead-pill rule (below) applied to a
control four times the size: an inert cell that looks pressable is a defect, and the generate-time
guard that closed it for the pills now covers the chip grid too.

`Score as` is a **separate** control and stays one, and now in a separate place: the clock is a
global setting in the brand header, this picks which list is on this one screen. Two axes, two
menus, two homes.

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

**The seat is named on screen, once, above the tab row.** `h2.screen-h.seat-h` carries an `.sr-only`
`Team: ` prefix and the manager's display name, on all four tabs and on none of the league-wide
screens, which title themselves. With no picker in the header this heading is the **only** thing on
those four screens that says whose seat you are in — the partners and drafts tabs named the seat
zero times in the page body before it existed — so it is a blocker rather than a nicety, and it is
asserted at generate time along with the `tabs.length` gate that keeps it off Champions Path and
the full-screen trade. It is also where `focusNext` lands after a seat is taken. `overflow-wrap:
anywhere`, because a heading has no ellipsis to fall back on and `DarkWingDucks2023` is 17
characters with no break opportunity.

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
- 44px minimum on every tap target, including the team menu, the year filter rows, the chips and
  the Score as trigger and all five of its options. When a list of them stops fitting, the list's
  cap gives way, not the 44px.
  The chips' own floor is 56px, because the longest label needs two lines in a 127px cell.
- One column of bags on a phone, two at `min-width: 640px`.
- `aria-expanded` on every expandable row. `Escape` closes whatever is topmost: the seat menu,
  then the clock menu, then a filter panel, then an open pick, draft or trade.
- A popup opened from mid-page is scrolled into view as a whole (`showMenu()`), never left to the
  browser's scroll-the-focused-option behaviour.
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
