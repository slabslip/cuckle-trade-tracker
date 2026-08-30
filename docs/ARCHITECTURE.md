# CuckleChunckle — Architecture (HAVE)

**Role:** What is actually built on **2026-08-30**. Never invent want from this file. Want → [`PRODUCT.md`](./PRODUCT.md). What the screens must do → [`UI_SDD.md`](./UI_SDD.md).

**Repo:** `github.com/slabslip/cuckle-trade-tracker`, public, GitHub Pages deploys from `main`.
(Earlier revisions of this file said "not a git repo" — stale since 2026-08-28.)
Vanilla Node. No `package.json`. Rebuild is `node build.mjs` (or the seven scripts in order).
Serve `index.html` via `python3 -m http.server` from the tracker folder.

---

## 1. Pipeline (source of truth)

```text
sleeper-sync.mjs
  → leagues.json, members.json, seats.json, trades.json, trade_legs.json, trade_tape.json
draft-resolve.mjs
  → drafts.json, draft_picks.json, asset_resolutions.json
value-snapshot.mjs
  → value_curve.json, value_snapshots.json, data/dp/latest/*
revalue.mjs
  → trade_meter.json, leaderboard.json, draft_skill.json
  → data/ui/members.json, league.json, picks.json, me/<user_id>.json
title-path.mjs
  → data/ui/titles.json                       (Champions Path)
  → adds `place` to data/ui/members.json      (last season's finish, for the seat picker)
apply-value-adjust.mjs
  → rewrites data/ui/league.json + me/<user_id>.json in place
  → data/ui/marks.json
generate-page.mjs
  → index.html  (inline CSS + JS; fetches data/ui/*.json)
```

`build.mjs` runs those seven in order. `value-snapshot.mjs --latest-only` skips git history.

**`apply-value-adjust.mjs` is not optional.** It owns the today blend (40% flatten / 60% KTC
Superflex, retired → 0), the Value Adjustment, `trade_boards` and `marks.json`. A build without it
ships the flatten-only book. It reprices from the committed UI JSON, so it is idempotent and runs
in a checkout that has no `value_curve.json` — which is why it, and not `revalue.mjs`, is the
canonical builder of the today numbers. `revalue.mjs` no longer builds `trade_boards` at all.

`ktc-snapshot.mjs` writes the weekly KTC Superflex file and is **not** in `build.mjs`.

---

## 2. League facts (this rebuild)

| Fact | Value |
| --- | --- |
| Current Sleeper league | `1315431339301806080` (walks `previous_league_id` → 2019) |
| Seasons | 2019–2026, 10-team Superflex, name `CuckleChunckle` |
| Members | 10, names pinned in `data/aliases.overrides.json` |
| Raw completed trades | 314 |
| On the meter | 291 (≈23 tossed as one-way / not every seat received a player or pick) |
| Incomplete (no DP row) | 2 — Nick Bosa (2021-05-22); 2021 4th → Micah Parsons (2020-05-16). Both IDP; no `value_2qb` row |
| 3-roster Sleeper trades | 5 raw; **2** survive the every-seat-received-an-asset filter |
| FAAB legs | 0 (never written) |
| `today` | `2026-08-28` (latest curve `as_of`) |
| Full curve | 47,654 rows / 75 distinct `as_of` dates, `2020-04-30` … `2026-08-28` |
| Used curve | 31,138 rows (slimmed to keys this league touches) |
| Pick years in DP | 2020–2028. **2029: 0 rows** |
| `trade_boards.sides` | 574 rows (287 complete 2-team × 2) |

---

## 3. How values are fetched and dated

`value-snapshot.mjs`:

1. Downloads `values.csv` + `db_playerids.csv` from `raw.githubusercontent.com/dynastyprocess/data/master/files/`.
2. Stamps **latest** `as_of` as **today’s UTC calendar date**, not the CSV `scrape_date` and not the git commit time. (On 2026-08-28 those happened to match.)
3. If history is on: shallow-clones `dynastyprocess/data` to `data/.dp-repo/`, walks `git log` on `files/values.csv` and `files/values-players.csv`, keeps the **newest commit per calendar month**, parses each file as that commit’s `as_of` (`%ci` date).
4. Player rows need a Sleeper id (direct, FantasyPros map, or lowercased name). No id → dropped (IDP, unmatched names).
5. Pick names parse to `pickval:{year}:{round}:{slot|Early|Mid|Late}`. Generic `2028 1st` → Mid.

