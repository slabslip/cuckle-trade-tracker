# CuckleChunckle — Product Canon (WANT)

**Role:** The single **want** source for this tracker. Spine, who “you” are, clocks, in/out, build order, CUT/PARKED.

**Not this file:** What the scripts actually emit today → [`ARCHITECTURE.md`](./ARCHITECTURE.md) (HAVE). How to price assets → [`VALUE_SDD.md`](./VALUE_SDD.md). How the dashboard must look → [`UI_SDD.md`](./UI_SDD.md). Unsettled calls → [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md).

**Repo:** `cuckle-trade-tracker` only. **Not** SlabSlip (`tradeslabs-web`). Superflex dynasty Sleeper league `1315431339301806080` (2019–2026 and onward).

**Values:** DynastyProcess Superflex (`value_2qb`) from GitHub `dynastyprocess/data`. GPL-3. Official Sleeper GETs for tape and drafts. No other price book.

---

## 1. Who the user is

Selecting a name is not “view as.” **You are that seat.** Every hero, bag, partner grade, and hop line is first-person for that `user_id`.

Identity on the wire: `?me=TipsUp` (canonical display name or Sleeper user id). Serve the folder over HTTP so `data/ui/me/*.json` can load. Pin names in `data/aliases.overrides.json`; a re-sync must not overwrite it.

---

## 2. Spine (the only story)

1. Pull the league’s completed trades and drafts from Sleeper.
2. Price each asset on DynastyProcess Superflex **as of a chosen clock**.
3. Needle = **you received − you gave up** on that clock.
4. Show **your** after-action score first (Home). League tape is the water cooler (League).
5. A pick that has been used is **the player it became**, unless the viewer asks for pick-at-accept.

That is the product. Style labels (Win-now / Investor / Balanced) describe bag mix. They **do not** move the needle.

---

## 3. Clocks (do not mix)

| Clock | Question it answers | On the needle? |
| --- | --- | --- |
| **Today** (default) | What is that bag worth **now**, became-player? | Yes — Home hero, trade row, Best/Worst “as of today” |
| **T0** (toggle: Pick at trade day) | What did they accept **that day** (pick still a pick)? | Yes — as a second lens, not a second hero |
| **Aged** | Today Δ − T0 Δ (how the deal moved after accept) | Yes — Best/Worst “aged”; caption on an open row when T0 exists |
| **First 3 years** | Mean of year-end (became-player) values in `[accept, accept+3y]`, with the activity floor | Yes — **third chip only**. Must not replace Today or T0. Must not become a second Home hero. |

Incomplete (a player/pick with no DP row) stays **listed** and stays **off** the needle. One-ways and FAAB-only never enter the meter.

---

## 4. In / out

**In**

- Completed Sleeper trades with at least two seats, each receiving a player or pick.
- Players and draft picks only.
- Hop tape for a pick (who held it, flip vs used).
- Rookie surplus (player today − pick cost on draft day) and a separate 2019 startup tab (player today; DP has no 2019 startup pick prices).
- Phone-first static page, existing CSS, no new packages.

**Out (CUT)**

- FAAB as a leg, a point, or a tape line.
- One-way deals (one seat gets players/picks; the other gets nothing or only FAAB).
- Browser-side Sleeper calls, login, live refresh.
- A third hero number that pretends to be “today.”
- Chart libraries, npm, Tailwind, new CSS systems.
- Applying the 300 activity floor to the **today** clock (Hill is 285 — still a real player).
- Letting Win-now / Investor change any delta.

**PARKED** (honest later, not now)

- Best/Worst (and `realized_per_trade`) on the 3-year clock — only after that lens is trusted.
- Weekly/monthly spark (full git density) instead of year-end + today.
- Peak-in-window, AUC, or “years above 300” as the **headline** over-time number.
- Flip P&L as the default over-time identity (hop tape already exists; do not merge it into the trade needle).
- Auto-publish / scheduled rebuild (cadence is an open question).

---

## 5. Build order

1. **Keep Today + T0 + hops + Best/Worst frozen.** Do not “fix” needle math in passing.
2. **Finish First 3 years as a chip** — compose with `MIN_ACTIVE` on **that** clock only; self-checks in `revalue.mjs` must keep passing (`y3 leaves realized_per_trade`, Zeke 3y ≠ leftover 3, no sub-300 positive 3y snap).
3. **Make the 3-year window readable** on the existing spark (caption + shade). No new chart stack.
4. Only then: decide Best/Worst / partner averages on 3y, denser dates, or a different aggregator (see `OPEN_QUESTIONS.md`).

---

## 6. Durable rules

- **Code wins for HAVE.** If this file and `ARCHITECTURE.md` disagree on what exists, ARCHITECTURE wins. If they disagree on what we want, this file wins.
- **One identity per number.** Became-player today, pick-at-T0, hop-local P&L, and 3-year mean are four stories. Never add them into one figure.
- **Incomplete ≠ zero.** No DP row → list it, drop it from the average / total.
- **2029 picks** price as the matching 2028 round until DP ships 2029 rows (`priced_as_2028`).
- **No silent Mid** on a slotted pick when Early/Late/slot exists; Mid is only the no-slot fallback and must flag `priced_as_mid`.
- **Drafter name in parentheses** is who **used** the pick, not who received it in this trade.
- **Zero-sum on complete 2-team** today-deltas. Partner per-trade numbers invert.
- **Ponytail:** rebuild pipeline, don’t add a web app. Mark ceilings with `ponytail:`.
