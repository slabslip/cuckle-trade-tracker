# Agent handoff — start here in this session

**Role:** Single starting point for a **new** Cursor Cloud Agent on
`slabslip/cuckle-trade-tracker`. Synthesizes product canon, open work from other
agents, and what *not* to reopen.

**Companion docs:**

| Doc | Use |
| --- | --- |
| [`START_HERE.md`](START_HERE.md) | Go-live checklist (Supabase SQL, Auth, `join-league`, dogfood) |
| [`plans/MASTER_PLAN.md`](plans/MASTER_PLAN.md) | Prioritized next build order |
| [`AGENT_CATALOG.md`](AGENT_CATALOG.md) | Other agents, branches, open PRs |
| [`PRODUCT.md`](PRODUCT.md) | WANT canon |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | HAVE (what the pipeline emits) |
| [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) | Truman decisions still open |

**This agent run:** https://cursor.com/agents/bc-a5c2738e-9298-4f4d-8735-2aa4d18333b5  
**Owner:** Truman Cooper (`slabapp@outlook.com`) · Cuckle seat `TrumanCooper`

---

## 1. What this product is (one paragraph)

Chuckle Fantasy / CuckleChunckle is a **phone-first dynasty trade tracker and
league receipt** for Superflex dynasty Sleeper league `1315431339301806080`
(multi-league app path for other books). It pulls completed trades and drafts
from Sleeper, prices assets on DynastyProcess Superflex (five flatten Score-as
windows) plus a separate today blend, and scores each seat as **you received −
you gave up**. Home is the daily paper. Memory chips are textable proof. Votes /
News / Ledger are **opinion** and never write the needle. Selecting a name is
not “view as” — **you are that seat**.

Live: https://slabslip.github.io/cuckle-trade-tracker/  
Supabase: `https://gtqyvnkkjiksmmtmzubw.supabase.co`  
Cloud Agent repo root: `/workspace` (never `~/Documents/...`)

---

## 2. Locked IA on `main` (do not invent a sixth tab)

```text
Bottom pill:  Home | Teams | News | Ledger | Menu
Menu doors:   My team · Titles and Emblems · Calculator · League Data · Settings
```

- Calculator is `?view=calc`, not a tab.
- League Data is research / Memory doors (internal id often `history`).
- Settings Back → league Home (`returnToLeagueHome()`), never My team.
- No `#goHome`, no + FAB, no personal bag totals on Home.
- No Best 10 / Worst 10. No `realized_*`. No `renderLeague()` Traders list.

Source of UI truth: **`generate-page.mjs`** → regenerates `index.html`. After UI
ship: bump `DATA_V` + `sw.js` `CACHE`. Run ship/edge loops when touching nav,
Data doors, Home, or Back stack (`.cursor/agents/chuckle-ship-loop.md`,
`chuckle-edge-loop.md`).

---

## 3. What is already shipped (trust `main` + Pages)

