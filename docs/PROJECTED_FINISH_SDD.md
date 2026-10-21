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

## 2. Calculus (v3 — movement + form)

v1 double-counted banked wins (race + full expected_wins), so every seat’s
projected finish matched place now. v2 forecasts **movement**. v3 also
credits seats that beat (or miss) weekly starter projections:

```text
pythag = PF^1.8 / (PF^1.8 + PA^1.8)
form_delta = weighted mean(actual − starter_proj) over scored weeks
form_z / form_recent_z = league z-scores (recent 3 weeks separate)
adj_pythag = clamp(pythag + FORM_LEAN × blended form_z)
P(A beats B) = adj_pythag_A / (adj_pythag_A + adj_pythag_B)
expected_remaining_wins = Σ P(win) over remaining RS weeks   ← SoS + form
sos = mean(opponent adj_pythag); sos_ease = 1 − sos
race_score = 0.70 × standings_pts_norm + 0.30 × PF_norm
path_score = normalize(expected_remaining_wins)              ← remaining path only
ease_score = normalize(sos_ease)                             ← soft vs hard slate
arc_score  = normalize(avg_climb) × season-left scale
             − 0.25 × fast_fade_rate                         ← season-arcs prior
form_score = normalize(blended form_z)                       ← outscore / underscore
proj_score = 0.28×race + 0.34×path + 0.13×ease + 0.12×arc + 0.13×form
```

- **Remaining** = weeks after `last_scored_leg` through `playoff_week_start - 1`.
- Arcs from `season-arcs.json` (`avg_climb`, fade rates). Early season trusts
  history more (`arc_scale = weeks_left / season_weeks`).
- Form uses Sleeper weekly projections summed over each week’s starters vs
  actual points. Recent weeks weigh more; last-3-week residual can flip a seat
  that has “begun” to clear proj.
- Regular-season projection only (no Monte Carlo). Expand UI may paint a
  **soft** playoff bracket from projected seeds + form-adjusted edges —
  opinion, not a scored sim, and it does not write Draft picks or the trade needle.
- Incomplete season stays out of Manager avg finish (unchanged).

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
