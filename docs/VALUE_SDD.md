# CuckleChunckle — Value SDD (surface law)

How assets are identified, which clock is honest, and how DynastyProcess / GitHub history must be used **over time**. Implementation notes that already exist are marked HAVE. Recommendations that are not yet WANT-canon are marked **RECOMMEND**. IN FLIGHT = First-3-years code in `revalue.mjs` as of 2026-08-28 — inventory, do not revert, do not let it replace Today or T0.

---

## 1. Asset identity (pick one per number)

| Identity | What the row is | When to use |
| --- | --- | --- |
| **Player** | `player:{sleeper_id}` on the DP Superflex board | The trade moved a named player |
| **Pick** | `pickval:{year}:{round}:{slot\|Early\|Mid\|Late}` | They accepted a pick, or hop-local P&L |
| **Became-player** | Same pick key, resolved through `asset_resolutions` (`kind: "player"`) whose `as_of` (draft day) is ≤ the query date, then price `player_key` | Default trade needle (“what did that pick turn into”) |

**Rules**

- Default lens = became-player **today**. Toggle = pick **at T0** (and the rest of the bag at T0).
- If no player resolution yet, became-player **is** the pick. Still-a-pick is not a failure.
- Parentheses on a label = **who used the pick**, not who got it in this trade.
- Hop tape is a **fourth** identity: each hop’s entry is pick-at-that-day; flip exit is pick-at-hop-out; only the drafter’s last hop exits at player-today. Do not fold hop P&L into the trade needle.
- 3-year over-time **RECOMMEND:** same identity as became-player at **each** snapshot (pre-draft dates stay a pick; post-draft dates become the player). That is “what the asset was on the board,” not “what you personally still held after a flip.”

Never add two identities into one hero.

---

## 2. Clocks already live

### Today

`asOf = latest as_of` on the full curve (HAVE: `2026-08-28`).

Needle = received − sent. Incomplete (any `value == null`) → delta `null`, listed, off `realized_per_trade`.

**Why today-only lies.** 2019-07-26 ChiefGumby sent the picks that became Saquon + Chubb, received the picks that became Zeke + Hill.

| Clock | Chief received | Chief sent | Δ |
| --- | --- | --- | --- |
| Today (HAVE) | 288 (Zeke 3 + Hill **285**) | 2228 (Saquon 2226 + Chubb 2) | **−1940** |
| First 3 years, IN FLIGHT | 11971.5 | 11493.5 | **+478** |

Today says blowout. 2020–21 year-ends (the honest “first years” we can see — DP does not exist for 2019-12-31) say the bags were in the same galaxy and Chief was slightly ahead. Zeke 2020 YE 4869 / 2021 YE 3769; Hill 7976 / 7329; Saquon 8089 / 5176; Chubb 3804 / 5918.

Hill at **285 today** is why the floor must not touch this clock.

### T0 (pick at trade day)

Price the bag on accept day with the **pick** lens (players at T0 still use player values).

**Why T0-only lies.** You accepted a pick, not a career. T0 cannot see Garrett Wilson if you traded a 2022 1st in 2020. T0 is also **null** for 2019 startup picks — DP history starts 2020-04-30. Chief–ARae has no T0; that is not incomplete-today.

Aged = today Δ − T0 Δ. Truman–Bubba 2026-08-24: today +254, T0 +312, aged **−58** (HAVE). Honest “the market moved after you clicked accept.” Silent if T0 is null.

### Style

Win-now / Investor / Balanced is a **label** from T0 bag mix + how today moved vs T0. It does not change any clock.

---

## 3. The GitHub / DynastyProcess curve

**Provider:** `dynastyprocess/data`, Superflex column `value_2qb`, `format_key: "2qb"`.

**How `as_of` works (HAVE)**

- Latest file: `as_of` = the machine’s UTC date on snapshot run.
- History: newest git commit **per YYYY-MM** on `values.csv` / `values-players.csv`; `as_of` = that commit’s author date.
- Lookup: last row with `as_of <=` query date. Between commits, value is flat.
- “Year-end” in this app is the calendar date `YYYY-12-31` run through that lookup — so it is really “last snapshot on or before Dec 31.”

**Dates we actually have (HAVE, this rebuild)**

