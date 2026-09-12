# League memory — receipt law

**Role:** The dashboard’s second job after the needle. League members remember
seasons, seats, and trades wrong. Chuckle is the receipt they can open and text.

Companion: needle / clocks [`PRODUCT.md`](PRODUCT.md). Trade open row + hop tape
[`UI_SDD.md`](UI_SDD.md). Aged math [`VALUE_SDD.md`](VALUE_SDD.md). Data desks
[`DATA_SDD.md`](DATA_SDD.md). Store five-tab law [`STORE_LAW.md`](STORE_LAW.md).
Formats / empty first year [`FORMAT_BOOKS.md`](FORMAT_BOOKS.md).
Which Cuckle fights to put on the door
[`DEBATE_CATALOG.md`](DEBATE_CATALOG.md) — tape-ranked, not a 17th chip.

This file is **WANT**. If the generator disagrees, the generator is behind — fix
the page in the same pass as any UI that claims to be proof.

---

## 1. The argument we exist to settle

Sleeper’s trade log is bags of names. People fill the rest from ego.

Typical lies (all first-person, all common):

- “We have always been a playoff team.”
- “That CMC trade was a smash.” / “I got robbed.”
- “That 2022 first became nothing.” (it became the player — or it was flipped)
- “I never sell picks.” (hop tape says otherwise)

The product answer is not a lecture and not a Best 10 board. It is a **small
chip they can tap, read in one breath, and send in the group text.**

The user sentence we are building for:

> That’s not how I remember it. Look.

Votes, news, and Ledger are opinion. They may *start* the argument. They may
not write the receipt.

---

## 2. Closed chip catalog (16 kinds, one paint)

About a hundred group-chat fights collapse to **16 chip kinds**. Every kind uses
the same paint. Do not invent a 17th kind for each argument.

**Memory (a specific thing happened)**

| Id | Door label |
|----|----------|
| `my_trades` | My Trade History |
| `league_trades` | League Trade History |
| `my_draft` | My Draft Picks |
| `league_draft` | League Draft Picks |
| `profit_loss` | Profit / Loss |
| `season_place` / `season_title` | How I finished |

Share chips (same tape, not board tiles): `trade_mark` (Trade ticket),
`pick_print` (What my pick became). Saved boards that still store
`lopsided` / `trade_mark` / `pick_print` / `my_picks` remap onto the
four history doors.

**Who (a list behind the door)**

| Id | Door label |
|----|----------|
| `passed_around` | Passed around |
| `least_traded` | Least traded (catalog only) |
| `forever` | Never left |
| `homesteaders` | Homesteaders (catalog only) |
| `past_champions` | Who won the year |
| `widest_clock` | Same smash/bust if you change the question (catalog only) |
| `seat_run` | Who has been on a heater / cold streak on tape (catalog only) |
| `draft_marks` | Draft hits (`seat_draft`) |
| `held_firsts` | Who has firsts (`firsts_held` / `held_picks`) |
| `vs_you` | Me vs them |

**Today’s bag (research; opens calc or a hunt, still no bag-total hero)**

| Id | Question |
|----|----------|
| `fill_holes` / `move_extras` | Who has what you need / who can take extras |
| `uninsured` / `cuffs_board` | No backup |
| `book_top` | Biggest names (highest **pieces**, not a seat total) |

**Banned as chips:** `best10`, `worst10`, `bag_total`, `realized`, career
`win_now` / `investor` as a grade, luck, H2H, vote tallies, Ledger stakes.
Direction (Hard rebuild) stays a **label on League rows**, not a “best
rebuilder” trophy.

The 27-id Data encyclopedia under **More** still exists for desks. It is not
Your board. Your board is thirteen labeled doors from these 16 kinds.
The example lives **inside** the portal list, not on the tile face.
Which fights to rank first is in [`DEBATE_CATALOG.md`](DEBATE_CATALOG.md)
from this league’s hop tape — not from Sleeper chat.

---

## 3. Readability law (anyone knows in one breath)

Every chip and every deeper screen is the same three lines, in this order:

1. **Verdict** — one English sentence. Not `t0`, `aged`, `Δ`, `2qb`.
2. **The number** — one signed figure, gold, big enough to read at arm’s length.
3. **Because** — one short clause that names the clock or the hop. Optional on
   the chip; required on the ticket.

If a stranger cannot finish the sentence “so this means ___” after two seconds,
the copy is wrong. Finance geometry (curve, spark, waterfall) is **support**.
It never replaces the verdict.

