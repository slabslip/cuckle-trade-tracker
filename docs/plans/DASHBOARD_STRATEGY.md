# Dashboard strategy — dynasty manager OS

**Status:** Overnight living plan (2026-10-21).  
**Companions:** [`manager_intel_spine.md`](./manager_intel_spine.md),
[`PROJECTED_FINISH_SDD.md`](../PROJECTED_FINISH_SDD.md), [`MEMORY_SDD.md`](../MEMORY_SDD.md).  
**Law:** Five tabs. Pipeline owns arithmetic. Race / bag / manager truths labeled.
Projected finish never writes DynastyProcess keys.

---

## North star

A manager opens Chuckle and in **under 30 seconds** knows:

1. Where **they** are in this year’s race (place · proj · band)  
2. How **they** usually act (archetype + bag window)  
3. Whose capital is Early and **why** (origin seat)  
4. Who to ping tonight (≤3 Team Ideas with race tips)

This is the deepest dynasty *manager + team makeup* tool — not another KTC board.

---

## Three truths (never conflate)

| Truth | Book | Home surface |
| --- | --- | --- |
| **Race** | `projected-finish.json` | Calling-card race line · Projected finish door |
| **Bag** | analyzer + `seat-direction.json` | Race line “Bag …” · team home analyzer |
| **Manager** | `season-arcs` + `manager-archetypes` | Archetype on card · Season arcs / Manager type doors |

---

## Home IA (manager OS — overnight rework)

| # | Block | Content |
| --- | --- | --- |
| 1 | Calling card | Name · last-season place · **race hero** (proj · record · band · type · bag) |
| 2 | Capital strip | Your soonest-year firsts one line (band · slot · origin) · own-1st-sold tag |
| 3 | Chase pulse | Archetype chase tip · self Δplace · race movers (top 3) |
| 4 | Overnight | Letter (+ movers when tape moves) |
| 5 | Team Ideas ≤3 | Up before doors — race/archetype tip in meta |
| 6 | Top-4 doors | **Projected finish · Draft picks · Who has firsts · Season arcs** |
| 7 | Calc door | Unchanged — last |

Not on Home: bag totals, standings chrome, sixth tab, Votes tallies.

---

## Archetype formula (v2 — overnight)

Priority: `proxy → tank sculptor → reload_on_early → capital hoarder → slow burn → fast fade → bubble (mid only) → race favorite → balanced`.

**Bubble gate (tight):** `bubble_rate ≥ 0.6` **and** `proj ∈ [4,7]` **and** owns own first.  
Stops 7/10 Bubble mush.

**Cuckle week-6 result after rebuild:**

| Seat | Archetype |
| --- | --- |
| TrumanCooper | Proxy contender |
| ChiefGumby | Tank sculptor |
| Bubba / DarkWing | Reload on Early |
| ARae | Capital hoarder |
| TipsUp | Slow burn |
| bigjberg | Fast fade |
| KingHenry / SF / Ted | Race favorite |

---

## Persona briefs (week 6)

### Race favorites — KingHenry, Ted, SF
Need: title path real? Whose Early to buy? Who sells studs?  
Posture: buy players / sell Late capital.  
Insight: origin-seat band, not holder Mid.

### Capital hoarder — ARae
Mid race + Hard rebuild + 4 firsts.  
Need: stack map; Mid→Early origin swaps; don’t panic-tank while Mid.  
Insight: own Mid first ≠ Truman’s held Early.

### Slow burn — TipsUp
Win-now Mid, best climber.  
Need: playoff cut; don’t sell Bijan on .500 vibe.  
Insight: slow_burn_rate receipt.

### Fast fade — bigjberg
Mid + fade history.  
Need: buy/sell before week 8; get a first without gutting starters.  
Insight: fade rate vs bubble narrative.

### Reload on Early — Bubba, DarkWing
Early band + Reload bag.  
Need: flip studs to Late seats? Own Early locked?  
Insight: stud KTC ≠ seat race.

### Proxy contender — Truman
Doesn’t own own 1st; holds others’ Early; still competes.  
Need: Who has firsts with proxy tags; capital defense = competing.  
Insight: pure Chuckle — invisible on KTC.

### Tank sculptor — Chief
Aligned Early + Hard rebuild.  
Need: 1.01 lock; buyers up top; origin-sorted firsts.  
Insight: every win taxes their own Early.

---

## Workflows (manager OS)

1. **Morning open** — race hero → capital strip → chase pulse → Ideas → top-4  
2. **Chase Early** — capital strip / Who has firsts → Team Ideas tank tip → Calc  
3. **Defend proxy Early** — chase tip + firsts (own sold) → keep competing  
4. **Bubble check** — Season arcs climb/fade → Projected finish SoS → don’t overpay  
5. **Seat home dossier** — proj · type · bag · analyzer · marks (Phase D later)

---

## Datasets / formulas backlog

| Item | Status |
| --- | --- |
| Projected finish SoS book | Shipped |
| Season arcs (PF week-4) | Shipped |
| Archetype v2 gates | Shipped overnight |
| Home race pulse + intel top-4 | Shipped overnight |
| Team Ideas race tips | Shipped overnight |
| Capital strip + chase pulse + Ideas-up | Shipped overnight rework |
| Early shop bits (Late / race favorite) | Shipped — named 1.0x targets on empty capital + chase |
| Design Mode `?seat=` persona switcher | Shipped |
| Capital stack summary (hoarder) | Shipped |
| Tank 1.01 locked + Late buyers | Shipped |
| Slow-burn rate chase (no Early shop) | Shipped |
| `delta_place` movers when race moves | Wired; needs weekly refresh ≠0 |
| Injury lede on overnight | Shipped — starter Out/IR names when no trades |
| Manager dossier panel | Phase D |
| Matchup W-L week ranks (vs PF proxy) | Later if tape lands |
| Implied pick band on calc | Caption only; never value book |

---

## Success check

Each of 10 personas can open Design Mode Home and answer “where am I / what am I / who do I ping” without opening Menu. Bubble count ≤3. Proxy and tank labels unique and actionable.
