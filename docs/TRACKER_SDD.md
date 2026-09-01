# CuckleChunckle tracker — SDD

**Written:** 2026-08-28. **Status:** stop. This file is the single sheet for everything discussed in the build session. Decomposed law still lives in `PRODUCT.md` (WANT), `ARCHITECTURE.md` (HAVE), `VALUE_SDD.md`, `UI_SDD.md`, `OPEN_QUESTIONS.md`. If those disagree with this file on *what we discussed*, this file wins until Truman edits it.

**Not SlabSlip.** Code and docs live in **https://github.com/slabslip/cuckle-trade-tracker**
(Cursor Cloud Agent: `/workspace`; local clone: wherever you checked it out). Do not put this in
`tradeslabs-web`. Go-live entry point: [`START_HERE.md`](START_HERE.md).

---

## 0. Where we are (stop line)

The product is a **phone-first static page** that grades CuckleChunckle trades (Sleeper Superflex, 10 teams, 2019–2026) on DynastyProcess Superflex. Selecting a name means **you are that seat**.

| Surface | State |
| --- | --- |
| Local | `index.html` + `data/ui/*.json`. Serve the folder over HTTP (`python3 -m http.server`). `?me=TipsUp` still lands on Home. |
| Rebuild | `node build.mjs` — sleeper-sync → draft-resolve → value-snapshot → revalue → title-path → apply-value-adjust → generate-page. No npm. `apply-value-adjust.mjs` is not optional: it owns the today blend, the Value Adjustment and every trade board. |
| Git | **https://github.com/slabslip/cuckle-trade-tracker** (public as of 2026-08-28) — source + spec + generated `data/ui`. Not inside `tradeslabs-web`. |
| Pages on that repo | **On.** **https://slabslip.github.io/cuckle-trade-tracker/** — no `?me=` (that is a team home). Hard-refresh. |
| Older phone copy | **https://slabslip.github.io/league-standings/?me=TipsUp** still works. Prefer the tracker Pages URL. |

**Do not start new feature work** until Truman answers §8. The First 3 years chip is already in the tree; leave Today, T0, hops, and Best/Worst frozen.

---

## 1. What this product is

After-action review of bags **you received vs you gave up**. Knowledgeable collectors already know the names; the app prices the tape on one book (DynastyProcess Superflex `value_2qb`) at a **named clock**.

1. Pull completed Sleeper trades and drafts.
2. Price each asset on a chosen clock.
3. Needle = **you received − you gave up** on that clock.
4. Home = **your** score. League = water-cooler tape.
5. A used pick is **the player it became**, unless you ask for pick-at-accept.

Style labels (Win-now / Investor / Balanced) describe bag mix. They **never** move the needle.

---

## 2. HAVE — what is built

### Pipeline

```text
sleeper-sync.mjs     → raw league / trades / legs
draft-resolve.mjs    → who used each pick
value-snapshot.mjs   → DP Superflex curve (latest + monthly git history)
ktc-snapshot.mjs     → weekly KTC Superflex file (not in build.mjs; cron/local)
revalue.mjs          → meters, hops, flatten windows, me/*.json
title-path.mjs       → titles.json (Champions Path)
apply-value-adjust.mjs → today blend (40/60 KTC, retired 0), Value Adjustment,
                         trade_boards, partner grades, partner_headlines
generate-page.mjs    → index.html (inline CSS + JS, fetches data/ui)
```

`ktc-snapshot.mjs` writes `data/ktc/YYYY-MM-DD.json` + `latest.json`. History starts the first week we run it. Commit the JSON; do not backfill 2019–2025 (those pages are not dated archives). Personal weekly snapshot — not a live in-app scrape, not a GitHub Action.

### League facts (rebuild 2026-08-28)

- Sleeper `1315431339301806080`, walks `previous_league_id` to 2019.
- 314 raw completed trades → **291** on the meter (~23 one-ways tossed).
- **2** incomplete (no Superflex row): Nick Bosa; 2021 4th → Micah Parsons (IDP).
- Curve: 2020-04-30 … 2026-08-28. **No 2019 DP file.** **No 2029 pick rows** (priced as matching 2028, flag `as 2028`).
- FAAB is never a leg.

### Screens

