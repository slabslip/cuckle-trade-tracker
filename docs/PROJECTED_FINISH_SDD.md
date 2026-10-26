# Projected finish — SDD

**Role:** In-season regular-season projected place → draft slot → Early / Mid / Late.  
**Status:** v1 shipping on Cuckle (and any live Sleeper league).  
**Builder:** `build-projected-finish.mjs` → `data/ui/projected-finish.json`  
**UI door:** League Data → **Projected finish** (`projected_finish`)  
**Career door (renamed):** **Manager avg finish** (`season_place`) — completed seasons only.

Companion: pick hub (`my_draft`), team home caption, [`MEMORY_SDD.md`](MEMORY_SDD.md),
[`VALUE_SDD.md`](VALUE_SDD.md) pick tiers.

---

## 1. Why this exists

Draft pick Early / Mid / Late used to mean “bag outlook” (analyzer now + window +
seat-direction). That is useful for 2028+, but **this year’s race** is what
actually sets next year’s slot. Managers need one honest board:

| Column | Source |
| --- | --- |
| Place now | W-L standings points, then PF |
| Record | Sleeper `wins-losses[-ties]` |
| PF / PA | Sleeper `fpts` / `fpts_against` (+ decimals) |
| SoS rest of way | Remaining RS matchups × opponent pythagorean |
| Expected wins | Current wins + Σ P(win) on remaining games |
| Projected finish | Rank by blended race + SoS (+ light bag) |
| Pick band | `pickTier(slot)` — last place → Early 1.01 |

This book feeds Draft picks, team home, Team Ideas / deal hunts later, and any
homepage “who to target” journeys.

---

## 2. Calculus (v6 — race intent + MC disagree override)

v1 double-counted banked wins. v2 forecasts movement. v3 adds actual-vs-proj
form. v4 downweights noisy weeks 1–4 and adds playoff-trend, form slope, and
transaction heat. v5 week-scales the blend from a 7-season × 2500-sim
Monte Carlo calibration and blends MC mean place into `proj_finish` (with
p10–p90 path bands on each seat). See
[`PROJECTED_FINISH_MC_CALIB.md`](./PROJECTED_FINISH_MC_CALIB.md).

**v6** adds season **race intent** (`data/ui/race-intent.json`: `tank` /
`win_now` / `playoff_hunt` / `contend`) that scales remaining-game effort and
form/trend credit; soft-compresses path when it runs far ahead of race; and at
W6+ prefers MC mean when book and MC disagree by ≥2 places.

v4/v5 signals still include **form slope** and **transaction heat**:

```text
week_weight(w) = soft for w≤4, full mid-season, heaviest near playoffs
talent_ppw     = weighted mean weekly PF (early soft)
talent_PF      = 0.30×season_ppw + 0.70×talent_ppw   × games
pythag         = talent_PF^1.8 / (talent_PF^1.8 + PA^1.8)
form_delta     = weighted mean(actual − starter_proj)   ← early soft
form_slope     = recent residual − early residual       ← W4–6 vs W1–3
trend_delta    = league-rel PPW (post-early − early)      ← display
trend_signal   = 0.40×trend_delta + 0.60×recent_rel      ← must score well lately
heat           = 2×trades + 0.35×FA adds in last 3 scored weeks
adj_pythag     = clamp(pythag + FORM_LEAN × blend(form_z, recent_z, trend_z+0.25×heat_z, slope_z))
P(A beats B)   = adj_pythag_A / (adj_pythag_A + adj_pythag_B)
expected_remaining_wins = Σ P(win)                       ← SoS + form + trend
race_score = 0.65×standings_pts_norm + 0.35×talent_PF_norm
path / ease / arc as before (arcs = career late climb)
form_score  = normalize(0.30×form_z + 0.50×recent_z + 0.20×slope_z)
trend_score = 0.75×normalize(0.80×trend_signal_z + 0.20×slope_z) + 0.25×heat_score
base weights = race 0.28 / path 0.28 / ease 0.10 / arc 0.10 / form 0.12 / trend 0.12
week_scale   = early↑ race+arc · late↑ path+form+trend   (renormalized)
proj_score   = Σ week_scaled_w × component
mc_sims      = 2500 remaining H2H + 6-team playoff tree
proj_finish  = rank( (1−seat_blend)×book_rank + seat_blend×mc_mean )
mc_blend     ≈ 0.22 W1 → 0.43 W6 → 0.68 W12
seat_blend   = mc_blend; at W6+ if |book−mc|≥2 → ramp toward 0.85
race_intent  = tank 0.62 / win_now 1.08 / playoff_hunt 1.04 / contend 1.0
               (multiplies remaining effort_pyth; tank also ×0.35 form/trend)
path_cap     = if path−race > 0.30 → soft compress toward race
```

