# League memory — proof law

**Role:** The dashboard’s second job after the needle. League members remember
seasons, seats, and trades wrong. Chuckle is the receipt they can open and text.

Companion: needle / clocks [`PRODUCT.md`](PRODUCT.md). Trade open row + hop tape
[`UI_SDD.md`](UI_SDD.md). Aged math [`VALUE_SDD.md`](VALUE_SDD.md). Data desks
[`DATA_SDD.md`](DATA_SDD.md). Store five-tab law [`STORE_LAW.md`](STORE_LAW.md).

This file is **WANT**. If the generator disagrees, the generator is behind — fix
the page in the same pass as any UI that claims to be proof.

---

## 1. The argument we exist to settle

Sleeper’s trade log is bags of names. People fill the rest from ego.

Typical lies (all first-person, all common):

- “We have always been a playoff team.”
- “That CMC trade was a smash.” / “I got robbed.”
- “That 2022 first became nothing.” (it became the player — or it was flipped)
- “I never sell picks.” (hop tape says otherwise)

The product answer is not a lecture and not a Best 10 board. It is a **small
tile they can tap, read in one breath, and send in the group text.**

The user sentence we are building for:

> That’s not how I remember it. Look.

Votes, news, and Ledger are opinion. They may *start* the argument. They may
not write the receipt.

---

## 2. Three proof objects (only these)

| Object | Question | HAVE today | WANT |
|--------|----------|------------|------|
| **Trade age** | What did they accept, and how did it move? | Open trade: bags, clocks, spark; `aged = all − t0` (one flatten book) | One digest tile + **Share proof** (text first, picture optional) |
| **Pick journey** | Who held it, who used it, who is the player? | Pick leg hop tape: date · from → to · sold / used / held | Same tape as a tile + share. Became-player stays the needle; hop P&L stays on the tape ([`PRODUCT.md`](PRODUCT.md) §6 — do not merge) |
| **Seat / season tape** | How good has this seat actually been? | Past Champions, place on Teams, Most lopsided, Data Lists | Tiles: titles won, last-season place, lopsided receipts. First-year / redraft stay empty — no fake crowns ([`FORMAT_BOOKS.md`](FORMAT_BOOKS.md)) |

Do **not** add a fourth object (luck, H2H, “team grade,” career Win-now). Those
are new lies.

---

## 3. Tile law

A proof tile is **one claim, one clock, one share.**

Must fit 390px without a chart library:

1. **Who** — seat names (first-person when `me` is set).
2. **When** — accept date or hop date, season if it is a title.
3. **What** — headline legs or pick label (became-player if used).
4. **The number that settles it** — signed delta on the named clock, or
   `aged`, or one hop result (sold / used / held). Not two clocks added.
5. **Share** — copies a short receipt into the OS share sheet / Messages.

Banned on a proof tile:

- Bag totals as a Home hero
- Best 10 / Worst 10 (Most lopsided is the list; a tile may deep-link one row)
- Vote tallies, news pokes, Ledger stakes
- A second clock averaged into the first

Tiles live **inside** History / Data and the open trade / pick row. They are
not a sixth league-bar destination. They are not the old 6–12 encyclopedia
put back on Moves ([`DATA_SDD.md`](DATA_SDD.md) §2).

---

## 4. Share law (text is the product)

The group chat is the courtroom. A PNG is optional garnish.

**Text receipt (must ship first)** — plain lines, no HTML, no “exactly like”
in generated JS. Shape:

```text
Cuckle · since trade
TipsUp vs Truman · 2022-09-14
You received: …
You gave up: …
Δ +184 · aged −58 (all − t0, flatten)
cuckle.app/…  (or Pages URL with ?tx= / ?pick=)
```

Calc already shares a **priced hypothetical** as a picture
([`UI_SDD.md`](UI_SDD.md) §3b). That is a proposal. Proof share is a
**completed** Sleeper fact plus the book. Do not reuse the calc card as the
memory receipt — different job, different numbers (today blend + VA vs
flatten clocks).

Deep links: `?tx=<transaction_id>` and `?pick=<asset_key>` open the same
tile on another phone. Origin stays the live Pages / custom domain
([`STORE_LAW.md`](STORE_LAW.md)). Changing origin still wipes sessions.

---

## 5. Where it sits (do not grow the bar)

| Surface | Proof job |
|---------|-----------|
| **Home** | No personal bag hero. Trade Desk / calc stay *today’s* deal. A proof tile does not remount News. |
| **Teams** | Seat place + titles already argue “historically good.” Keep; add share on the calling card later, not first. |
| **History / Data** | Home of proof tiles: lopsided, aged movers, pick journeys, Past Champions. Cold load may lead with a **Receipts** strip (3 tiles) above Moves/League — still one Data cell. |
| **Open trade** | Already the long receipt. Add Share proof. |
| **Pick hop** | Already the journey. Add Share proof. |

No + FAB. No sixth pill. No SwiftUI port of this.

---

## 6. Portability

Proof that is only Cuckle’s tape is a private scrapbook. A second Sleeper
league must see **their** trades, hops, and titles after `league-sync`.
A 2026 startup with three trades gets three tiles, not a broken seven-year
path. Wrong format book (1QB scored as Superflex) is a false memory — worse
than no app.

---

## 7. Do today (refine, do not rewrite)

Order is load-bearing. Stop after the first item that is not true in
production.

1. **Their book exists.** `GITHUB_PAT` on `join-league`, one non-Cuckle
   commissioner pastes an ID, Action reaches `ready`, History shows *that*
   tape. Without this, every proof tile is Cuckle fanfic.
2. **Share the two journeys we already compute.** Open-trade Share proof
   (aged + named clock) and hop-tape Share proof (text). No new rooms.
   Deep link `?tx=` / `?pick=` so the text is checkable.
3. **Three Receipts tiles on History** — one aged smash or bust, one pick
   that moved, one title / place. Tap = existing detail. Share = §4.
4. **Then** TestFlight week for the ten Cuckle seats, using receipts in the
   group text as the habit test.

Park until 1–3 are live: more news voice, Ledger v1.1, cosmetics on every
byline, extra Data desks, weekly spark as the headline, flip P&L merged
into the needle.