| Tab | HAVE |
| --- | --- |
| Home | League boards is the dashboard home (house icon) and the only place with the **trades today** tape. A team’s home tabs are home / trades / partners / drafts. Identity marks include running P&L, then best/worst, extract partners, draft hit/miss. Tap a mark to open a ranked bar of every seat’s label and stat for that mark. |
| Trades | Your tape. Filter icon + “Filter by year” (All or one season, checkbox list). Open = **You received** / **You gave up**. 2-team does **not** render the other seat’s bag. 3-team still shows `{name} received`. Aged caption when T0 exists. |
| Partners | 2-team pair grade (±100 DP / trade). |
| Drafts | Rookie picks this seat used (startup off by default). No Score as chip — always since-trade vs pick-at-draft. Filter icon: Newest/Oldest, value high↔low, 1st–4th, include startup. Own pick vs someone else’s pick is colored. Caption is average surplus. |
| League | **There is no league screen.** Best 10 / Worst 10 was removed by user decision, twice — `Most lopsided trades` on league home is the permanent replacement. `renderLeague()` and its per-trader / per-drafter lists were then deleted on a second ruling; `league` is out of `VIEWS` and `?view=league` lands on league home. |

**Score as (default Since trade):** chip on home / trades / partners — `Score as · {clock} ▾`. Not on drafts. Full list, no expand: At trade · First 1 year · First 2 years · First 3 years · Since trade. Gold dot when not Since trade. Home caption says `27 of 86 lived 3 years` when the clock hides young deals. **At trade** is accept day, not calendar today. Same even-flatten book. No KTC mix. No steep DP chip. Year funnel stays a separate control.

### Identity and bags

- `?me=` or a name tile = you are that team.
- Pick labels: `2026 2nd · became Eli Stowers (TipsUp)`. Parentheses = **drafter** (who used it), not who got it in this trade.
- Flippers still see “became X today” on the needle (what if you had kept the asset). Personal flip P&L is the **hop tape** only.
- Pick rows in an open bag are `<div>`s (not nested buttons). Nested `<button>` inside the trade `<button>` used to strip received picks from the DOM.

### Clocks that already score a trade

| Clock | Question | On Home hero? | On Best/Worst? |
| --- | --- | --- | --- |
| **At trade** | Even-flatten pick values at accept. Missing year (2019, 2029) uses closest year, same round | Yes if that stop is on | Aged clock still uses today − T0 |
| **First 1 / 2 / 3 years** | Mean of even-flatten year-ends in `[accept, accept+N]`. Player year under 300 raw DP → 0 | Yes if that stop is on | **No** (League windows are trade-date filters) |
| **Since trade** (default) | Mean of even-flatten year-ends accept → today | **Yes** | League “As of today” is flatten-today, not this mean |

Incomplete (no DP row) stays **listed**, off every needle. One-ways and FAAB-only never enter the meter.

### Hops

Per pick key. Flip exit = pick price at that hop. Only the **drafter’s last hop** exits at player-today. Example: 2022 1.07 (Garrett Wilson) = 5 hops.

### 2029

DP has no 2029 rows. Matching **2028** round, flag `priced_as_2028`, UI `· as 2028`. Truman–Bubba 2026-08-24 is **complete** (was incomplete before this proxy).

---

## 3. Worked trades (regression)

### ChiefGumby vs ARae, 2019-07-26 (`460470201385742336`)

Startup picks. T0 = closest-year pick (2020 slot or 2021 Mid). No third pile. On a 2-team deal, “ARae received” **is** what Chief gave up — do not print it twice.

| | Became | Today |
| --- | --- | --- |
| You received | 2019 1st → Zeke (ChiefGumby) 3 · 2019 2nd → Hill (ChiefGumby) **285** | **288** |
| You gave up | 2019 1st → Saquon (ARae) 2226 · 2019 2nd → Chubb (ARae) 2 | **2,228** |
| Needle today | | **−1,940** |
| First 3 years | Zeke 4,319 · Hill 7,653 · Saquon 6,633 · Chubb 4,861 (2020 + 2021 YE; 2019 YE empty) | **+478** |

Today says blowout. The first years after accept say the bags were in the same galaxy and Chief was slightly ahead. That is why over-time exists.

### TrumanCooper vs BubbaCuckShremp, 2026-08-24 (`1397412606653767680`)

Complete. 2029 4th as 2028.

| Clock | Truman Δ |
| --- | --- |
| Today | **+254** |
| T0 | +312 |
| Aged | **−58** |
| First 3 years (HAVE) | **+406** — window is **today only**; Sampson 121 and the three picks are floored to 0 |

