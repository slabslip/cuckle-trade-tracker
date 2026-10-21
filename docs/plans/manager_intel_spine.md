# Manager intel spine — next build from Projected finish

**Status:** Phase A–C shipped on `cursor/manager-intel-build-33b5` (Season arcs + Manager type doors, firsts/Ideas/overnight wired).  
**Companion:** [`PROJECTED_FINISH_SDD.md`](../PROJECTED_FINISH_SDD.md),
[`projected_finish_leverage.md`](./projected_finish_leverage.md).  
**Law:** Five tabs. Pipeline owns arithmetic. Projected finish / archetypes
**never** write the trade needle (same wall as Votes / Ledger).

---

## North star

Every claimed seat should open to four answers without hunting:

1. **Where am I in the race?** — place now → projected finish → pick band  
2. **What is my capital worth?** — firsts I hold / I sold, priced by *origin*
   seat’s projected slot (2027 from live book; 2028+ bag-window)  
3. **How does this manager usually act?** — season arcs + trade timing +
   incentive (own first vs proxy first)  
4. **Who should I ping?** — Team Ideas / deal doors weighted by race + archetype

Projected finish is the **race spine**. The next work is a **manager spine**
that sits beside it — not more tabs, more books that feed the same doors.

---

## Three truths (do not conflate)

| Truth | Book today | Job |
| --- | --- | --- |
| **Race** | `projected-finish.json` | This season’s place / SoS / Early·Mid·Late |
| **Bag** | `calculator.json` + client analyzer + `seat-direction.json` | Roster quality, window (Win-now / Rebuild) |
| **Manager** | *thin today* (`marks.json`, `finishes.json`, title-path posture) | Multi-year habits, arcs, incentives |

Icons and journeys must label which truth they show. Mixing bag “win-now”
with race “proj 9th Early” without naming both is how managers get lied to.

---

## Data icon families (League Data board)

Keep 41-door freedom; **group and default-pin** so managers see a story:

| Family | Doors (shipped / next) | Default pin? |
| --- | --- | --- |
| **Race** | `projected_finish`, *(next)* `race_movers` | Yes — Projected finish |
| **Career place** | `season_place` (Manager avg finish), sacko, contender, RS/playoff avgs | Manager avg finish |
| **Capital** | `my_draft`, `firsts_held`, `draft_board` — bands from proj book | Draft picks + Who has firsts |
| **Behavior** *(build)* | `season_arcs`, `bubble_trades`, `proxy_first`, `manager_dossier` | One door: Season arcs |
| **Hunt** | `fill_holes`, `move_extras`, Team Ideas (Home) | Consume race + behavior; no new chrome |
| **Marks** | run / manners / aging / draft hits | Keep; secondary |

**Home top-4:** keep Projected finish + Draft picks + one behavior door + one
hunt door once behavior ships. No sixth pill tab. No “Standings” chrome.

---

## Pick value rule (locked)

| Layer | Rule |
| --- | --- |
| **DynastyProcess / value book** | Unslotted picks stay Mid keys. Projected slot does **not** rewrite prices. |
| **UI pick band** | Origin seat → `proj_slot` / `band` for soonest year (live). |
| **Deal framing (next)** | Optional `pick_implied` on calc/Team Ideas: show “reads Early (~DP Early)” as caption only. |
| **Who has firsts** | Sort by projected slot ascending (1.01 first); tag holder + origin name. |

Incentive case Truman named: *manager sold their 2027 1st, still competing so
the Early they own elsewhere stays Early* → archetype **Proxy contender**.
Surface that on firsts rows and Team Ideas (“They’re fighting so *your* Early
stays Early”).

---

## New books to build

### 1. `season-arcs.json` (Phase B — highest new signal)

**Inputs already on disk:** `weekly_scores.json` (2019–2026 PF by week),
`sleeper_season_standings.json` (final place), `trades.json` / `trade_legs.json`,
`traded_picks.json`, `finishes.json`.

**Per seat × season:**