- 75 distinct `as_of` days, 2020-04-30 … 2026-08-28 (76 snapshot records; latest day duplicated once).
- Typical density: ~1 file per month after mid-2020. 2020-11-07 is thin (25 pick rows vs ~85).
- **No 2019 file.** Every 2019-12-31 lookup is empty.
- Player keys seen: ~1,307 over history. Latest board ~530 players (varies by month; 2026-01-30 was 404).

**Full curve vs used curve**

- Full: every DP row we parsed (`value_curve.json`, 6.9 MB).
- Used: keys that appear on a leg, a resolution, or a draft pick, plus the Mid/Early/Late/2028 proxies those picks need (`value_curve_used.json`). The page never fetches either; `revalue.mjs` prices from the used index.

**Pick book shape**

| Year on the board | What DP ships |
| --- | --- |
| Current NFL year (2026) | Exact slots `Pick R.SS` |
| +1 (2027) | Early / Mid / Late + generic Mid |
| +2 (2028) | Generic Mid only (`2028 1st` …) |
| +3 (2029) | **Hole.** We proxy the same 2028 round and flag `priced_as_2028` |
| 2020 history | Slots only (no Early/Mid/Late keys) |

**Early / Late / Mid (HAVE, do not silently Mid)**

1. Exact `pickval:Y:R:slot` if we know the slot.
2. Else that slot’s tier (Early ≤ ceil(10/3), Mid, Late).
3. Unslotted: Mid, flag `priced_as_mid`.
4. No row for that year (2019, 2029, …) → steps 1–3 on the closest year that has the same round, flag `priced_as_{year}`.
5. Round deeper than the book (startup 8th / 10th) → deepest round on the closest year (`priced_as_{year}r{n}`).
6. Query date before the first snap → use that first snap (DP starts 2020-04-30).

A slotted pick with no exact or tier row is **unpriced**, not a quiet Mid.

**Unpriced / no DP row**

- No Sleeper id (IDP: Bosa, Parsons-as-player). Incomplete, off needle.
- Date before the asset’s first curve row **and** no closest-year pick proxy (named players in 2019, not picks).
- Pick year with no matching round on any later/earlier DP year.

**IDP.** There is no IDP book. Defensive players are unpriced. Do not invent a 0.

---

## 4. Window floor (off the board, not “under 300”)

**HAVE:** A player snap on a year-end / window date is **0** only if they are **not in that month’s DP Superflex file**. Cheap-but-listed players keep their raw (then flatten). Still-a-pick Mid values are never zeroed this way. Today and T0 are unchanged.

The old `MIN_ACTIVE = 300` rule zeroed live players (Alec Pierce 35–222 in 2023–25, Hill 285, Pollard, etc.). That was the “0 on the bag” bug.

**Carry-forward vs floor.** `asofRow` still carries the last-known raw if we ask for a later date. The window floor now checks “were they on *this* snapshot?” so Zeke after his last DP row (2026-02-27) is 0 on later window dates, while Pierce on every 2023–26 file stays priced.

---

## 5. Default over-time formula

**RECOMMEND** (and IN FLIGHT shape, with the floor-scope fix above):

```text
window = [accept, min(accept + 3 years, today)]
dates  = year-ends in that window, plus `today` if today is inside the window
         (HAVE does not insert accept+3y itself; see edge cases)
per snap, per leg:
  price as became-player at that date (pick if not drafted yet)
  if unpriced: omit the snap (cannot invent a number)
  else if player and value < MIN_ACTIVE: 0
  else: value
leg score = mean(snaps that existed)
bag       = sum(leg scores)
needle    = received bag − sent bag
incomplete if any leg has zero surviving snaps
```

This is the **First 3 years** chip. It answers: “in the years that actually matter after you clicked accept, what was the bag worth on average?”

It is **not** Today. It is **not** T0. It must not overwrite `realized_per_trade`.

### Why mean, not peak or sum

- **Mean** = “typical year in the window.” Zeke+Hill vs Saquon+Chubb becomes a fair 2020–21 conversation (+478), not a 2026 tombstone (−1940) and not a 2019-null T0.
- **Peak** answers “did you ever hold a smash?” — honest as a secondary, lying as the only number (one spike year wins).
- **AUC / sum** answers “total dynasty-years of value.” Honest for career-ish windows; it **grows with window length**, so a 2019 trade’s 3y sum is not comparable to a 2025 trade’s 1y sum unless you divide by dates (which is the mean).
- **Years above 300** answers “how long were they a real starter?” Honest as a count, not a point total.
- **Last-good-year** answers “when did this die?” Honest for Hill 2024→2025→2026 (3950 → 706 → 285); not a bag needle.
- **Floor-on-today-only** would zero Hill on the Home row. Forbidden.