This trade must **not** invent a third Home hero. It can appear on Best/Worst only on today/aged if the number is large enough (it is not a top-10 smash).

---

## 4. Value law (over time)

**Book:** `dynastyprocess/data`, Superflex `value_2qb`. Latest `as_of` = snapshot machine UTC date. History = newest git commit per calendar month. Lookup = last row with `as_of <=` query date (step function). “Year-end” = that lookup on `YYYY-12-31`.

**Identities — never add two into one number**

| Identity | Use |
| --- | --- |
| Player | Named player on the board |
| Pick | What they accepted, or hop-local P&L |
| Became-player | Who used the pick, priced at the query date (default needle) |
| Hop | Hold / flip tape. Not the trade needle. |

### Why Today lies

A 2019 smash that retired (Zeke) vs a career that is still a monster (Saquon) grades as a tombstone in 2026. Hill at **285** is still a real player — a 300 floor on Today would zero him (618 of 973 unique today legs sit in `(0, 300)`).

### Why T0 lies

You accepted a pick, not a career. T0 cannot see Wilson on a 2020 trade of a 2022 1st. 2019 startup T0 is null.

### First 3 years (HAVE, third chip only)

```text
window = [accept, min(accept + 3 years, today)]
dates  = year-ends in that window, plus today if today is inside
per snap: became-player (or pick if not drafted)
  unpriced → omit
  player and raw DP < 300 → 0
  else → flatten(raw)   // even curve, that day's board max
leg  = mean of those even snaps
needle = received − sent
```

Zeros **stay in the average**. Dropping dead years inflates stars who later retired.

**WANT (not yet coded):** floor **player** snaps only. A 215-point 2028 2nd is a cheap pick, not a retiree. That is the Truman–Bubba +406 vs +254 gap.

**Do not** put this clock on the Home hero or Best/Worst until §8 is answered.

### Alternatives discussed — not shipping

| Idea | Honest as | Not the headline |
| --- | --- | --- |
| Peak in window | Smash / regret highlight | One spike year wins |
| Sum / AUC | Durability, same-length windows | 2019 trades look richer than 2025 |
| Years ≥ 300 | Starter-years count | 301 and 9000 are equal |
| Last year ≥ 300 | When to sell | Ignores how good they were |
| Floor on Today | Never (Hill 285) | Zeros live-but-cheap pieces |
| Monthly/weekly DP dates | Mid-year crash research | Heavier rebuild; parked |

---

## 5. UI law

- **Home** = your after-action score first. **League** = tape. Do not merge.
- Open deal = first person: **You received** / **You gave up** / today’s signed result / aged line if T0 exists.
- 2-team: never render `other_bags` (data may still contain them).
- Drafter caption under bags: numbers are that player today; parentheses drafted the pick.
- Sparks: no legend library. Green / blue / gold only.
  - Rookie: green = player, blue = pick cost, number = surplus.
  - Startup: green = player, number = player today.
  - Open trade: each line = that side’s **received** bag at year-end; row number = received − sent on the **active chip**.
- Phone: 44px targets, safe-area, existing CSS variables only. No new CSS file, chart lib, or tab.
- Later (parked, not now): shade the 3-year span on the existing SVG; badge `not yet 3y` on short windows; one line under Home hero when the 3y chip is on (“rows below use First 3 years; this number is still today”).

---

## 6. CUT / PARKED

**CUT**

- FAAB as a leg or points.
- One-ways on the meter.
- Browser Sleeper calls, auth, live refresh.
- A third Home hero.
- New packages, Tailwind, chart libraries.
- 300 floor on the **Today** clock.
- Style labels moving any delta.
- Mixing this product into `tradeslabs-web`.

**PARKED**

- Best/Worst or `realized_per_trade` on the 3-year clock.
- Monthly/weekly spark density.
- Peak / AUC / years-above-300 as a fourth chip.
- Flip P&L as the default over-time identity.
- Auto-publish / scheduled rebuild.
- (Done) Public Pages on `cuckle-trade-tracker`.
- Stop shipping `other_bags` on 2-team JSON (UI already hides them).
- `?me=` fetch race, spark `null`→0, 3-team “you sent nothing” copy.

---

## 7. Known issues (HAVE, do not “fix” in passing)

