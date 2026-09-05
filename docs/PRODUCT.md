# CuckleChunckle — Product Canon (WANT)

**Role:** The single **want** source for this tracker. Spine, who “you” are, clocks, in/out, build order, CUT/PARKED.

**Not this file:** What the scripts actually emit today → [`ARCHITECTURE.md`](./ARCHITECTURE.md) (HAVE). How to price assets → [`VALUE_SDD.md`](./VALUE_SDD.md). How the dashboard must look → [`UI_SDD.md`](./UI_SDD.md). Titles/emblems → [`COSMETICS_SDD.md`](./COSMETICS_SDD.md). Unsettled calls → [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md).

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
4. **Home** is the daily paper (News Feed peek + **Cuckle trade calculator**; signed-in **Your 3**
   notifications and **On your roster** news — no bag hero, no Recent Trade chip). **Teams** is
   first-person after a seat. Price a hypothetical on **`?view=calc`**. League tape stays the
   water cooler.
5. A pick that has been used is **the player it became**, unless the viewer asks for pick-at-accept.

That is the product. Style labels (Win-now / Investor / Balanced) describe bag mix. They **do not** move the needle.

---

## 3. Clocks (do not mix)

Five windows ship, chosen in one **Score as** dropdown. `Since trade` is the default.

| Clock | Question it answers | Price book |
| --- | --- | --- |
| **Since trade** (`all`, default) | Mean of year-end (became-player) values from accept through today | Flatten only |
| **At trade** (`t0`) | What did they accept **that day** (pick still a pick)? | Flatten only |
| **First 1 / 2 / 3 years** (`y1` `y2` `y3`) | Mean of year-end (became-player) values in `[accept, accept+Ny]`, with the activity floor | Flatten only |
| **Aged** | `all` Δ − `t0` Δ, how the deal moved after accept | Derived — both terms from the **same** book, never by subtracting two |

**All five windows are flatten-only.** Do not backfill KTC onto a clock that predates the
snapshot, and never average two clocks into one figure.

**The today blend is a sixth price, and it is not one of the five windows.** A trade's `even` bag
prices each leg as a **40/60 blend** of its flatten value and its KeepTradeCut Superflex value as
of `ktc_as_of`, and an asset that is **off the KTC Superflex board and off an NFL roster** prices
at **0**. That rule is the whole retirement test: a cheap rostered QB2 is not retired, and an
expensive stale row with no team and no KTC line is. The explicit `RETIRED_SLEEPER_IDS` set still
wins outright.

`even` is what the pipeline's own aggregates are built on. Trade rows still read `windows[lens]`,
so `sideOf()`’s `even` fallback never fires there. **The calculator is the first reachable screen
that renders `even`** (today book + VA). That closes the “no screen draws it” gap for a
hypothetical; it does **not** add a sixth Score-as clock. See `DASHBOARD_AUDIT.md` §8c / D5 for
the measured window-vs-blend gap. Until that is answered, **do not describe "Since trade" to a
user as a today price.**

**Reserved, not this pass:** league residual after a priced even deal, and a later vote-nudge
that may prompt an opinion on that deal. Votes still never enter the book.

Incomplete (a player/pick with no DP row) stays **listed** and stays **off** the needle. One-ways and FAAB-only never enter the meter.

**Value Adjustment** (rate 0.15, extras capped at 3, a late 4th counting 0.5) prices the stud-for-
quantity premium on a two-team swap. It is **0 on any trade with more than two seats**: an N-way
seat's `sent` bag does not correspond to any single other seat's `got` bag, so there is no
non-arbitrary attribution and no way to stay zero-sum. It is also 0 on an incomplete side.

---

## 4. In / out

**In**

- Completed Sleeper trades with at least two seats, each receiving a player or pick.
- Players and draft picks only.
- Hop tape for a pick (who held it, flip vs used).
- Rookie surplus (player today − pick cost on draft day) and a separate 2019 startup tab (player today; DP has no 2019 startup pick prices).
- Phone-first static page, existing CSS, no new packages.
- **Chuckle Fantasy multi-league app** — commissioner creates a league (Sleeper ID +
  optional ESPN ID), sends per-seat invites; members set username/password only.
  Spec: [`APP_SDD.md`](APP_SDD.md). Build today: [`DESKTOP_CHECKLIST.md`](DESKTOP_CHECKLIST.md).

**Out (CUT)**