`asofRow` = last curve row with `as_of <=` the query date (step function). Year-end `2025-12-31` actually hits snapshot `2025-12-26`. `2019-12-31` hits **nothing** (curve starts 2020-04-30).

Latest-board pick shape (2026-08-28): current-year exact slots (`2026 Pick 1.01` …), next year Early/Mid/Late + generic Mid, **2028 generic Mid only**. Historical 2020 files are slot-only (no Early/Mid/Late keys).

---

## 4. How a trade is scored (`revalue.mjs`)

**Filter.** Drop FAAB legs. Keep a trade only if ≥2 non-null `user_id`s and **every** one of them received at least one in-leg. That is “no one-ways.” A 3-team seat can still **send nothing** (2023-01-06 SF69erss received a pick only) and stay on the meter.

**Lenses** (per trade, per seat):

| Key | Asset identity | When priced |
| --- | --- | --- |
| `realized` | Pick → who used it → that player, if a player resolution exists at `asOf`; else the pick | `today` and `t0` |
| `pick` | Always the pick (slot/tier/Mid), even if already drafted | `today` and `t0` |
| `y3` **IN FLIGHT** | Same identity as `realized` at **each** snapshot date | Mean of floored snaps in `[t0, min(t0+3y, today)]` from `yearEnds` |

**Needle.** `today_delta = got.points − sent.points` when no leg on that clock is unpriced; else `null`. Incomplete trades stay in `me/*.json` and stay off `realized_total` / `realized_per_trade`.

**T0.** Startup / pre-curve picks are often `unpriced` at accept. If **no** T0 leg has a number, `t0` and `t0_delta` are `null` (2019-07-26 ChiefGumby vs ARae). Trade is still complete on **today**.

**2029.** `pickValue` falls through to the same 2028 round and sets `flag: "priced_as_2028"`.

**300 floor (y3 only, IN FLIGHT).** `floorActive(v) = v < 300 ? 0 : v`. Applied to **every** y3 snap, including still-a-pick Mid values (so a 215-point 2028 2nd becomes 0 on y3). Unpriced snaps are **omitted** from the mean (not zeroed). `off_board` (value 0) is implemented but **unreachable** for anyone who ever had a row — `asofRow` carries last-known forever (Zeke last row 2026-02-27 = 3; today clock still shows 3, flag `null`).

**Style.** 0.55 / 0.45 now-share cut on **T0 pick-lens** bags + horizon = mean(`today_delta − t0_delta`) on complete 2-team. Label only. Not on the needle.

**Hops** (`data/ui/picks.json`). Per `pick:{year}:{round}:{origin_roster}`. Flip exits at hop-local pick price. Only the **drafter’s last hop** exits at player-today (`exit: "drafted"`). Self-check: Garrett Wilson `pick:2022:1:7` has 5 hops, one drafted exit; Breece `pick:2022:1:1` has 6 hops.

**Boards.** Complete 2-team only. Each side stores `today_delta`, `t0_delta`, `aged = today_delta − t0_delta` (null if no T0). Precomputed top-10 all-time live in `trade_boards.today` / `.aged`; the page **re-ranks** `sides` for 3m / 6m / 1y / 3y / all by **trade date** vs `league.today`.

**Partners.** 2-team only. Grade = ±100 DP / complete trade on realized. Headlines need 2+ complete (else 1). 3-team deals are counted in `trades` but not in the pair grade.

---

## 5. JSON shapes the page actually reads

### `data/ui/members.json`

`[{ user_id, name, place, place_season }]`, in `place` order.

`revalue.mjs` writes the `user_id` / `name` pair; `title-path.mjs`, which runs after it, adds
`place` — where that manager finished in `place_season`, the most recent completed season. The
seat picker lists the array in that order and crowns `place === 1`. The rule is the winners
bracket's placement games first, then regular-season record (standings points, points for,
`roster_id`) for the teams the bracket does not place; see `UI_SDD.md` §2. This is presentation
only and never reaches the value book.

### `data/ui/league.json`

