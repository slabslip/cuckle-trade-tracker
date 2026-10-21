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

## 2. Calculus (v5 — week-scaled blend + Monte Carlo paths)

v1 double-counted banked wins. v2 forecasts movement. v3 adds actual-vs-proj
form. v4 downweights noisy weeks 1–4 and adds playoff-trend, form slope, and
transaction heat. **v5** week-scales the blend from a 7-season × 2500-sim
Monte Carlo calibration and blends MC mean place into `proj_finish` (with
p10–p90 path bands on each seat). See
[`PROJECTED_FINISH_MC_CALIB.md`](./PROJECTED_FINISH_MC_CALIB.md).

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
proj_finish  = rank( (1−mc_blend)×book_rank + mc_blend×mc_mean )
mc_blend     ≈ 0.20 W1 → 0.40 W6 → 0.62 W12
```

Multi-season MC (2019–2025, 2500 sims): book MAE W1/W6/W12 = 2.94 / 1.74 / 1.71;
MC MAE = 2.36 / 1.51 / 1.14; ~85–90% of actuals fall in the MC 80% band.
2025 W6 grade vs actual: see
[`PROJECTED_FINISH_W6_2025_RETRO.md`](./PROJECTED_FINISH_W6_2025_RETRO.md).

- **Remaining** = weeks after `last_scored_leg` through `playoff_week_start - 1`.
- Trend from `raw/weekly_scores.json` for the live season.
- Form from Sleeper weekly starter projections vs actuals.
- Heat from `raw/trades.json` + `raw/moves.json` (last 3 scored weeks).
- Soft playoff bracket in expand stays opinion chrome.

Lib: [`lib/projected-finish.mjs`](../lib/projected-finish.mjs).

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