**Clock names on glass (never internals):**

| Internal | On glass |
|----------|----------|
| `t0` | **Day they traded** |
| `y1` / `y2` / `y3` | **After 1 / 2 / 3 seasons** |
| `all` | **From then to now** |
| `aged` (all − t0, same flatten book) | **How it aged** — caption: faded or grew after they accepted |

Signed numbers stay green / red. Incomplete legs stay listed and stay out of
the number.

---

## 4. Click-by-click copy (lock these headlines)

One stack, one Back, no new pill. Home / News / Ledger unchanged. No receipts
on Home. Share is a **small icon** on the ticket (44px hit, not a gold banner).
It does not live on the door.

### L0 — Your board (History / Data)

Heading: **Your board**. Two-column doors. Hold a tile, then drag to
move it. Face is
**house icon + label only**. No verdict sentence, no gold example number,
no who-line, no share icon on the door. Icons exist so a thumb can find
the room at a glance.

Search and filter do **not** live on the board — they live inside the
portal after you tap. Every filter is a labeled dropdown (`receiptLookSelect`).
No bubble / pill / chip rows. No All / Memory / Who / Research chips on the board.

Each tile is a **door into a scenario**, not a finished receipt. Tap = that
scenario’s list. Search there for a specific team, trade, pick, year, or seat.

**Default thirteen doors** (first visit; saved boards remap Trade THEN/NOW and the old pick doors onto these four):

1. My Trade History (`my_trades`) — your partners, most deals first, then that pair newest-first
2. League Trade History (`league_trades`) — every pairing, most deals first, searchable
3. My Draft Picks (`my_draft`) — Used / Traded away / Traded in, each graded
4. League Draft Picks (`league_draft`) — pick a seat, then the same three buckets
5. Profit / Loss (`profit_loss`) — every player you traded, held vs sold
6. Who won the year (`past_champions`)
7. How I finished (`season_place`)
8. Me vs them (`vs_you`)
9. Who has firsts (`firsts_held`)
10. Never left (`forever`)
11. Passed around (`passed_around`)
12. Draft hits (`seat_draft`)
13. No backup (`uninsured`)

**Hold, then drag** is how they reorder. Mouse can drag without a long
press. The first four doors wear a gold ring — that is the top 4, and
those four also sit on Home for instant access. Hint on the board:
`Top 4 wear gold. Hold a tile, then drag to move it.` **Edit** still adds or removes a door
from the catalog. Unsigned / outsider: default thirteen. A shared link opens
one public ticket, not someone’s private layout.

**Door face (every tile)**

- House SVG icon (gold stroke, ~28px)
- Label in the table above
- Nothing else

**My Trade History**

Tap the tile. First screen is **your partners**, most deals first, count
on the row. Tap a partner. That pair’s tickets, newest first. Filters on
the deal list: **League year** and **Look** dropdowns (Smash / Robbery /
Grew / Faded / Even). Smash and Robbery score the accept-day mark (`t0` — **Day they
traded**). Grew, Faded, and Even score how it aged (`all − t0` —
**From then to now**). Tap a deal → L1 ticket. No claimed seat:
`Claim your seat to see your partners.`

**League Trade History**

Same two steps. First screen is **every pairing** (`NameA vs NameB`),
most deals first, searchable by either seat. Tap a pairing → those
tickets, newest first, same year + look dropdowns.

**My Draft Picks**

**Draft bucket** dropdown: Used / Traded away / Traded in (default Used).

- **Used** — this seat drafted a player on that pick (`became` and
  `used_by` match).
- **Traded away** — an original pick of this seat that they sold.
- **Traded in** — a pick they took from another seat. A pick can be
  Used and Traded in (trade for a 1st, then draft it).

Each row grades the player vs the slot (Star / Hit / Even / Miss /
Bust). The section prints a **Hit rate**. Held unused origin picks stay
off these three (Who has firsts covers that). No claimed seat: the door
says so.

**League Draft Picks**

First screen is **every seat**, most used + away + in first, searchable.
Tap a seat → the same three chips + grades as your own door. Back:
`← Seats` then `← Your board`.

**Profit / Loss**

Tap the tile. One row per player this seat has traded (named player
legs only — picks stay on My Draft Picks). Sorted by the biggest
absolute number.

- **Held** — still on this roster. Number is today minus the day they
  got them (unrealized).