```text
{
  traders: [ { user_id, name, two_way, incomplete, pick_total, pick_per_trade,
               even_total, even_per_trade, style: { label, now_share, horizon,
               sold_picks_for_players, sold_players_for_picks } } ],
  drafters_rookie,             // no reader since renderLeague() was deleted
  player_lists,
  trade_boards: {
    sides: [ { transaction_id, date, user_id, name, other, headline,
               windows: { t0|y1|y2|y3|all: { got, sent, incomplete } } } ]
  },
  today: "YYYY-MM-DD"
}
```

266 KB, 576 sides; `sides` is 258 KB of it. A side ships only what the page reads. The pipeline's
own copy also carries `today_delta`, `today_got`, `today_sent`, `t0_delta`, `aged` and per-window
`delta` / `snaps` / `value_adjust` / `value_adjust_sent`, but those stay in the process.

`trade_boards.today` / `.aged`, `review_trades`, `drafters_startup` and `realized_*` were deleted:
nothing read them, and `realized_*` described a book no longer in the file.

### `data/ui/marks.json`

```text
{
  as_of: "YYYY-MM-DD",
  seats: { "<user_id>": {
    name, two_way, sold_picks, sold_players,
    aging: { mean, n }, draft: { mean, n },
    lens: { t0|y1|y2|y3|all: { n, total, per, extract, farmed, even } }
  } }
}
```

6 KB. Every number behind the six home style tiles and the ten-row league chart, for all ten seats
on all five clocks. Before it existed, tapping one tile downloaded every seat file.

### `data/ui/picks.json`

```text
{
  "pick:2022:1:7": {
    label, became, used_by, still_pick,
    hops: [ { date, from, to, t0, out, out_date, exit, transaction_id } ]
  }
}
```

~109 KB.

### `data/ui/me/<user_id>.json`

```text
{
  user_id, name,
  hero: { two_way },
  style, hit, miss,
  partners: [ { name, trades, complete, even_total, even_per_trade, … } ],
  recent_rookies[5],
  trades: [ slimTrade ],
  drafts: { rookie, startup }
}
```

`slimTrade` (every trade this seat is on):

```text
{
  transaction_id, date, season, others[], incomplete,
  even,                        // the today-blend side object for *you* — see note below
  windows: { t0, y1, y2, y3, all },   // flatten-only side objects
  even_year_ends,              // [{ as_of, points: { Name: receivedBag } }]
  other_bags: [ { name, even, windows } ]   // only when others.length > 1
}
```

Side object: `name, today, sent_today, today_delta, t0, t0_delta, unpriced, sent_unpriced,
incomplete, legs[], sent[], value_adjust, value_adjust_sent, t0_value_adjust`.

Leg: `{ label, kind, asset_key, value, flag, became, value_flat }`. `value_flat` is the pre-blend
flatten price and is kept deliberately: without `value_curve.json` in the checkout it is the only
record of it, and `apply-value-adjust.mjs` reprices idempotently from it.

**`even` still ships but no screen draws it.** `sideOf(t)` is
`(t.windows && t.windows[lens]) || t.even || t.realized`, and all 586 trades carry `windows.all`,
so the fallback never fires. `even` remains the basis of the pipeline's own aggregates
(`league.traders[].even_per_trade`, board headlines, the zero-sum checks). Measured gap between
`even.today_delta` and the `windows.all.today_delta` the page renders: mean **975** over 582
sides, max **5,715**. Logged as `DASHBOARD_AUDIT.md` §8c / D5 — a user decision, not a defect to
patch.

File sizes 156–602 KB (SF69erss largest), 3.0 MB for all ten.

Removed from the shipped seat file because nothing reads them: `other_bags` on two-team trades
(3.06 MB — present on 580 of 586 trades, rendered on 6), `realized`, `recent_trades`, `year_ends`,
`partner_headlines`, `legs[].drafted_by`, `hero` beyond `two_way`, and `partners[].grade` (a frozen
one-clock grade that disagreed with the Partners tab on 20 of 82 partners).

Still shipped and still unread, kept for the reasons above or as too small to be worth the churn:
`legs[].value_flat` (~36 KB), `recent_rookies` (~23 KB), `t0_value_adjust` (~13 KB).

### Verified fixtures (code = HAVE)