1. **`other_bags` still in every 2-team `me/*.json`** — UI hides them; files are 157–561 KB for no reason.
2. **574 `trade_boards.sides` in `league.json`** so the phone can re-window. Fine at ~131 KB.
3. **`off_board` never fires** — last-known DP value carries forever (Zeke today = 3).
4. **y3 floors picks** and short windows (2026 trades are floored-today, not a 3-year mean).
5. **2019-12-31 is empty** — Chief–ARae y3 is a **2-year** mean.
6. **Home hero ignores the y3 chip**; latest-trade rows do not. Easy to misread.
7. **3-team receiver-only** seats (empty `sent`) stay on the meter (“everyone received,” not “everyone sent”).
8. **Spark treats missing points as 0** (line crashes to the axis).
9. **Apostrophe-in-`<script>`** broke `?me=` once; captions are HTML/JSON now. Do not interpolate `Wan'Dale` into single-quoted JS.
10. **Nested buttons** hid received picks; pick legs are `div`s now. Keep it that way.

Self-checks in `revalue.mjs` must keep passing: no FAAB, zero-sum 2-team today, partner invert on `even_per_trade`, Wilson/Breece hops, Truman–Bubba complete + 2029-as-2028, Zeke y3 ≠ leftover 3.
Board checks moved to `apply-value-adjust.mjs`, which is now the only builder of `trade_boards`: sides are 2-team pairs, every side carries all five windows, best/worst sorted, `aged` equals `windows.all.delta − windows.t0.delta` (one book), and no `realized_*` survives.

---

## 8. Open questions (Truman)

Until answered, implementers follow **Recommended** and do not add a fourth clock.

| # | Question | Recommended |
| --- | --- | --- |
| 1 | 300 on Today, 3y only, or both? Floor cheap **picks**? | **3y only, players only.** Leave Today and still-a-pick raw. `MIN_ACTIVE` stays a named constant. |
| 2 | Over-time headline: mean, peak, or sum? | **Mean.** |
| 3 | Window 3y vs 2 / 4 / career? | **Stay at 3.** |
| 4 | Best/Worst / Home hero on 3y? | **No** until short windows are badged and Q1 is settled. Then a third *board* clock, not a replacement. |
| 5 | Year-end vs monthly GitHub dates? | **Year-end** for the headline. Monthly later if a mid-year crash must count. |
| 6 | Flip P&L vs became-player on 3y? | **Became-player on the chip. Hops = hold P&L.** |
| 7 | Chip vs default vs two bag stacks? | **Third chip.** Default stays Became the player. |
| 8 | Publish cadence? | Manual rebuild when you care. Show `as of {league.today}`. |
| 9 | Short window: number or dash? | **Number + `not yet 3y` badge.** Keep off any future 3y board. |
| 10 | Receiver-only 3-team: stay on meter? | **Keep HAVE.** Caption “you sent nothing.” |
| 11 | Off-board Today: last-known 3 or 0? | **Last-known.** Dead years are the 3y floor. |
| 12 | Public phone URL? | **Done:** repo is public; Pages is `cuckle-trade-tracker`. `league-standings` is a leftover copy. Do not merge into SlabSlip product. |

---

## 9. Build order (when work resumes)

1. Keep Today + T0 + hops + Best/Worst **frozen**.
2. Finish First 3 years as a **trusted chip**: floor players only (Q1), badge short windows (Q9), Home caption that the hero is still today.
3. Shade the 3-year span on the existing spark. No new chart stack.
4. Only then: 3y Best/Worst, denser dates, or a different aggregator.

Ponytail: rebuild the pipeline, don’t add a web app. Mark ceilings with `ponytail:`.

---

## 10. Review 2026-08-28 (formula + scale — do not implement)

Review of strategy / SDD vs `revalue.mjs` + the 2026-08-28 DP Superflex file. **No product code in this pass.** Numbers below are measured (unique `asset_key` on `as_of=2026-08-28`; latest+git duplicate rows ignored). `ranked_today.json` is trade-bag margins (one row hits 28,789) — not the player scale.

### Scale — what `value_2qb` actually is

**Not a guess.** DynastyProcess Superflex `value_2qb` on this rebuild:

| Board (today) | n | min | p50 | p90 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Players — full DP file (CSV 535 / mapped 530) | 530 | **1** | **29** | **3,115** | **10,232** (Josh Allen) |
| Picks — full DP file | 80–85 | **7** (late 5th) | **57–61** | **~2,020** | **7,311** (2026 1.01) |
| Players — used curve (league-touched) | 354 | 1 | **141** | **4,479** | 10,232 |
| Picks — used curve | 56 | 13 | **141** | **3,019** | 7,311 |
| Unique priced **tape legs** (became-player today) | 973 | **0** | **78** | **3,537** | **9,184** (Lamar) |