- **Sold** — last move was a send. Number is the day they sold minus
  the day they got them (realized). No inbound trade: **Sold vs now**
  (today minus the sale). Drafted then sold uses the slot as cost.
- **Left** — they received the player, then the player left without a
  sale. Number is today minus acquire. The Sold menu includes Left.

Filters are **dropdowns**, never pill chips (HIG-23). Hunt position and
tape year use the same constructor:

1. **Held or sold** — unrealized vs realized. The question.
2. **Ahead or behind** — who printed and who died.
3. **Position** — QB / RB / WR / TE. Search covers a name.
4. **League year** — year of the last move.
5. Sort is locked to **biggest |number| first**. Newest-first hides the
   fight on a seven-year tape.

No net bag total on the door. The count line is `held · sold · left`.
Tap a row → the last trade ticket. No claimed seat: the door says so.

**Season / finish portal**

- Who won the year: year · seat rows. Tap → existing Past Champions body.
- How I finished: seat · place list.

A door’s list is the **catalog**, not one lead example. Tap a row → that
object’s ticket. Share lives on the ticket.

### L1 — the ticket (one scroll)

Same chrome as today’s open-trade / titles screens: Back, league name,
small share icon in the header. No new app.

**If they tapped a trade chip**

Top of screen, always visible before the bags:

- Verdict (h2): `Truman came out ahead — from then to now.`
- Big number: `+184`
- Because: `On the day they traded it was +312. It faded 58 after accept.`

Then, in this order only:

1. **What each side got** — names first, values second. VA in English:
   `Value Adjustment +80 (extras on the thin side).` Incomplete: `No price yet`
   not `no DP row`.
2. **Same deal, different question** — **two chips first**: `Day they traded`
   and `From then to now`. **More clocks** reveals After 1 / 2 / 3 seasons.
   Hollow if not lived (`Only 11 months so far`). Tap = same ticket, new
   verdict and bags. Never say “clock” to a novice — say **question**.
3. **How the received bag moved** — existing spark. Caption always:
   `What they received, year by year. A break is a missing year, not a zero.`
4. **Picks in this deal** (only if a pick is in a bag) — one row each:
   `2022 1st · became Bijan · tap for the journey`.
5. House SVG **How it aged, year by year** only after 1–4 exist. Caption:
   `Each bar is a year-end mark. We do not guess injuries.`

`Remember it differently?` on a normal open-trade row jumps to this **same**
trade ticket.

**If they tapped a pick chip / pick row**

- Verdict (you owned it): `You sold this 1st. They used it. It is Bijan now.`
- Else: `This pick was sold, then used. The player is Bijan.`
- Then the hop list (L2). No trade bags unless they tap a hop that names a trade.

**If they tapped a season chip**

- Verdict: `ChiefGumby won 2025 in the bracket.`
- Existing Past Champions body (record, used picks). No second trophy wall.

### L2 — tap a pick row: the journey

- Verdict: `You sold this 1st. They used it. The player is Bijan.`
- Because: `The trade number follows Bijan. Your hold ended at the sale.`
- List, newest first, each line English:
  `Apr 2024 · used by TipsUp · Bijan` /
  `Aug 2023 · you sold to ARae` /
  `Sep 2022 · you got this pick`.
- No hop P&L on the same chart as the deal. If we show a sold-at number, it is
  a caption on that one hop: `You exited here.`

Tap a hop that names a trade → that trade’s L1. Tap a name → L3.

### L3 — tap a name: this seat

A sheet (not a new tab). Back dismisses.

- Verdict: `Truman: one title. 8th in 2023.`
- Place list (year · place). Gold on their row.
- One line: `vs you` + a single trade chip if they have tape together.
- **See their team** already exists on Teams — this sheet does not become a
  bag-total page.

---

## 5. Share contract (member and outsider)

The group chat is the courtroom. A PNG is optional garnish and **must print
the URL** if we add one later.

**URL** (aliases in brackets):

```
/?r=trade&t=<tx>&league=<sleeper_id>&lens=all&src=share
/?r=pick&pick=<asset_key>&league=…&src=share
/?r=title&title=2025&league=…&src=share
```

Honor existing `?view=trade&t=` and `?tx=` as the same as `r=trade`. Default
`league` = Cuckle when omitted so old links still work.

**Text first** (OS share sheet). Shape:

```text
This deal faded after they accepted.
TipsUp vs Truman · +184 from then to now · aged −58
https://…/?r=trade&t=…&league=…&src=share
```

Longer card (same facts, still no calc PNG):

