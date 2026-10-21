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
| 1 | **Overnight lede: yesterday’s injury / tape delta** | Plan’s explicit next cut; makes the letter a morning habit | [`dynasty_daily_habit.md`](./dynasty_daily_habit.md) |
| 2 | **Public memory receipts** (`shareProofNow`, `?r=trade&t=`) | Group-text proof without Sign-in wall | [`MEMORY_SDD.md`](../MEMORY_SDD.md), OPEN Q17 |
| 3 | **Book integrity after any value touch** | Standing checks in PRODUCT §5 | `check-value-feed.mjs`, `apply-value-adjust.mjs` |

### Next (port or finish agent leftovers)

| # | Work | Why | Caution |
| --- | --- | --- | --- |
| 4 | **Home “Needs you” / pulse / standings peek** | Best IA idea from PR #108 | Re-implement on **Home**, not four top tabs. Close or rewrite #108. |
| 5 | **High↔low sort toggle** | Built on `cursor/high-low-sort-toggle-8d2b` | Rebase onto `main`; open a fresh PR |
| 6 | **Reconcile draft PR #43** (seat auth) | Early phase-1; most of app path is on `main` | Diff vs `main`, close if superseded |
| 7 | **Vote persistence docs PR #14** | Recently touched | Confirm not duplicate of `db/` + `SUPABASE_SETUP.md` on `main` |

### Later (planned, locked, or seasonal)

| # | Work | Spec |
| --- | --- | --- |
| 8 | Ledger join / more exposure (v1.1) | [`ledger_join_exposure.md`](./ledger_join_exposure.md) |
| 9 | Note → Finish → Send (Shortcut drafts + SMS) | [`ledger_compose_and_alerts.md`](./ledger_compose_and_alerts.md) — locked, do not reopen decisions |
| 10 | Week-score award bands → Fresh 15 grind | [`awards_titles_emblems.md`](./awards_titles_emblems.md) |
| 11 | Comeback Dynasty (last → chip in 3y) | Needs multi-year place history |
| 12 | Title paint on every byline | OPEN Q14 — wait for Truman on 390 |
| 13 | GM/redraft career cluster | Open PRs #137, #147, #149, #142 (stale) |
| 14 | Store / TestFlight polish | [`STORE_LAW.md`](../STORE_LAW.md), [`STORE_OPS.md`](../STORE_OPS.md) |
| 15 | Custom domain cutover | [`CUSTOM_DOMAIN.md`](../CUSTOM_DOMAIN.md) |

### Parked (do not start)

Oracle, waiver AI, playoff-odds engine, marketplace + accept odds, web push,
Play Store wrapper, Flutter rewrite, Sleeper chat scrape, Best 10 revival,
sixth tab, Chart.js, flooring today with `MIN_ACTIVE`, Unicode emoji emblems.

---

## Recommended first slice for *this* agent

Unless Truman names a different slice:

1. Read [`dynasty_daily_habit.md`](./dynasty_daily_habit.md) §6 “next need cut.”
2. Implement **yesterday’s injury snap on the overnight letter lede** (delta, not
   an IR museum), Cuckle dynasty only (`overnightEnabled()`).
3. Regenerate, bump cache, Design Mode verify, ship loop.
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