- FAAB as a leg, a point, or a tape line.
- One-way deals (one seat gets players/picks; the other gets nothing or only FAAB).
- Browser-side Sleeper calls for the **meter** (join/preview via Edge Function is in).
- Live refresh of DynastyProcess from the phone.
- App Store / Play binaries and push notifications (PARKED — PWA / custom domain first).
- A third hero number that pretends to be “today.”
- Chart libraries, npm, Tailwind, new CSS systems.
- Applying the 300 activity floor to the **today** clock (Hill is 285 — still a real player).
- Letting Win-now / Investor change any delta.

**Removed by user decision — do not re-propose**

- **Best 10 / Worst 10.** Removed once, restored by an agent on the audit's recommendation,
  removed again on sight. `Most lopsided trades` on league home is the permanent replacement.
- **The league screen entirely.** `renderLeague()` and the `Traders` / `Drafters` lists it still
  held went on a second ruling. There is no `league` view.
- **`realized_*`.** The stored `realized_total` / `realized_per_trade` described a book no longer
  in the file — up to ~37,000 off, with sign flips on four seats. Deleted rather than repaired.

**PARKED** (honest later, not now)

- Weekly/monthly spark (full git density) instead of year-end + today.
- Peak-in-window, AUC, or “years above 300” as the **headline** over-time number.
- Flip P&L as the default over-time identity (hop tape already exists; do not merge it into the trade needle).
- Auto-publish / scheduled rebuild for every newly joined league (manual/Action sync first).
- PWA install prompt + web push.
- Native App Store / Play wrappers.
- League residual on the calc book; accept-odds / suggested counter; public/private marketplace.
- Equipped title/emblem painted on names (header, news, trade cards, ledger, smack).
- League Oracle, waiver hot sheet, lineup-vs-optimal, playoff-odds engine, push “3 actions today”.

---

## 5. Build order

`node build.mjs` is the whole rebuild and it is the only rebuild:
`sleeper-sync` → `draft-resolve` → `value-snapshot` → `revalue` → `title-path` →
`apply-value-adjust` → `build-cuffs` → `build-calculator` → `build-cosmetics` →
`generate-page`.

Home digest + calc + barracks archive: [`plans/home_digest.md`](plans/home_digest.md).
Titles/emblems law: [`COSMETICS_SDD.md`](COSMETICS_SDD.md).

`apply-value-adjust.mjs` is not optional. It owns the today blend, the Value Adjustment, the trade
boards and `marks.json`, so a build without it ships the flatten-only book. `title-path.mjs` writes
`titles.json`. Both were missing from the list, which is why `titles.json.as_of` and `league.today`
could disagree in production.

Standing checks after any change to the book, over all ten seats:

1. Every side's `today` equals `sum(priced legs) + value_adjust`, and `today_delta` equals
   `today − sent_today`.
2. Stored Value Adjustment matches a fresh `value-adjust.mjs` recompute; stored today values match
   a fresh `price-today.mjs` recompute.
3. Zero-sum on the 288 complete two-team trades **and** on the 2 N-way trades.
4. The generator's inline `applyVa` agrees numerically with `value-adjust.mjs` on every side —
   read it out of `index.html`, not out of `generate-page.mjs`, or a template literal that swallows
   a regex backslash will pass a check it should fail.
5. No NaN, no Infinity, and the self-checks in `apply-value-adjust.mjs` pass.

---

## 6. Durable rules

- **Code wins for HAVE.** If this file and `ARCHITECTURE.md` disagree on what exists, ARCHITECTURE wins. If they disagree on what we want, this file wins.
- **One identity per number.** Became-player today, pick-at-T0, hop-local P&L, and 3-year mean are four stories. Never add them into one figure.
- **Incomplete ≠ zero.** No DP row → list it, drop it from the average / total.
- **2029 picks** price as the matching 2028 round until DP ships 2029 rows (`priced_as_2028`).
- **No silent Mid** on a slotted pick when Early/Late/slot exists; Mid is only the no-slot fallback and must flag `priced_as_mid`.
- **Drafter name in parentheses** is who **used** the pick, not who received it in this trade.
- **Zero-sum on complete 2-team** today-deltas. Partner per-trade numbers invert.
- **Value Adjustment is 0 on N-way trades.** Zero-sum needs `sum(gotVA) == sum(sentVA)` across
  seats, and with three bags there is no non-arbitrary attribution.
- **Pipeline owns all arithmetic; the browser only formats.** One helper per number. If a figure
  is computed in two places it will disagree in production — the home tile and the Partners tab
  did, on 20 of 82 graded partners.
- **Ponytail:** rebuild pipeline, don’t add a web app. Mark ceilings with `ponytail:`.