Multi-season MC (2019–2025, 2500 sims): book MAE W1/W6/W12 = 2.94 / 1.74 / 1.71;
MC MAE = 2.36 / 1.51 / 1.14; ~85–90% of actuals fall in the MC 80% band.
2025 W6 grade vs actual: see
[`PROJECTED_FINISH_W6_2025_RETRO.md`](./PROJECTED_FINISH_W6_2025_RETRO.md).

- **Remaining** = weeks after `last_scored_leg` through `playoff_week_start - 1`
  (review script may bank the live NFL week from matchup points).
- Trend from `raw/weekly_scores.json` for the live season.
- Form from Sleeper weekly starter projections vs actuals.
- Heat from `raw/trades.json` + `raw/moves.json` (last 3 scored weeks).
- Race intent from `ui/race-intent.json` (review before each banked week).
- Soft playoff bracket in expand stays opinion chrome.

Lib: [`lib/projected-finish.mjs`](../lib/projected-finish.mjs),
[`lib/race-intent.mjs`](../lib/race-intent.mjs),
[`lib/projected-finish-mc.mjs`](../lib/projected-finish-mc.mjs).

### Weekly review loop

```bash
# 1) Edit intents for the week (tank / win_now / playoff_hunt)
$EDITOR data/ui/race-intent.json
cp data/ui/race-intent.json data/leagues/<id>/ui/race-intent.json

# 2) Dry-run: bank live week, 2500-sim MC, sanity vs intents
node scripts/review-projected-finish-week.mjs

# 3) Fix fails (intent mis-label or model), re-run until SANITY ok

# 4) Write book + bust SW cache + ship Pages
WRITE_PF=1 node scripts/review-projected-finish-week.mjs
# bump DATA_V / CACHE in sw.js + generate-page.mjs, then push main
```

Sanity refuses Late/top-3 tankers, win_now seats buried vs MC top-4, and
warns on playoff_hunt near the bottom.

---

## 3. UI law

- Five-tab pill unchanged. This is a **League Data door**, not a sixth tab.
- Team home shows a one-line projected caption + **League board** chip.
- Projected finish rows expand: plain-language path / SoS / history, week-by-week
  expected W/L on the remaining slate, and a soft top-six playoff bracket.
- Draft picks hub: soonest year (2027) ranks from this book when present;
  2028+ still use bag-window scores.
- Rename only: “How I finished” → **Manager avg finish**.

---

## 4. Pipeline

Runs in `build.mjs` after seat-direction, before cosmetics:

```bash
node build-projected-finish.mjs [league_id]
```

Nightly Sleeper tape should keep this fresh (same cadence as standings). Safe to
re-run anytime — network GETs only, no value book rewrite.

---

## 5. Downstream journeys (product leverage)

| Journey | How this book feeds it |
| --- | --- |
| **Draft picks** | Origin seat → proj slot → Early/Mid/Late; deal lines name the band |
| **Manager homepage** | “Projected Nth · record · PF/PA · band” on team home |
| **Who has firsts** | Sort / filter by projected Early holders |
| **Team Ideas** | Prefer poaching Early origins that are tanking; sell Late to win-now |
| **Fill holes / move extras** | Weight counterparties by whether they need your band |
| **Overnight letter** (later) | Optional “race movers” line when delta_place ≠ 0 |
| **Calc** | Open calc with Early pick already on the other bag |

Do not let projected finish write the trade needle. Opinion / planning only —
same wall as Votes and Ledger.

---

## 6. Out of scope (v1)

- Monte Carlo weekly score sims / true playoff probability distributions
- Writing projected slot into the **value book** (unslotted picks stay Mid until
  the draft; UI projection is separate)
- GM redraft pot law (door still works; pot tiles stay redraft-only)

Soft bracket in the expand pane is allowed (seeded from `proj_finish`, edges from
PF/PA pythag). It stays opinion chrome — not a second book.