**Buckets — unique priced tape legs today (the “are values 0 to 10k?” answer):**

| 0 | (0, 300) | [300, 1k) | [1k, 3k) | [3k, 10k) | 10k+ |
| ---: | ---: | ---: | ---: | ---: | ---: |
| **11** | **618** | 114 | 115 | 115 | **0** |

Full player board today: 0 / 382 / 49 / 42 / 56 / **1**. No latest-file player is 0 (min 1). The 11 tape zeros are dead names (Claypool, Drake, Melvin Gordon, …) whose last DP row is literally 0 — not the Zeke-at-3 carry-forward.

**Are values 0 to 10k?** Colloquially **yes**. Strictly: **0–~10.3k**, no clamp in our code. 10k is DP’s **intended top-of-board** (ECR #1 maps near 10,000), not a Mahomes-only era and not a tracker ceiling. All-time `value_2qb` max on disk = **10,280** (CMC, 2021-04-23). Three players ever printed ≥10k: CMC, Mahomes (10,232 in 2023), Allen (10,232 today). 72 of 75 snapshot dates have someone ≥10k. Picks never hit 10k (hist max 8,460 = 2025 1.01). Tape today tops at 9,184.

**Where 300 sits:** ~**p72 of the full player board** (148 of 530 ≥ 300; 72% are cheaper). Used-curve players: 141 of 354 ≥ 300 (p60). It is **not** the median — median player today is **29** (taxi junk). Roster meaning: ~**15 real Superflex pieces per 10-team roster** (148 / 10). On the pick book, 300 is **2026 Pick 2.07 = 306**. 2.06 = 356 (keep); 2.08 / 2027 Mid 2nd / 2028 2nd (215) all sit under. Hill **285** and Diggs **287** are just under; Shedeur **314** is the last name ≥ 300. So 300 ≈ “last starter-ish / mid-2nd,” not “retired.”

### Do we refine the 3y + floor formula?

**Yes — one compose. Do not invent a fourth clock.**

HAVE floors **every** snap &lt; 300 (picks too), keeps zeros in the mean, and lets a 2026 trade collapse to floored-today. WANT already says floor **players only**. That gap is the whole Truman–Bubba +406 vs +254 lie.

**Recommended compose (keep mean, keep 3 calendar years, keep zeros in the denominator):**

```text
window = [accept, min(accept + 3 calendar years, today)]
dates  = Dec 31s in that window, plus today if today ≤ cap
         (do not insert accept+3y; do not invent 2019 YE)
per snap: became-player at that date (pick if not yet drafted)
  unpriced → omit
  player snap < MIN_ACTIVE → 0
  still-a-pick → raw          // the one HAVE→WANT fix
leg = mean of surviving snaps // dead player years stay as 0
```

**Do not** switch to “count years ≥ 300, then average those.” That drops the 0s and is the inflation bug with extra steps. Years-above-300 can be a later caption, not the chip.

### Missing / contradictions

1. **HAVE vs WANT on pick floor** — coded `floorActive` on all snaps; every other doc says players only.
2. **“3 years” ≠ 3 snaps** — unstated until you read `windowAsOfs`. Window is **calendar accept+3y**, snaps are **YE inside the cap**, not three NFL seasons and not “accept + three Dec 31s.” July 2019 → 2019/20/21 YE, 2019 empty → **2-year** mean. Aug 2026 → **1 snap = today**. Jan 2023 → three YE, today dropped (after cap).
3. **Pick→player mid-window** — VALUE §1 already blends (pick snaps + player snaps in one mean). TRACKER is quieter. Must be law: same identity as Today at each date.
4. **League chip “3 years”** = filter by **trade date**. First 3 years chip = value window. Same words, two clocks. Easy to misread Best/Worst.
5. **ARCHITECTURE “Not a git repo” / OPEN_QUESTIONS #8 “no git remote”** — stale. Repo is public; Pages is on.
6. **`y3.today` field name** — window mean reused as `today`. UI must never say “today” for that number.
7. **Draft-day vs accept-day** — T0 = accept-day pick. y3 switches to the player on **draft day** (`resolution.as_of`), not accept day. Correct for became-player; say it once.

### Law vs bugs (do not “fix” in passing)

| Item | Treat as |
| --- | --- |
| Hill 285 on **Today** | **Law.** Floor never touches this clock. |
| Zeke last-known **3** on Today (`off_board` dead) | **Law for Today.** Dead years are the 3y floor. Do not zero Today on one missed month. |
| Truman–Bubba pick floor → y3 +406 | **HAVE bug vs WANT.** Flooring 215/44/14 as “retired.” |
| 3-team empty `sent` | **Law (HAVE).** Caption “you sent nothing.” |
| Flip vs became-player | **Law.** Needle follows the asset; hops = hold P&L. |
| IDP (Bosa, Parsons) | **Law.** Unpriced, listed, off every needle. Do not invent 0. |
| 2029 as 2028 | **Law** until DP ships 2029 rows. |
| Home hero vs y3 chip | **Law that hero stays today.** **Bug** that nothing says so. Caption, don’t swap the number. |
| Spark `null`→0 | **Bug.** Skip the point. |
| Short window = floored-today | **Provisional, not a smash.** Badge `not yet 3y`. |

### Questions for Truman (defaults)

1. **300 as a named constant, or retune to a percentile each rebuild?** → **Keep 300.** It is ≈ 2.07 and ~148 SF-relevant names. Full-board p50 is 29 (junk). A percentile would chase taxi noise.
2. **Floor still-a-pick snaps &lt; 300?** → **No.** Players only. Dart throws stay cheap, not dead.
3. **Mean of all snaps (0s in), or count years ≥ 300 then average those?** → **Mean, zeros stay.** The second option inflates retirees.
4. **Pick still a pick in year 2, player in year 3: one blended mean?** → **Yes, blend.** Same identity as Today at each date. Caption if mixed. Do not split pick-years vs player-years on the chip.
5. **Short window: number or dash?** → **Number + `not yet 3y`.** Off any future 3y Best/Worst.
6. **Off-board Today: last-known 3 or 0?** → **Last-known.** Require N missed months before Today goes to 0 (not now).
7. **Best/Worst / Home hero on 3y?** → **No** until Q2 + Q5 land. Then a third *board* clock, not a replacement.
8. **Calendar accept+3y (current) vs three NFL season-ends?** → **Keep calendar + YE-in-window.** No new clock. Dec 31 is late regular season; good enough.

### Proposed changes (ranked) — captions and one floor-scope fix

1. **Formula:** floor **player** snaps only. `MIN_ACTIVE` stays 300. Zeros stay in the mean. *(the compose)*
2. **Caption:** `not yet 3y` when `cap === today` and accept+3y is still ahead.
3. **Caption under Home hero** when the y3 chip is on: “rows below use First 3 years; this number is still today.”
4. **Caption on an open y3 row:** dates that entered the mean; “under-300 player years = 0; picks left raw.”
5. **Spark:** skip null year-ends (`|| 0` is a crash-to-axis). Shade the 3y span later — existing SVG, no library.
6. **Docs only:** strike “not a git repo”; disambiguate League “3 years” (trade-date window) vs the chip.

**Do not touch:** Today needle, T0, Aged, hops, Best/Worst, `realized_per_trade`, a third Home hero, 2019 YE invention, monthly/weekly default, peak/AUC as the chip, style labels.

**Do not start feature work** until §8 / the eight questions above are answered. The recommended defaults are enough to do item 1–3 without a fourth clock.

### 300 is not “retired”

`value_2qb` is DynastyProcess **trade value from Superflex ECR**, not fantasy points and not dollars. Intended top of board ≈ **10,000**. Today (2026-08-28): Josh Allen **10,232**, Lamar **9,184**, Chase **9,055** (Chase is **10,232 in 1QB** — we do not use that column). Floor is **1** on the live board (taxi). Picks: 2026 1.01 = **7,311**, late 5ths = **7**. All-time max on disk ≈ **10,280**. We do not clamp.

**300** sits at player **p72** (148 of 535 names ≥ 300) and pick **2026 2.07 = 306**. Hill **285**, Diggs **287**, Rodgers **275** are under it and still in the league. So 300 means **“no longer a real Superflex piece,”** not “retired.” If Truman wants dead-only, the constant has to drop (e.g. 50–100), which lets Hill stay in the 3y mean.

**“Throw out under 300”** in speech must mean **count as 0 and keep the year**. Dropping the year is the inflation bug (a star who dies in year 3 looks like they never faded).

Plan file `best_worst_trade_boards` is **HAVE** (boards + sparks + windows). Its todos are stale. It never mentioned 3y or 300 — `TRACKER_SDD` is the law now.
