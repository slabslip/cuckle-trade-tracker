# Format views — one app, two environments

**Role:** How a league book looks and prices once the user is signed in.
Companion: [`FORMAT_BOOKS.md`](FORMAT_BOOKS.md) (detection), [`DATA_SDD.md`](DATA_SDD.md)
(Cuckle Data law — dynasty), [`COSMETICS_SDD.md`](COSMETICS_SDD.md) (Cuckle barracks),
[`REDRAFT_TWO_PROVIDER.md`](REDRAFT_TWO_PROVIDER.md) (GM sources).

One Chuckle app. Login is username + password. That user adds leagues and invites
mates. Opening a league loads **that book**. Same five-tab shell and theme.
Clocks, tiles, titles, calculator, and Team Ideas follow `league.format`.

CuckleChunckle is dynasty Superflex. GM is 1QB redraft. Toggling must not mix them.

---

## 1. Locked shape

- Canonical key = current Sleeper id. Invites claim **this** Sleeper seat.
- Format is `redraft` / `keeper` / `dynasty` × `1qb` / `2qb` from
  [`lib.mjs`](../lib.mjs) `detectLeagueFormat()`.
- Sources attach to the book: extra Sleeper ids, ESPN id(s), Yahoo season keys.
- Live Sleeper format wins. ESPN/Yahoo never change `kind` or the value book.
- Overlapping year → later/live host wins. Locked years stay empty.
- Rebuild is per league. GM must not write `data/ui` or Cuckle’s Superflex curve.

## 2. Dynasty (unchanged)

Cuckle law stays in [`DATA_SDD.md`](DATA_SDD.md), [`PRODUCT.md`](PRODUCT.md),
[`COSMETICS_SDD.md`](COSMETICS_SDD.md).

- Five Score-as windows. Superflex today blend.
- Your board default starts My trades / League trades / My draft / …
- Hard rebuild / 2027+ direction. Future firsts. 2019 Never left.
- Full 136-id matched catalog. Dynasty Immortal / Established names stay.

## 3. Redraft environment

Same layout. Different doors, copy, and cuts.

### Clocks and needle

- Date of Trade + as of today only. No y1/y2/y3 chips.
- 1QB flatten (`value_1qb`) unless that redraft is Superflex.
- Trades / calc / P&L reprice on **this** book’s curve. ESPN native points do
  not enter the needle.
- Week scores, place, and crowns stay that season’s native facts.
- VA stays on complete two-team deals. 0 on N-ways / incomplete.
- TEP is a flag. Consolation weeks do not set the low.
- Incomplete current season is out of How I finished.

### Your board (13 doors)

`season_place`, `week_scores`, `past_champions`, `firsts_held`, `uninsured`,
`my_trades`, `league_trades`, `my_draft`, `league_draft`, `vs_you`,
`profit_loss`, `available_cuffs`, `passed_around`.

Parked on redraft (hidden from the library): `stash_young`, `draft_board`,
`held_picks`, `widest_clock`, `seat_aging`, `seat_run`.

| Door | Redraft meaning |
| --- | --- |
| How I finished | Completed imported years they played. Average of those. |
| Week scores | Native points. Hunt weeks only. Year named on the row. |
| Who won the year | Real crowns only. Host year tagged. |
| Firsts still here | This season’s first-round **players** still on that roster. |
| No backup | Starter whose NFL cuff is not rostered. |
| Trades / Me vs them | t0 and today. History years once the host authorized. |
| Draft | This season’s snake. Used = the player they became. |
| This season P&L | Held vs sold **now**. Career is finishes + tape. |
| Wire cuffs | Free-agent cuffs, your holes first. |
| Moved this season | Churn on this bag. |
| Never left | This season’s draftees still here. Not a 2019 homestead. |

### Team Ideas

- No Hard rebuild / downgrade / 2027 picks.
- Wants: upgrade and buy to plug holes; sell surplus; swap for a better start.
- Pace: “this season · plug QB/RB” or “raise the weekly floor”.
- 1QB desk cuts (stud / start / mid) are lower than Superflex 5500/2200/1800.

### Calculator

- Prices `calculator.json` for **this** league (1QB flatten on GM).
- Brand is “Redraft calculator” (GM door stays #1GM calc).
- No future dynasty picks in the roster list.
- Wipe legs on league switch so Superflex values cannot sit on a 1QB bag.

### Titles and emblems

Same barracks chrome. Redraft catalog **drops** dynasty-only pairs:
Pick Collector, Pick Path, Sold the Farm, Investor, Win-Now, Firsts Merchant,
Aging Gracefully, Loyalty (prior-year core).

Rename on redraft only: Dynasty Immortal → Four-Time Champion,
Dynasty Established → Three-Time Champion. Inaugural is the **first
championship year in this book**, not hardcoded 2019.

Cuckle’s `data/ui/cosmetics.json` is not rewritten by a redraft build.

## 4. Multi-source

`providers.json`: `sleeper_extra_ids`, `espn_league_id`, optional
`espn_extra_ids`, `yahoo_league_ids`.

Merge: live Sleeper → extra Sleeper → ESPN years Sleeper lacks → Yahoo years
neither has. Seat map: pin → unique name → franchise → one-for-one parked
inherit. Two swaps: do not guess.

Yahoo client is a stub (`yahoo_status.json` reason `not_configured`) until OAuth.
ESPN still needs original-LM cookies for private years. Secrets do nothing
until Rebuild (`league-sync`) runs.

Members claim the current Sleeper seat. ESPN-only names can show on finishes.

## 5. Toggle isolation

On every league open, before the new JSON paints:

- Wipe calc legs, Data filters, ledger bets, pick/cuff/direction/finishes books.
- Abort a stale `loadMembers` (generation token).
- Persist keys **always** include league id. No seat-only fallback.
- Cuckle `SEAT_FLAIR` paints only on Cuckle.
- `authSeatId` is this membership. Unclaimed ≠ last league’s seat.
- Vote reads stay scoped to `sleeper_league_id`.
- News seen-at is per league.
- Failed `league.json` is an error, not silent Superflex defaults.

Required loop: Cuckle → GM → Cuckle. After GM: redraft board, two clocks, no
Hard rebuild, no Cuckle flair-by-name, empty calc. After Cuckle: five clocks,
dynasty board, ARae Hard rebuild, Truman flair.

## 6. What we will not do

- Fork a second app or a second theme.
- Invent ESPN/Yahoo years.
- Convert ESPN points into Sleeper scoring.
- Copy Cuckle crowns, flair, or Superflex curve onto a redraft book.
- Let a redraft generate-page edit change `DATA_DASH_DEFAULT` or Cuckle fixtures.
