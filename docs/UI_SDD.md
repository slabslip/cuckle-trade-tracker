# CuckleChunckle — UI SDD (display law)

Phone-first dashboard, generated whole by `generate-page.mjs` into `index.html`. Existing CSS in
that file only. No chart library, no npm, no new tokens, no SlabSlip chrome.

**This file describes what ships.** If it and the generator disagree, the generator wins and this
file is wrong — fix it in the same pass. What we *want* → [`PRODUCT.md`](./PRODUCT.md). What the
scripts emit → [`ARCHITECTURE.md`](./ARCHITECTURE.md). Pricing → [`VALUE_SDD.md`](./VALUE_SDD.md).
Votes → [`VOTES_SDD.md`](./VOTES_SDD.md). Data tab / direction → [`DATA_SDD.md`](./DATA_SDD.md).
Cosmetics → [`COSMETICS_SDD.md`](./COSMETICS_SDD.md).
Phone behavior (Apple HIG adopted as Cuckle law) → [`HIG_SDD.md`](./HIG_SDD.md).
Known defects → [`DASHBOARD_AUDIT.md`](./DASHBOARD_AUDIT.md).

---

## 1. Two rooms

**Home** (no seat picked) is the daily paper: a Linear-style floating pill
**Home | Teams | News | Ledger | Menu** at the true bottom (the slot the News Feed peek used to
occupy), then the digest — **Cuckle trade calculator** and signed-in **Trade Desk**.
**News** is a peer tab (signed-in **Alerts** + the league feed). **Menu** is the hamburger;
it opens a glass popover above the unchanged pill. It is the water cooler.
The `Score as` clock is not on it; the clock lives in the brand header on screens it applies to
(§2a).

**Alerts** live on the **News** tab. They may name a wager or an uncast vote. Omit the strip
when signed out. When signed in and nothing is waiting, keep the heading and leave the slot
blank — do not fill it. That is an *action*, not a personal bag number. Lineup recaps, waivers,
and bag totals stay off Home. The calculator door is its own row on Home — it is not an Alerts
filler. Home does not remount the Recent Trade chip; the vote notification on News is the door
into that deal. The News tab may badge a gold count of missed alerts + unseen posts (`9+` cap).

**Team home** is what you get after picking a name in the **Teams** tab. **You are that seat.**
Six style tiles, an optional league chart, your best and worst deal, your two edge partners, your
best and worst rookie pick. Every number is first-person for that `user_id`.

Do not merge them. Home must not grow a personal number, and team home must not become a league
recap.

---

## 2. Chrome

**HAVE (2026-09-08).** Brand row: back chevron (`#goBack`) · wordmark · centered league name
(`#leagueSub`). `#leagueSub` always returns to **League Home** (`goLeagueHome()`). There is
**no `#goHome` icon** and no `class="go-home"` — a generate-time guard forbids both. Do not
invent a house icon. From a seat, `#goBack` steps Teams (seat home) then Home tab; the league
name skips the stack and lands on the digest.

**There is no seat picker in the header** and **no Teams-chip dropdown.** The **Teams** top tab
is the only door into a seat: a ten-row list in last season's finishing order. Selecting a name
is not "view as": it swaps the whole app to that seat.

`h1.brand` keeps `overflow: visible` and keeps its assertion. The row still holds focusable
targets with outline rings; a clip here turns it into a scroll box, and it has been re-clipped
twice already (7f97711, then f9fdb39). The invariant is cheaper to keep than to rediscover.

**The Teams tab lists every seat** in **last season's finishing order**, with that seat's
equipped **title banner + emblem** under the name (blank slots until they equip). The
champion still carries a gold crown. Three rules hold it together:

- **No "Team" / "None" row that only clears the seat.** `#leagueSub` and the **Home** tab do
  that. The list is ten seats, not eleven.