---

## 6. Alternatives (when each is honest)

| Aggregator | Honest when | Lie mode |
| --- | --- | --- |
| **3y mean + floor** (default) | You care about the stretch you traded for, including dead years as 0 | Window not elapsed (collapses toward floored-today); pre-curve dates dropped |
| Peak in window | Hunting smash / regret highlights | One year dominates a balanced bag |
| AUC / sum of snaps | Same-length windows, or you show “per year” next to it | Longer careers look richer |
| Years ≥ `MIN_ACTIVE` | Roster-spot / starter-years argument | A 301 and a 9000 count the same |
| Last year ≥ `MIN_ACTIVE` | Aging-curve / when to sell | Ignores how good they were |
| Floor on Today | Never, with Hill at 285 | Zeros live-but-cheap pieces |
| Career mean to today | “How did this pick live?” for 2019–21 deals | Punishes 2025–26 trades; re-opens today-only for old smash-then-retire |

Do not ship a second alternative as a fourth chip until 3y is trusted.

---

## 7. Edge cases (law)

**Still-a-pick inside the window.** Price the pick. Do not floor it as “retired.” If the window ends before the draft, the 3y number **is** pick-value mean (often one Mid quote). Caption must say still a pick.

**Flipped picks.** Became-player over-time follows the **asset** (eventual draftee after draft day), even if you sold the pick. That matches Today’s identity. Your personal hold P&L is the hop tape (flip exit at hop-local). Do not average those into one delta.

**3-team.** Needle is still received − sent **for you**. Other seats’ received bags are context, not your math. Zero-sum holds across all seats together, not pairwise. A receiver-only seat (empty `sent`) is legal under HAVE’s “everyone received” filter — call it out in the row, do not pretend it is a 2-team swap.

**One-way.** Out of the meter. No ghost 0 on the other side.

**FAAB.** Not a leg. Not points. Not “incomplete.”

**Incomplete / no DP row.** Listed. Off every needle (today, T0, y3). IDP included.

**2019 startup, no pick prices.** Today became-player is fine. T0 is null. Aged is null. 3y uses post-2020-04-30 snaps only (do not invent 2019 YE). Do not mark the trade incomplete-today just because T0 is empty.

**Trade date vs year-end grid.** Accept in November 2019, +3y = November 2022 → snaps 2019-12-31, 2020-12-31, 2021-12-31. The Dec 31 of year 3 is **after** the cap and is excluded. HAVE does not add the cap date itself. Accept in January 2020 → 2020/21/22 YE. **RECOMMEND** keep this (year-ends that fall in the closed window) and document it; do not silently add monthly points to “make 3.”

**Window not yet elapsed (2025–26).** HAVE still emits a y3 number: mean over whatever year-ends + today are already inside the cap. A 2026-08-24 trade has **one** snap (today), then the floor. **RECOMMEND** treat short windows as **provisional**: same formula, caption “first N months, not yet 3 years,” and do not let them win Best/Worst. Do not hide the chip.

**Player with no curve rows.** Unpriced at every date → incomplete on y3. Same as today.

**Dip under 300, then recover.** Keep the 0 year in the mean. Dropping it is the inflation bug.

**Two players both under 300.** Today may still show 288 vs 2228 (Hill 285 + Zeke 3). y3 zeros each sub-300 **snap**, not the whole bag. A bag of two live-but-cheap players can be 0 on a single-snap window and huge on 2020–21. That is the point of the third chip.

**`today` on a y3 side object.** HAVE reuses the field name for the window mean. Law: UI must label it “first 3 years,” never “today.”

---

## 8. What must never mix on one number

- Today Δ + T0 Δ (that is Aged — show it as Aged).
- Today Δ + 3y mean (do not average clocks).
- Became-player + hop flip P&L.
- Your bag + `other_bags` (3-team context only).
- Style now-share + any delta.
- Floor-on-window + floor-on-today.
- A third **hero** on Home. Chip on the row, or a caption under the bags. The big number on Home stays per-complete-trade **today** (or pick-lens when that chip is on).

---

## 9. Self-checks the next implement pass must keep