```text
Cuckle · from then to now · RECEIPT
TipsUp vs Truman · 2022-09-14
Got: …  Gave: …
+184 · it faded 58 after they accepted
https://slabslip.github.io/cuckle-trade-tracker/?r=trade&t=…&league=…&src=share
Your league: open that link → Create a league → paste your Sleeper ID
```

Calc already shares a **priced hypothetical** as a picture
([`UI_SDD.md`](UI_SDD.md) §3b). That is a proposal. Proof share is a
**completed** Sleeper fact plus the book. Do not reuse `calcShareNow` as the
memory receipt.

`shareProofNow()` — text + `navigator.share` / clipboard. Shares **this layer**.

---

## 6. Public receipt + import CTA

When `src=share` (or `r=` + no session):

1. **Do not** set `appScreen = "gate"`. New `appScreen = "receipt"`.
2. Load `data/leagues/<league>/ui` (Cuckle may fall back to `data/ui`).
3. Paint L0/L1 from the query. Votes, Ledger, Desk, Menu create-league-for-
   Cuckle-admin stay off.
4. Sticky footer (not covering numbers):
   `This is {league name}’s book — completed trades, named clocks.`
   **Get this for your league** → signup → Create a league → paste Sleeper ID.
   Secondary: Sign in. Later: TestFlight.
5. After they create **their** league, land on their pending/ready home — do
   not keep them on the demo trade.

Privacy: public Pages tape only. No `seat_data_dash`, no Ledger, no vote
identity. Showing Cuckle (or any synced league) numbers to a stranger is the
demo. That is the point.

---

## 7. Where it sits (do not grow the bar)

| Surface | Proof job |
|---------|-----------|
| **Home** | No personal bag hero. Trade Desk / calc stay *today’s* deal. The top 4 doors from Your board sit here for instant access. A proof chip does not remount News. |
| **Teams** | Seat place + titles already argue “historically good.” L3 sheet is a peek, not a bag-total page. |
| **History / Data** | Home of **Your board**. Cold load is the doors only. Still one Data cell. |
| **Open trade** | Long receipt. Share proof. `Remember it differently?` → same L1 ticket. |
| **Pick hop** | Journey. Share proof. English hops. |

No + FAB. No sixth pill. No SwiftUI port of this. No Chart.js.

---

## 8. Edit board

Hold a tile, then drag to reorder. Edit still hides or adds from the catalog.
Persist per seat per league
(`seat_data_dash` + local `cuckle.data.dash.v2.<league>.<seat>`). Outsider:
default thirteen, no edit. Shared link still opens one ticket, not the
editor’s private layout. The v1 key is retired so old example-chip boards
reload as the thirteen doors. Saved boards that still store Trade THEN /
Trade NOW / What my pick became / My Picks land on the four history doors.

---

## 9. Portability

Proof that is only Cuckle’s tape is a private scrapbook. A second Sleeper
league must see **their** trades, hops, and titles after `league-sync`.
A 2026 startup with three trades gets three chips, not a broken seven-year
path. Wrong format book (1QB scored as Superflex) is a false memory — worse
than no app. Empty title slot copy lives in [`FORMAT_BOOKS.md`](FORMAT_BOOKS.md).

---

## 10. Acceptance

A member can: find a door by icon + label → tap **My Trade History** →
see partners, most deals first → tap a name → newest tickets → filter
League year or Grew / Faded → open a deal, see two questions first
(Day they traded / From then to now). Tap **League Trade History** →
search a pairing → same tickets. Tap **My Draft Picks** → Used /
Traded away / Traded in → read the Hit rate → tap a pick →
“You sold this 1st. They used it. It is X.” → share icon on the ticket →
reopen on the same layer. Tap **League Draft Picks** → pick a seat →
the same three buckets. A nerd can Edit the board, reorder, reload on
another phone, same layout.

Two-second test (novice): they can say “so it looked better when they traded,
and now it’s worse” and “that 1st I sold is Bijan now.” They never have
to say aged, t0, or Superflex.

An outsider can: open the same link unsigned → **read the real numbers** →
tap Create a league → make an account → paste a Sleeper ID → leave the demo
book.

Still out: sixth tab, chart npm, Best 10 / Worst 10, bag-total heroes, career
Win-now trophies, luck / H2H chips, merging hop P&L into the needle, Swift
rewrite, App Store as the only door, teasing/blurring the receipt, a different
UI for nerds vs novices (same ticket, More clocks / Edit board only).