| Trade | Today | Aged | T0 | Notes |
| --- | --- | --- | --- | --- |
| 2019-07-26 ChiefGumby vs ARae `460470201385742336` | Chief received **288**, gave up **2228**, Δ **−1940** | — | `null` (startup picks, no DP) | Became Zeke (3) + Hill (**285**) vs Saquon (2226) + Chubb (2). No third pile. y3 IN FLIGHT: Chief Δ **+478** (Zeke mean 4319, Hill mean 7652.5 over 2020–21 YE; 2019-12-31 unpriced and dropped) |
| 2026-08-24 TrumanCooper vs BubbaCuckShremp `1397412606653767680` | Truman Δ **+254** | **−58** (T0 Δ +312) | priced | Complete. Bubba got three picks; 2029 4th `priced_as_2028`. y3 IN FLIGHT Δ **+406** (window = today only; Sampson 121 and all three picks floored to 0) |

---

## 6. Screens (HAVE)

One `index.html`. After `?me=` / tile pick:

With no seat picked: **league home** — the gold alert row (Recent Trade + Champions Path), Most
lopsided trades, and the four player packs. After `?me=` or a pick in the header:

| Tab | What it shows |
| --- | --- |
| **home** | Six style tiles from `marks.json` (Run · Volume · Posture · Manners · Aging · Draft), each opening a ten-row league chart. Then Best deal, Worst deal, two edge partners, rookie hit/miss. **No hero number.** |
| **trades** | Your tape, year filter (radios), lived-clock filter with `livedHint`. Open row = You received / You gave up + Value Adjustment. N-way adds one bag per other seat. Spark = each side's **received** bag at year-end, nulls as gaps. |
| **partners** | 2-team pair grades from `partnerPer()`. Open partner → their deals with you on the selected clock. |
| **drafts** | Rookie 2020–26 surplus; startup picks toggled in, priced against their real `pick_cost`. Pins the clock to `all`. |
| **titles** | Champions Path. Outside the trade needle. |

One **Score as** dropdown, five windows: `t0` At trade · `y1`/`y2`/`y3` First N years ·
`all` Since trade (default). `t0` and `all` are unfiltered; the year windows hide deals that have
not lived the clock.

Open pick leg → hop tape from `picks.json`. The expanded detail is a **sibling** of the row button,
not a child, so the pick legs inside it can be real buttons.

**Deleted:** the Best 10 / Worst 10 board (`renderTradeBoards`, `rankSides`, `monthsAgo`,
`boardScore`, `boardClock`, `boardWindow`), by user decision, twice. `Most lopsided trades` is the
permanent replacement. Then `renderLeague()` and its `Traders` / `Drafters` lists, by a second
ruling. `league` is out of `VIEWS`, so `?view=league` is an unknown view and lands on league home.

`boardTape` survives both deletions — Most lopsided and the Recent Trade card render it.

---

## 7. Known gaps (HAVE bugs / edges / waste)

Fixed and shipped since the audit: `other_bags` on two-team trades, `realized_*`, the spark's
`|| 0` null crash, escaping, the nested `<button>`, the missing keyboard layer, the split partner
grade, `trade_boards` being built twice, `aged` mixing two price books, `build.mjs` omitting
`title-path` and `apply-value-adjust`, and the oversized `trade_boards.sides` rows. See
`DASHBOARD_AUDIT.md` for the annotated list with commits.

Still open:

1. **`league.json` carries all 576 `trade_boards.sides`** so the browser can re-window. 266 KB
   after the projection; do not grow the row without checking what reads it.
2. **`off_board` is dead.** The retirement test is now "off the KTC Superflex board **and** off an
   NFL roster → 0" in `price-today.mjs`, plus the explicit `RETIRED_SLEEPER_IDS` set. The 300
   activity floor still applies only to the year windows, never to the today clock.
3. **300 on the year windows hits picks too.** Future 3rds/4ths and a 215-point 2028 2nd become 0,
   so a four-day-old trade's "3-year mean" is floored-today, not a window.
4. **Year-end grid vs accept date.** `windowAsOfs` keeps Dec 31s in `[t0, t0+Ny]` and does **not**
   insert the cap date. July 2019 → 2019/20/21 YE only (2019 YE empty). Window not elapsed →
   snaps = `{today}` only, still marked complete. The UI hides those deals via `chipLived`.
5. **Unpriced snaps dropped, not zeroed.** Pre-curve 2019-12-31 disappears; the mean is over
   surviving dates. Different from "retired year = 0".
6. **N-way "receiver-only" seat** can post a positive delta with empty `sent` (2023-01-06). The
   filter is "everyone received", not "everyone sent". Its Value Adjustment is 0 either way.