| Area | Status |
| --- | --- |
| Meter pipeline + today blend + VA | Live (`build.mjs`) |
| Five-tab Home / Teams / News / Ledger / Menu | Live |
| Overnight letter + team analyzer (Cuckle dynasty) | Live v1 |
| Cosmetics Wave 1 — 136-id catalog (68 pairs), barracks, comic art, WebP thumbs | Live on Pages |
| Your emblem on your seat name; calling cards on team home / Teams | Live |
| Ledger New wager / clocks / settle vote | Live |
| Calc leftover + Favors with VA on receive bags | Live on `main` |
| Teams ordinal place badges (podium + last-place) | Live on `main` |
| TedCumberbatch lawyer smack flavor | Merged (#42) |
| Daily Sleeper sweep + values cron (no webhook) | Locked ops |
| iOS TestFlight WebView shell | `ios/` |

Plan archives that say “shipped”: `plans/home_digest.md`,
`plans/dynasty_daily_habit.md`, `plans/awards_titles_emblems.md` (Wave 1),
`plans/ledger_*` privacy / league-tab (chrome evolved — law is STORE/UI).

---

## 4. Critical fork: do not merge PR #108 as-is

| Item | Detail |
| --- | --- |
| PR | [#108](https://github.com/slabslip/cuckle-trade-tracker/pull/108) · `cursor/league-home-dashboard-8d2b` |
| Agent | [Ledger screen pull refresh](https://cursor.com/agents/bc-01a0727f-42e5-78f3-b2ab-885be0368d2b) |
| State | **OPEN + CONFLICTING** with `main` (not merged) |
| Problem | Built for an older **four top-tab** spine (`League · Teams · Ledger · Tape`). `main` is **five bottom pills** (`Home · Teams · News · Ledger · Menu`). |

Useful ideas from that agent (re-implement against current IA if desired):

- Soft Ledger pull-to-refresh (related work already on `main` via #107).
- “Needs you” inbox / league pulse / standings peek as Home content (not a
  fourth top tab named League).
- Stay-on-tab when re-tapping a pill.
- High↔low sort toggle — branch `cursor/high-low-sort-toggle-8d2b` (PR create
  was blocked; never merged).

**Do not** resurrect `League | Teams | Ledger | Tape` as the bottom bar without
an explicit Truman ruling that overrides `UI_SDD.md` / `STORE_LAW.md`.

---

## 5. Hottest leftover work from other agents

| Priority | Work | Source | Notes |
| --- | --- | --- | --- |
| A | Overnight letter: yesterday’s injury/tape delta on the lede | `plans/dynasty_daily_habit.md` | Next need cut on that plan |
| A | Memory public receipts `?r=trade&t=` (skip sign-in gate) | OPEN Q17 · `MEMORY_SDD.md` | Plain English + one number + URL |
| B | Rebase useful Home “Needs you” ideas onto five-tab Home | PR #108 (stale) | Port content, not chrome |
| B | High↔low sort on comparable lists | `cursor/high-low-sort-toggle-8d2b` | Verify vs `main`, open fresh PR |
| B | Close / reconcile draft auth PR #43 vs what’s on `main` | Agent vote/seat · PR #43 | Most of phase-1 already landed |
| C | Ledger join exposure v1.1 | `plans/ledger_join_exposure.md` | Planned, not built |
| C | Note → Finish → Send (Shortcut drafts) | `plans/ledger_compose_and_alerts.md` | Locked plan; later than New wager |
| C | Week-score award bands / Fresh 15 | `plans/awards_titles_emblems.md` | Needs weekly tape engines |
| C | GM/redraft career PRs (#137/#147/#149/#142) | Open, stale since Sep | Parallel surface |
| — | Title paint on every byline | OPEN Q14 | Parked until Truman looks at 390 |

Full agent + PR inventory: [`AGENT_CATALOG.md`](AGENT_CATALOG.md).  
Build order detail: [`plans/MASTER_PLAN.md`](plans/MASTER_PLAN.md).

---

## 6. Open questions that still need Truman

Follow **Recommended** in [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) until answered.
Still open: Q1–Q12, Q14–Q18. **Q13 (calc leftover + vote-nudge) is shipped.**

Highest leverage undecided:

1. **Q9** — do not floor still-a-pick values under 300 (law vs some IN FLIGHT code).
2. **Q14** — titles on every name vs seat plate only.
3. **Q17** — memory receipt share shape (recommended path already sketched).

---

## 7. Operating rules for this agent

1. **Canon:** WANT → `PRODUCT.md`. HAVE → `ARCHITECTURE.md`. UI chrome → `UI_SDD.md` / `STORE_LAW.md`.
2. **Pipeline owns arithmetic.** Browser only formats. One helper per number.
3. **`node build.mjs`** is the full rebuild. `apply-value-adjust.mjs` is not optional.
4. **News automated sources stay off** unless explicitly asked (`AUTOMATED_SOURCES`).
5. **No npm / Tailwind / Chart.js.** Existing CSS tokens only.
6. **Do not re-propose:** Best 10/Worst 10, `realized_*`, league Traders view, IP-as-voter, shared league password, Sleeper chat scrape, Unicode emoji award emblems, sixth bar cell.
7. **GitHub:** this environment often cannot create PRs as a collaborator — use the
   ManagePullRequest / dashboard path; never force-push `main`.
8. Prefer a **fresh agent** for new product slices; long mobile threads freeze the UI.

---

## 8. First 30 minutes on a new task

```bash
cd /workspace
git checkout main && git pull origin main
# read PRODUCT.md §2–4, UI_SDD.md §1, and the relevant SDD
# if UI: edit generate-page.mjs → node generate-page.mjs → bump DATA_V + sw.js
# Design Mode: python3 -m http.server 8799 → design-league-home.html
```

Dogfood / SQL still pending on a fresh Supabase? → [`START_HERE.md`](START_HERE.md).

When picking what to build next → [`plans/MASTER_PLAN.md`](plans/MASTER_PLAN.md).