- **The order is derived, never written down.** `title-path.mjs` is the only script that walks
  `previous_league_id`, so it derives the standings there and writes `place` onto
  `data/ui/members.json`, which is the file the Teams list reads. The rule: **the winners bracket's
  placement games (`p`) settle every team they place, then regular-season record — standings
  points, then points for, then `roster_id` — orders the rest.** The losers bracket is not read;
  its `p` is a place inside the consolation round, not a league place. When 2026 completes it
  becomes the order with no code change. 2025 reads SF69erss, TipsUp, TedCumberbatch,
  KingHenryXXVI, TrumanCooper, DarkWingDucks2023, bigjberg, ChiefGumby, ARae, BubbaCuckShremp.
- **Rows stay at least 44px.** Calling cards make the list taller than one screen — that scroll
  is intended. Do not drop the 44px floor to squeeze ten banners into the first viewport.
  An eleventh seat still fails the build.

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

**The league ticker is deleted.** Most lopsided lives on History → League lists. Most active /
Least active are not pressable destinations.

**Seat tabs** appear only when a seat is picked: `home` · `trades` · `partners` · `drafts`. They
are a `tablist` with roving `tabindex` and arrow keys. There is **no `league` tab** — see §8.

**Score as** is a dropdown, not a row of chips, and it is the only clock control. It is a
content chip (`chip-lens-btn`) with a fixed `#scoreAs` portal — **not** inside `h1.brand` (§2a).
Five windows:

| Key | Label (shipped) | What it scores |
| --- | --- | --- |
| `t0` | Date of Trade | Accept day. Picks are still picks. Unfiltered. |
| `y1` | 1 season | Year-end mean over the first year. Hides deals younger than that. |
| `y2` | 2 seasons | Same, two years. |
| `y3` | 3 seasons | Same, three years. |
| `all` | as of today | **Default.** Mean of year-ends from accept through today, became-player. Unfiltered. |

`t0` and `all` are unfiltered; `y1`/`y2`/`y3` hide a deal that has not lived the clock and say so
above the list (`livedHint`). The dropdown button carries a dot when the clock is not `all`.

### 2a. Where the clock lives, and where it does not

It is **not** in the brand header. A generate-time guard forbids a clock control inside
`h1.brand` (the 288px row cannot hold wordmark + `#leagueSub` + a window name). The trigger is
a `chip-lens-btn` on the screens that use a clock; the menu portals to fixed `#scoreAs` so
`render()` replacing `#app` cannot destroy the open panel. `paintLens()` runs after the body is
built, because `renderDrafts()` pins the clock for its own render and restores it on the way out.

The visible label is **the window alone** (`as of today`, `Date of Trade`, `2 seasons`) — not
`Score as …`. `Score as` lives in the accessible name. The brand row must not grow a second
copy of this control.

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

All five are flatten-only. **The today multi-source blend is not on this menu.** Trade rows still read
`windows[lens]`. The calculator (`?view=calc`) is the first screen that **renders** the today /
`even` blend. Whether the blend also earns a sixth Score-as entry is an open user decision
(`DASHBOARD_AUDIT.md` §8c).

URL state: `?me=<display name or user_id>&view=<tab>&t=<transaction_id>&lens=<key>&title=<season>&tab=<homeTab>`.
`tab` is `teams` / `news` / `ledger` / `history` when those tabs are open; omitted on Home.
Stored `homeTab=league` is an alias for Home. Boot reads every param; an unknown value falls back
to Home rather than throwing. `history.replaceState` fires only when the URL string actually changes.

### 2b. Five cells (Linear pill)

Four labeled destinations plus Menu in a floating pill:
**Home | Teams | News | Ledger | Menu**. Not a top underline bar. First tab label is
**Home**. `homeTab` stores `home`. Menu is three stacked lines only (`aria-label="Menu"`).
Tapping it opens a **separate** glass popover above the pill: header (gold mark +
**More**), then **Calculator**, **League Data**, **Settings** as icon + label rows
with a gold capsule on hover / selected. Three reserved slot nodes stay in the
card; empty slots collapse (Linear hamburger pattern from the rizz_abh video).
The pill stays a pill. No dim overlay. No + FAB. League Data keeps the
internal id `history` (`?tab=history`; `?tab=data` also opens it). News is `?tab=news`
(`?view=news` remaps onto it). Ledger may badge as a gold dot. News may badge a missed
count. No sixth cell. No + FAB. Calculator, Settings, and Titles stay sub-screens.