7. **`?me=` race.** `selectMe` has no abort; two seat picks can finish out of order.
8. **Apostrophe hazard.** Data reaches the page as `fetch` + JSON and labels go through `esc()`.
   The hazard returns the moment anyone interpolates `Ja'Marr` / `Wan'Dale` into a single-quoted JS
   string inside the template. Board headlines already contain `Wan'Dale Robinson`.
9. **The generator is one template literal.** A backslash in a regex written there is swallowed
   unless doubled, and `pieceWeight` and `yearsOn` both shipped broken regexes for a while as a
   result. Check regexes against `index.html`, never against `generate-page.mjs`.
10. **Duplicate work in `revalue.mjs`.** `partnersFor` is recomputed inside the invert self-check;
    `priceLeg` runs per lens × per as-of × per bag. Full `value_curve.json` is 6.9 MB and is absent
    from this checkout, which is why `revalue.mjs` cannot run here.
11. **IDP / no Sleeper map** → unpriced, incomplete, off the needle. No separate IDP book.
12. **The global click handler is one long if-chain.** Adding a `data-*` name that a prior branch
    already matches will silently shadow it.
13. **No publish cadence.** Rebuild is manual. `players.nfl.json` caches 24h; past-season tx weeks
    stay cached forever. `league.today` can sit a day behind the newest trade on the tape, so that
    trade is priced on yesterday's board. The Recent Trade card handles the display side by taking
    the later of the two dates; the pricing clock is unhandled.
14. **`league.drafters_rookie` has no reader** (~2.5 KB). It lost its last one when
    `renderLeague()` was deleted. `revalue.mjs` still emits it.
15. **The browser still recomputes VA.** `applyVa` is a hand-kept clone of `value-adjust.mjs`,
    because the payload ships five near-duplicate leg lists per trade instead of one list with
    five values. The plan to collapse it is `DASHBOARD_AUDIT.md` §8b / D3a; ~1.2 MB and the
    deletion of `applyVa` are on the other side of it.
16. **The 40/60 today blend has no reader** (§5, `DASHBOARD_AUDIT.md` §8c). Open user decision.

---

## 8. Self-checks the next implement pass must keep

From `revalue.mjs` (throw = failed rebuild):

- No FAAB legs; every meter trade has a received bag per seat; year-ends ≤ `today`.
- Complete 2-team today-deltas zero-sum; partner per-trade pairs invert.
- Wilson hops = 5, one drafted exit, flip `out` ≠ player-today; Breece hops = 6.
- Truman–Bubba complete; Bubba received 3 picks; 2029 4th `priced_as_2028`.
- `MIN_ACTIVE === 300`; no year-window snap with `0 < floored < 300`; raw `< 300` ⇒ floored 0.
- Zeke exists on Chief–ARae on the today clock **and** on the year windows.

From `apply-value-adjust.mjs` (throw = failed rebuild):

- CeeDee's Value Adjustment is ~3,322 after the today blend with extras capped at 3.
- Zeke prices 0; Hill prices 1,798 (**not** floored); Baker prices 4,597.
- `realized_*` is gone from every side and every trader row.
- `drafters_rookie` is still present (no reader, but `revalue.mjs` still emits it — dropping it
  belongs to a payload pass); `review_trades`, `drafters_startup` and `trade_boards.today` /
  `.aged` are gone.
- `marks.json` covers every seat on every clock, its partner counts add up to the graded partners,
  and its `all` totals match the `windows.all` deltas (**not** the `even` blend — see §5 and
  `DASHBOARD_AUDIT.md` §8c).

And, as a standing script over all ten seats after any change to the book:

- `today == sum(priced legs) + value_adjust`; `today_delta == today − sent_today`.
- Stored Value Adjustment matches a fresh `value-adjust.mjs` recompute (0 on N-way, 0 on
  incomplete); stored today values match a fresh `price-today.mjs` recompute.
- Zero-sum on the 288 complete two-team trades **and** on the 2 N-way trades.
- The inline `applyVa` **read out of `index.html`** agrees with `value-adjust.mjs` on all 3,528
  sides, to 0.
- No NaN, no Infinity in any shipped UI JSON.

Do not add a check that forces a year window onto the today clock, and do not weaken a check into
a tautology — if a fixture number moves, state the new number and why.