| Field | Meaning |
| --- | --- |
| `place_w4` / `place_w8` | Rank by cumulative PF (or W-L if matchup tape present) at week 4/8 |
| `place_final` | Bracket / RS finish |
| `delta_early_final` | `place_w4 - place_final` (+ = climbed) |
| `arc` | `slow_burn` / `fast_fade` / `steady` / `spike` |
| `early_trades_n` | Trades before week 5 |
| `bought_players_early` | Net player VA in before week 5 |
| `made_playoffs` / `avoided_last` | Outcome flags |
| `owned_own_first` | Still held origin 1st at Thanksgiving / season end |
| `proxy_motive` | True if `!owned_own_first` && competed (top-6 or not-last) |

**League door:** **Season arcs** — “Slow start → strong finish” board with
career rate + this-year trajectory peek from projected-finish `delta_place`.

### 2. `manager-archetypes.json` (Phase C)

Roll season-arcs + marks + seat-direction into stable labels (3-season min
when possible):

| Archetype | Signal |
| --- | --- |
| **Slow burn** | High `slow_burn` rate; finishes above early rank |
| **Fast fade** | Early top-half → final bottom |
| **Bubble trader** | Early-season buy-players + made playoffs / avoided last |
| **Proxy contender** | Sold/traded away own 1st; still fights; owns others’ Early |
| **Tank sculptor** | Win-now bag false; race Early; sells vets for picks |
| **Capital hoarder** | Holds multiple firsts; low early trade rate |

One line on **team home** under the projected caption. Full board as a Data door.

### 3. Wire existing books harder (Phase A — do first)

No new JSON required:

1. **`firsts_held` / Draft picks** — sort & caption from `projected-finish`  
2. **Team Ideas** — weight partners by band + `delta_place` (chase Early from
   tanking origins; sell Late to win-now)  
3. **Overnight** — race movers when `|delta_place| ≥ 1`  
4. **Teams list** — subtle SoS ease / band chip (optional)

---

## Agent / pipeline shape

```text
nightly sleeper tape
  → finishes / week-scores / picks / trades
  → projected-finish          (race)
  → season-arcs               (history)
  → manager-archetypes        (roll-up)
  → seat-direction (unchanged captions)
UI loads books → formats only
Team Ideas / hunt doors / overnight consume; never write value book
```

Optional later: a **Chuckle intel agent** (eval-driven) that writes *copy* for
overnight / Team Ideas from these books — still no needle writes. Do not start
Oracle / playoff-odds Monte Carlo (parked in MASTER_PLAN).

---

## Homepage / dashboard targeting (per manager)

```text
Home
  ├─ top doors: Projected finish · Draft picks · Season arcs · Who has firsts
  ├─ Team Ideas (≤3): race-weighted + proxy/bubble lines
  └─ overnight: race movers + “bubble buy” when early trades cluster

Teams → seat home
  ├─ Projected Nth · record · PF/PA · band → League board
  ├─ Archetype one-liner (Slow burn · Proxy contender · …)
  └─ analyzer (bag truth) unchanged

League Data
  └─ families Race / Career / Capital / Behavior / Hunt / Marks

Calc
  └─ open with Early already on bag; implied-band caption only
```

---

## Build order (do next)

| Phase | Ship | Why |
| --- | --- | --- |
| **A** | Wire proj into firsts + Team Ideas + overnight movers | Highest leverage on books we already have |
| **B** | `season-arcs.json` + Season arcs door | Truman’s slow-start / finish-strong ask |
| **C** | Archetypes + Proxy contender on firsts / team home | Incentive-aware pick valuation story |
| **D** | Manager dossier (trends / factors on seat home) | Full analysis surface without new tabs |
| **E** | Optional intel-agent copy over books | Morning paper voice; eval-gated |

Success: a manager sees *why* someone’s 1st is Early, *whether* that manager
usually climbs, and *who* to ping — from Home and team home alone.

---

## Do not

- Sixth tab / merge PR #108 four-tab chrome  
- Write projected slot into DynastyProcess price keys  
- Playoff-odds engine / Monte Carlo as a blocker for arcs  
- Floor today with `MIN_ACTIVE`