---

## 3. Home

**Alerts** — on the **News** tab, not Home. Omit if signed out. Signed-in: at most three
notification rows (wager / uncast vote), or a blank reserved slot when nothing is waiting.
Tap a wager → Ledger. Tap a vote → that deal’s review screen (H2H chip + **Who won this
trade?**). Do not fill with the calculator or a news teaser.

**No Recent Trade chip on Home.** The vote row in Alerts opens the deal. The H2H chip still
renders on the open-trade screen and on Teams / History feed cards.

**Cuckle trade calculator** · its own row on Home. Title-style gold banner (cartoon calc
plate). Opens `?view=calc`.

**Trade Desk** — omit if signed out (same rule as Alerts). Signed-in: one to three talks,
and **every card includes you**. Never a pair of two other managers. Prefer three different
counterparties and one of each job: **Fill** (you are thin — receive a startable), **Move**
(you are deep — send extras / 2-for-1), **Even** (closest even-up). Pair label is
`You ·` the other seat. Each seat is classified from the **current bag**
(Win-now / Reload / Rebuild) using stud share, pick capital, and value-weighted age.
Historic Win-now / Investor tape labels do not set the route and do not move any number.
Talks prefer complementary routes and 2-for-1 **depth for a stud** when one seat is deep
at a position and the other is thin there; even-up is the floor. Meta may name a
flatten-vs-today split (`markets bid up` / `markets cooler on` / `new on the market books`)
and a buy / fair / sell chip from `pe.json` — signal only. Partner memory (from
`trade_boards.sides` + `windows.all`, threshold `GRADE_EVEN`) may add `you extract vs X` /
`they extract vs you` / `even tape vs X` — words only, no numbers. A caption under the
lede may count still-held firsts (`You still hold N 2027 1sts…`) from `calculator.json`
picks. Startable floors: QB 2 / RB 2 /
WR 3 / TE 1 at today ≥ 2200; stud ≥ 5500; deep = 2+ extras above 1800. Tap opens the
calculator with **your** outgoing pieces on side A. No bag numbers. Do not invent a
fourth card or “Open the calculator” filler.
The News Feed is the **News** tab (Alerts on top, then the league list). It is not a
Home door and not a bottom peek.

Draft Data, Cuffs, Champions Path, and League Data Sets live on **Data**, not stacked on Home.

### 3b. Calculator

`?view=calc`. Two sides stacked (Team 1 sends / Team 2 sends — the picked team's
roster pieces they would give up). Team pickers are optional
button menus (not a native `<select>` — remounting that on iOS reopened the team list).
The open list sits **in flow** under the header so `.calc-block { overflow: hidden }` cannot
clip it to two names. Picking a name closes the menu and ignores the ghost tap that would
open it again.
With no team, search stays on: typing players or picks searches the whole today book
(research — owner in the meta). Choosing a team **drops the search bar** and opens a
**self-contained scroll list** of that seat’s remaining roster plus still-held draft picks —
**one list, highest today value first**, no second Players / Draft picks grouping, no
duplicate rows, no raw Sleeper ids labeled “Player”. The pane keeps its scroll through
re-renders; a team change starts at the top. Every row shows the today value. Tap highlights a piece (tap again to clear); many can be on at once. **Done** adds
the highlighted set to that side and closes the list. **Close** dismisses without adding.
**Add from roster** reopens it. It does not wipe pieces already on that side. Selected
assets are rows (name, pos/team, value, remove). Card footers stay the raw today blend
(sum of listed pieces). Compare bar is **receive** amounts with Value Adjustment folded
in via `applyVa` on the flipped bags (stud-for-quantity bump lands on the side that
receives the star). Gold fills toward the manager the value is going to — not send
package size. **Favors** names the manager who would **receive** the larger
VA-adjusted pile. Even-up copy and leftover chips stay on the short **send** pile;
league leftover stays raw capital percents. After both sides are priced, **League
leftover** is percents of league capital (from → to), not bag totals.
A **Vote** nudge may open the last tape deal between those two names when the room has
no choice yet. Roster meta and selected player rows may chip buy / fair / sell from
`pe.json`. Pick rows show a collapsed became / still-a-pick line and a **tape** toggle
for hop values. Price book is today
/ `even` (0.25 flatten + 0.30 KTC + 0.25 FantasyCalc + 0.20 DynastyDealer, renormalized)
plus Value Adjustment via `calcReceiveTotals` / `applyVa` on the hypothetical receive
bags. Trade Desk even talks reuse that helper. Team home has a
**Price a deal** door (wipe first; if you are not that seat, A = you and B = them).
Votes do
not appear on a hypothetical and do not change the number. How-it-works copy does not
sit on the screen: one **Info** control at the bottom opens the blend formula,
the VA formula (`0.15 × extras × star × damp`), and a
worked example.

