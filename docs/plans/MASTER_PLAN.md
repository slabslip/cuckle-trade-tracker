# Master plan — next work from this agent

**Status:** Living starting plan for the handoff agent (2026-10-21).  
**Entry:** [`docs/AGENT_HANDOFF.md`](../AGENT_HANDOFF.md)  
**Catalog:** [`docs/AGENT_CATALOG.md`](../AGENT_CATALOG.md)

This is not a second PRODUCT canon. It ranks **what to build next** from
existing SDDs, plan status lines, open PRs, and other agents’ leftovers.

---

## North star

Chuckle is the best **receipt** in dynasty and a weak **morning paper**.
Win the morning (overnight letter + shareable proof). Keep the needle honest.
Never let opinion (votes, news, ledger) write the book.

---

## Now / Next / Later

### Now (ship against current five-tab `main`)

| # | Work | Why | Spec / source |
| --- | --- | --- | --- |
| 1 | **Dashboard strategy overnight** — Home race pulse, intel top-4, archetype v2, Ideas tips | Persona IA from overnight review | [`DASHBOARD_STRATEGY.md`](./DASHBOARD_STRATEGY.md) |
| 1b | **Manager intel Phase A** (shipped #174/#175) | Race spine + arcs + archetypes | [`manager_intel_spine.md`](./manager_intel_spine.md) |
| 2 | **Overnight lede: yesterday’s injury / tape delta** | Plan’s explicit next cut; makes the letter a morning habit | [`dynasty_daily_habit.md`](./dynasty_daily_habit.md) |
| 3 | **Public memory receipts** (`shareProofNow`, `?r=trade&t=`) | Group-text proof without Sign-in wall | [`MEMORY_SDD.md`](../MEMORY_SDD.md), OPEN Q17 |
| 4 | **Book integrity after any value touch** | Standing checks in PRODUCT §5 | `check-value-feed.mjs`, `apply-value-adjust.mjs` |

### Next (manager spine + agent leftovers)

| # | Work | Why | Caution |
| --- | --- | --- | --- |
| 5 | **Season arcs book + door** (slow start → finish strong; early bubble trades) | Past-season PF weeks + trades already on disk | Keep out of value book; RS arcs only |
| 6 | **Manager archetypes + Proxy contender** | Incentive: compete so someone else’s first you own stays Early | 3-season floor when possible |
| 7 | **Home “Needs you” / pulse / standings peek** | Best IA idea from PR #108 | Re-implement on **Home**, not four top tabs. Close or rewrite #108. |
| 8 | **High↔low sort toggle** | Built on `cursor/high-low-sort-toggle-8d2b` | Rebase onto `main`; open a fresh PR |
| 9 | **Reconcile draft PR #43** (seat auth) | Early phase-1; most of app path is on `main` | Diff vs `main`, close if superseded |
| 10 | **Vote persistence docs PR #14** | Recently touched | Confirm not duplicate of `db/` + `SUPABASE_SETUP.md` on `main` |

### Later (planned, locked, or seasonal)

| # | Work | Spec |
| --- | --- | --- |
| 11 | Manager dossier on team home (Phase D) | [`manager_intel_spine.md`](./manager_intel_spine.md) |
| 12 | Optional intel-agent copy over books (Phase E) | Eval-gated; never writes needle |
| 13 | Ledger join / more exposure (v1.1) | [`ledger_join_exposure.md`](./ledger_join_exposure.md) |
| 14 | Note → Finish → Send (Shortcut drafts + SMS) | [`ledger_compose_and_alerts.md`](./ledger_compose_and_alerts.md) — locked, do not reopen decisions |
| 15 | Week-score award bands → Fresh 15 grind | [`awards_titles_emblems.md`](./awards_titles_emblems.md) |
| 16 | Comeback Dynasty (last → chip in 3y) | Needs multi-year place history; pairs with season-arcs |
| 17 | Title paint on every byline | OPEN Q14 — wait for Truman on 390 |
| 18 | GM/redraft career cluster | Open PRs #137, #147, #149, #142 (stale) |
| 19 | Store / TestFlight polish | [`STORE_LAW.md`](../STORE_LAW.md), [`STORE_OPS.md`](../STORE_OPS.md) |
| 20 | Custom domain cutover | [`CUSTOM_DOMAIN.md`](../CUSTOM_DOMAIN.md) |

### Parked (do not start)

Oracle, waiver AI, playoff-odds engine, marketplace + accept odds, web push,
Play Store wrapper, Flutter rewrite, Sleeper chat scrape, Best 10 revival,
sixth tab, Chart.js, flooring today with `MIN_ACTIVE`, Unicode emoji emblems.

---

## Recommended first slice for *this* agent

Unless Truman names a different slice:

1. **Manager intel Phase A** — wire `projected-finish.json` into Who has firsts
   sort/captions, Team Ideas partner weights, and overnight race movers.
   Spec: [`manager_intel_spine.md`](./manager_intel_spine.md).
2. Then **Season arcs** book from `weekly_scores` + trades + finishes (slow
   burn / bubble trader / proxy first).
3. Overnight injury lede remains the parallel morning-paper cut
   ([`dynasty_daily_habit.md`](./dynasty_daily_habit.md)).
4. Only then consider porting PR #108’s “Needs you” content onto Home.

If Truman wants nav/IA instead: start with a written proposal that **keeps**
`Home | Teams | News | Ledger | Menu` and maps “Needs you” onto Home chrome.

---

## Merge / triage of the open PR queue

24 open PRs as of 2026-10-21. Only **#108** and **#14** moved recently; the rest
are ~30–50 days stale.

| Action | PRs |
| --- | --- |
| **Rewrite or close** | #108 (conflicts; wrong chrome era) |
| **Audit vs main then close/merge** | #14, #43, #49, #46, #55 (votes/auth era) |
| **Seasonal batch if GM is next** | #137, #147, #149, #142, #126 |
| **Likely superseded / close** | #44, #47, #48, #11, #61, #62, #81, #90, #100, #116, #120, #153 |
| **Leave open on purpose** | #15 (X→Discord unwired) |

Do not mass-merge. Diff each against `main` first — much of September work
already landed via direct merges when PR create was blocked.

---

## Definition of done (any UI slice)

1. Law still holds: five tabs, no bag totals on Home, Settings Back → Home.
2. `node generate-page.mjs` (and pipeline steps if the book moved).
3. `DATA_V` + SW `CACHE` bumped.
4. Design Mode or Playwright evidence under `/opt/cursor/artifacts/`.
5. Ship loop / edge loop when touching Home, Menu, Data doors, or history state.
6. PR against `main` with a short test plan.

---

## Doc map (where law lives)

```text
WANT          PRODUCT.md
HAVE          ARCHITECTURE.md
UI chrome     UI_SDD.md · HIG_SDD.md · STORE_LAW.md
Value math    VALUE_SDD.md · FORMAT_BOOKS.md
App / auth    APP_SDD.md · START_HERE.md · SUPABASE_SETUP.md
Ledger        LEDGER_SDD.md · LEDGER_BUILD_SDD.md · LEDGER_* plans
Cosmetics     COSMETICS_SDD.md · plans/awards_titles_emblems.md
Memory        MEMORY_SDD.md · DEBATE_CATALOG.md
News / smack  NEWS_SDD.md · SMACK_AGENT.md
Undecided     OPEN_QUESTIONS.md
Handoff       AGENT_HANDOFF.md · AGENT_CATALOG.md · this file
```
