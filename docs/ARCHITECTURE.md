# CuckleChunckle — Architecture (HAVE)

**Role:** What is actually built on **2026-08-28**. Never invent want from this file. Want → [`PRODUCT.md`](./PRODUCT.md).

**Not a git repo.** Vanilla Node. No `package.json`. Rebuild is `node build.mjs` (or the five scripts in order). Serve `index.html` via `python3 -m http.server` from the tracker folder.

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
generate-page.mjs
  → index.html  (inline CSS + JS; fetches data/ui/*.json)
```

`build.mjs` runs those five in order. `value-snapshot.mjs --latest-only` skips git history.

**IN FLIGHT (present in tree + rebuilt JSON, not WANT-canon until open questions land):** First-3-years lens (`MIN_ACTIVE = 300`) in `revalue.mjs` (`lenses.y3`) and a third chip in `generate-page.mjs` / `index.html`. Home hero still uses `realized_per_trade` / `pick_per_trade` only. Do not revert.

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

`[{ user_id, name }]`

### `data/ui/league.json`

```text
{
  traders: [ { user_id, name, two_way, incomplete, realized_total, realized_per_trade,
               pick_total, pick_per_trade, style: { label, now_share, horizon,
               sold_picks_for_players, sold_players_for_picks } } ],
  drafters_rookie, drafters_startup,
  trade_boards: {
    sides: [ { transaction_id, date, user_id, name, other, today_delta, t0_delta, aged, headline } ],
    today: { best[10], worst[10] },
    aged:  { best[10], worst[10] }
  },
  today: "YYYY-MM-DD"
}
```

~131 KB. `sides` is the bulk.

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
  hero: { …leaderboard row + incomplete },
  style, hit, miss,
  partners[], partner_headlines: { best, worst, most },
  recent_trades[5], recent_rookies[5],
  trades: [ slimTrade ],
  drafts: { rookie, startup }
}
```

`slimTrade` (every trade this seat is on):

```text
{
  transaction_id, date, season, others[], incomplete,
  realized, pick, y3,          // side objects for *you*
  other_bags: [ { name, realized, pick, y3 } ],  // still shipped for 2-team
  year_ends, pick_year_ends    // [{ as_of, points: { Name: receivedBag } }]
}
```

Side object (`realized` / `pick`): `name, today, sent_today, today_delta, t0, t0_delta, unpriced, sent_unpriced, t0_unpriced, incomplete, legs[], sent[], t0_legs[]`.

`y3` side reuses `today` / `sent_today` / `today_delta` for the **window mean** (name collision). No T0 fields.

Leg: `{ label, kind, asset_key, value, flag, became, drafted_by }`.

File sizes 157–561 KB (SF69erss largest). `year_ends` on a 2019 trade is 8 points through today.

### Verified fixtures (code = HAVE)

| Trade | Today | Aged | T0 | Notes |
| --- | --- | --- | --- | --- |
| 2019-07-26 ChiefGumby vs ARae `460470201385742336` | Chief received **288**, gave up **2228**, Δ **−1940** | — | `null` (startup picks, no DP) | Became Zeke (3) + Hill (**285**) vs Saquon (2226) + Chubb (2). No third pile. y3 IN FLIGHT: Chief Δ **+478** (Zeke mean 4319, Hill mean 7652.5 over 2020–21 YE; 2019-12-31 unpriced and dropped) |
| 2026-08-24 TrumanCooper vs BubbaCuckShremp `1397412606653767680` | Truman Δ **+254** | **−58** (T0 Δ +312) | priced | Complete. Bubba got three picks; 2029 4th `priced_as_2028`. y3 IN FLIGHT Δ **+406** (window = today only; Sampson 121 and all three picks floored to 0) |

---

## 6. Screens (HAVE)

One `index.html`. After `?me=` / tile pick:

| Tab | What it shows |
| --- | --- |
| **home** | Hero = **your** `realized_per_trade` (or pick-lens per-trade). Style caption. Rookie hit/miss. League teaser chips = all-time today Best smash / Worst. Partner Best / Worst / Most. Latest 5 trades. Latest 5 rookie picks (green player / blue pick-cost spark). |
| **trades** | Your tape, season chips. Open row = You received / You gave up. 3-team adds other received bags. Aged caption when T0 exists. Spark = each side’s **received** bag at year-end. |
| **partners** | 2-team pair grades. Open partner → their 2-team deals with you. |
| **drafts** | Rookie 2020–26 surplus; Startup 2019 by player today. |
| **league** | Best/Worst 10 with today/aged clocks and 3m/6m/1y/3y/all windows (trade date). Then traders / drafters lists. You highlighted. |

Lens chips (global): **Became the player** · **Pick at trade day** · **First 3 years** (IN FLIGHT). y3 changes trade-row margins via `sideOf`; it does **not** change the Home hero or Best/Worst.

Open pick leg → hop tape from `picks.json`.

---

## 7. Known gaps (HAVE bugs / edges / waste)

1. **`other_bags` still shipped on every 2-team `slimTrade`.** UI only renders them when `others.length > 1`. Pure duplicate of the other seat’s received bag (= your `sent` on 2-team). Inflates every `me/*.json`.
2. **`league.json` carries all 574 `trade_boards.sides`** so the browser can re-window. Precomputed top-10 already exist for all-time. Fine at 131 KB; do not grow this with y3 clocks until asked.
3. **`off_board` is dead.** Last-known DP value is carried to “today” forever (Zeke = 3). The 300 floor is the only retirement hammer, and only on y3.
4. **300 on y3 hits picks too.** IN FLIGHT: future 3rds/4ths and a 215-point 2028 2nd become 0, so a 4-day-old trade’s “3-year mean” is floored-today, not a window.
5. **Year-end grid vs accept date.** `windowAsOfs` keeps Dec 31s in `[t0, t0+3y]` and does **not** insert the cap date. July 2019 → 2019/20/21 YE only (2019 YE empty). Window not elapsed → snaps = `{today}` only, still marked complete.
6. **Unpriced snaps dropped, not zeroed.** Pre-curve 2019-12-31 disappears; the mean is over surviving dates (2 years, hence `.5` on Chief y3). Different from “retired year = 0.”
7. **3-team “receiver-only” seat** can post a positive delta with empty `sent` (2023-01-06). Filter is “everyone received,” not “everyone sent.”
8. **Home hero ignores the y3 chip.** Trade rows do not. Easy to read as “the big number is 3-year” when it is still today-per-trade.
9. **`?me=` race.** `selectMe` has no abort. Auto-select + a second tile click (or a Best-board `data-open-me`) can finish out of order.
10. **Trade row is a `<button>` wrapping hop controls.** Apostrophe-in-caption **script** break is fixed (data is `fetch` + JSON; labels are HTML text). Hazard returns if anyone interpolates `Ja'Marr` / `Wan'Dale` into a single-quoted JS string. `headline` on boards already contains `Wan'Dale Robinson`.
11. **Duplicate work.** `partnersFor` is recomputed inside the invert self-check (O(members × trades) twice). `priceLeg` runs per lens × per as-of × per bag. `year_ends` stored twice (`realized` + `pick`) on every slim trade. Full `value_curve.json` is 6.9 MB; used is 4.5 MB; `trade_meter.json` is 3.5 MB (not fetched by the page).
12. **Latest `as_of` can duplicate the newest git month** (two `2026-08-28` Hill rows). Harmless for `asofRow`.
13. **IDP / no Sleeper map** → unpriced, incomplete, off needle. No separate IDP book.
14. **Spark treats missing points as 0** (`p[k] || 0`), so a null year-end draws a crash to the axis.
15. **Nested leftover:** global click handler is a long if-chain; Home teaser chips reuse `data-board` and force `view = "league"` (intentional, but easy to break when adding a third clock).
16. **No publish cadence.** Rebuild is manual. `players.nfl.json` caches 24h; past-season tx weeks stay cached forever.

---

## 8. Self-checks the next implement pass must keep

From `revalue.mjs` (throw = failed rebuild):

- No FAAB legs; every meter trade has a received bag per seat; year-ends ≤ `today`.
- Complete 2-team today-deltas zero-sum; partner `realized_per_trade` pairs invert.
- Wilson hops = 5, one drafted exit, flip `out` ≠ player-today; Breece hops = 6.
- Truman–Bubba complete; Bubba received 3 picks; 2029 4th `priced_as_2028`.
- Boards: 10 best/worst, sorted; every `sides` row is a complete 2-team pair with a headline.
- `MIN_ACTIVE === 300`.
- **`y3 leaves realized_per_trade`** — Home/League today math unchanged.
- Zeke exists on Chief–ARae today **and** y3; y3 value ≠ leftover 3 when today < 300.
- No y3 snap with `0 < floored < 300`; raw `< 300` ⇒ floored 0.

Do not add a check that forces y3 onto Best/Worst or the Home hero.