### 3c. Titles and Emblems

Profile barracks (`?view=cosmetics`) from Settings → Profile and Account. Shared catalog of 88 (44 matched title↔emblem pairs).
Equip one title and one emblem. The title **list** is a 3-column grid of the same
1024×180 crop scaled down (about 15 rows for the current book; extra titles wrap to
more rows). The equipped calling card and the detail sheet stay full-bleed.
Championship titles outrank every other award in sort and prestige. Locked shows the
requirement; unlocked shows the receipt. Visual only. The equipped pair paints as a calling
card on **that manager's team home** (under the seat name, above the four tabs). Your equipped
emblem also paints next to your seat name; the title shows on the barracks / Profile plate.
Broader title paint across the app is later — see [`COSMETICS_SDD.md`](./COSMETICS_SDD.md) and

[`plans/awards_titles_emblems.md`](./plans/awards_titles_emblems.md).

**Data** is the league deal-research terminal (visible tab label; internal `homeTab` stays
`history`). Law: [`DATA_SDD.md`](./DATA_SDD.md). Cold load is three panes: **Moves** (Plan
of 3–5 impact picks, then Give / Get color books Dart → Star), **League** (ten
full-width cycle rows: Hard rebuild / Rebuild / Reload / Win-now), and **More**
(Book · Tape · Lists · Draft · Cuffs · Seats). The 12-tile encyclopedia is not
the cold load. Hunts and Home Move are gated on each seat’s buy / sell / refuse
from `seat-direction.json`. A hole is a fact; intent decides who to ping. Tap a
League row for that seat’s cycle, intent, and 1–3 pings. Do **not** call `selectMe` from
League (that is Teams). There is **no Data top search**. Book has pos / seat / sort
dropdowns; Tape has year chips. Plan may cluster in one size. Color is the
category. No bag totals. A row opens the calculator first-person (A = you,
B = them). The **trade block** is league-readable and owner-write on
`public.seat_trade_block` (cap 8). Snapshot facts stay on desks.
**Teams** is the door into a seat (header picker stays gone — §2). Do not put bag totals on Home.
Do not restore Best 10 / Worst 10. Style labels (Win-now / Rebuild) may caption a row; they
must not move a clock or a delta. Votes never enter these numbers.

**League Data Sets** (Data → Lists) — one list on screen. Five sets: Most lopsided trades · Most
passed around · Least traded · Forever players · Homesteaders. **Nothing is selected on a cold
load.** The Home tab and a Data back chip both return to Data (Moves) / Lists.

The old popup dropdown is gone. Rooms are in-flow. Data has no top search.

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

**Equipped title + emblem** sit directly under that heading as the same calling card used in
barracks (thin banner + 40px mark). Omitted on team home when that seat has not equipped
either. The **Teams list** always paints the card: selected art when they have equipped,
blank banner + blank emblem when they have not. Anyone opening the seat sees that pair —
not the viewer's.

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
- The five league tabs share one row and never wrap.
- 44px minimum on every tap target (`HIG-01` in [`HIG_SDD.md`](./HIG_SDD.md)), including the team
  menu, the year filter rows, the chips and the Score as trigger and all five of its options.
  When a list of them stops fitting, the list's cap gives way, not the 44px.
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