Keep every check in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8.

Add (when touching y3), do not replace:

- y3 never writes `realized_per_trade` / `pick_per_trade` / `trade_boards.*.today_delta`.
- Hill today stays 285 (or whatever DP says) when `MIN_ACTIVE` is 300.
- A retired-year snap `< MIN_ACTIVE` contributes **0**, and the date **stays** in the mean’s denominator.
- Still-a-pick snap is either unfloored (RECOMMEND) or, if Truman chooses “floor everything,” flagged in the caption — pick one, test one.
- Window-not-elapsed trades may have a y3 number; they must not appear on a 3y Best/Worst until that board exists (it must not exist yet).
- Chief–ARae: today −1940, T0 null, y3 ≠ today and y3 ≠ 3 for Zeke.
- Missing `data/ktc/latest.json` → even-today === flatten(DP) (blend skipped).
- With a KTC snap: Baker / Bigsby / Hill / Bijan even-today move toward KTC vs flatten-only (direction, not exact match).
- Zero-sum 2-team holds on blended even-today. Truman–Bubba stays complete.

---

## 10. Worked numbers (regression anchors)

**ChiefGumby ← 2019 1st/2nd (Zeke, Hill) ; sent 2019 1st/2nd (Saquon, Chubb), 2019-07-26**

- Today: 3+285 vs 2226+2 = 288 vs 2228, Δ −1940. T0 null. No third pile.
- y3 dates HAVE: 2019-12-31 (dropped), 2020-12-31, 2021-12-31. Cap 2022-07-26 drops 2022-12-31.
- Hill y3 (7976+7329)/2 = 7652.5. Zeke (4869+3769)/2 = 4319. Received 11971.5. Sent (6632.5+4861)=11493.5. Δ +478.

**TrumanCooper vs BubbaCuckShremp, 2026-08-24**

- Today: received 794+121=915; sent 388+44+215+14=661; Δ +254.
- T0 Δ +312; aged −58.
- y3 IN FLIGHT (one snap = today, floor on): 794+0 vs 388+0+0+0, Δ +406.
- 2029 4th flag `priced_as_2028`.

---

## 11. Keep Trade Cut (PARKED — not on the dashboard)

Dashboard book is **even-flatten only**. Window chips (day of trade / 1y / 2y / 3y / all time) average those flatten year-ends. Do not mix KTC into the score. Snapshot script and `data/ktc/` stay for later if we want a crowd check.

**Not a second book on historical clocks.** We start snapping KTC Superflex ourselves. First file = the day we ran `node ktc-snapshot.mjs`. There is no honest 2019–2025 KTC in this repo. Do not scrape “old” ranking pages — they do not exist as dated archives.

### Weekly snapshot

- Script: `ktc-snapshot.mjs`. Superflex only (`format=2`). ~10 pages, sequential, ~600ms delay, identifying User-Agent.
- Writes `data/ktc/YYYY-MM-DD.json` and copies it to `data/ktc/latest.json`.
- How to run: see `data/ktc/README.md`. Git-committing those JSON files **is** the history. Prefer local/cron over CI so we do not hammer KTC.
- ToS posture: personal weekly snapshot for this league’s offline formula. **Not** a live scrape from the phone page.
- Names → Sleeper id via DynastyProcess `db_playerids` (`ktc_id`, then merge_name). Unmatched names are logged on the snapshot (`unmatched`). A few misses do not fail the build. Picks join only when the name parses to `pickval:Y:R:Early|Mid|Late`.

### Blend

KTC is already crowd-flat (~10k scale). Do **not** run the even-flatten curve on KTC.

```text
w = 0.60                         // KTC_TODAY_WEIGHT — KTC owns, even-DP assists
dp_even = flatten(DP value_2qb)  // even curve, that day's board max
custom = (1 - w) * dp_even + w * ktc_sf   // only if a KTC file has as_of <= that day
```

- No KTC file on or before the query date → flatten-only.
- Player with both even-DP and a mapped KTC SF value → blend.
- DP only → DP only. KTC only → skip (do not invent a DP row).
- Pick → blend only on a clean `pickval` join; else even-DP pick price.
- Do **not** paste the 2026-08-28 KTC book onto 2019–2025 year-ends. Those stay flatten-only until we have a snap for that week.

**Not used on the dashboard.** Hop tape stays raw DP. Even-flatten is the trade needle.
