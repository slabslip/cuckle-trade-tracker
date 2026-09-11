# Format books — any Sleeper league

Chuckle prices a league from **that league’s Sleeper roster and scoring**, not from Cuckle’s
Superflex dynasty defaults. Detection lives in [`lib.mjs`](../lib.mjs) `detectLeagueFormat()`.
The meter, calculator, and Score-as clocks read `league.json.format` written by `revalue.mjs`.

Companion: [`STORE_LAW.md`](STORE_LAW.md) (store shell), [`VALUE_SDD.md`](VALUE_SDD.md) (needle).

---

## 1. What Sleeper tells us

| Signal | Source | Result |
|--------|--------|--------|
| Superflex / 2QB | `roster_positions` contains `SUPER_FLEX`, or two `QB` slots | `format_key` / `book` = `2qb` → DynastyProcess `value_2qb` |
| 1QB | one QB slot, no SUPER_FLEX | `1qb` → `value_1qb` (`data/value_curve_1qb.json`) |
| TEP | `rec_te` or `bonus_rec_te` **greater than** `rec` | `tep: true` (flag only — does not invent a third needle) |
| Dynasty | `settings.type === 2` | five clocks: Date of Trade, 1 / 2 / 3 seasons, as of today |
| Keeper | `settings.type === 1` | same clocks as dynasty |
| Redraft | `settings.type === 0` | Date of Trade + as of today only |
| N-team | `settings.num_teams` / roster count | Teams lists every seat. No 10-manager UI cap. |

Cuckle (`1315431339301806080`) is Superflex dynasty, 10 seats, PPR without TEP. That is one
shape, not the product law.

---

## 2. First-year and thin tape

A 2026 startup (or any league without a prior Sleeper season) still gets:

- meter + calculator + cuffs + Data on the book that exists
- Teams for every roster
- empty **Past Champions** (no fake crowns, no Cuckle title path)
- empty **Titles and Emblems** until *this* tape unlocks them
- News only from shares tagged with that `sleeper_league_id` (wave 21)

It must look **new**, not like a broken Cuckle.

---

## 3. How a second league arrives

1. Commissioner pastes a Sleeper ID in Create a league.
2. `join-league` GETs rosters and, when `GITHUB_PAT` is set, POSTs
   `repository_dispatch` `league-sync`.
3. [`.github/workflows/league-sync.yml`](../.github/workflows/league-sync.yml) runs
   `node build.mjs <id>` (generate-page is no longer Cuckle-only).
4. `mark-league-ready.mjs` flips `ready` when the service role key is present.

Laptop fallback: `node build.mjs <sleeper_league_id>`.

Dogfood (no operator laptop required for the assertion):

```bash
node scripts/test-league-format.mjs
node scripts/dogfood-league-format.mjs
```

The dogfood script GETs Cuckle, a 12-team Superflex dynasty (`1313051744942428160`), and
Sleeper’s public 1QB redraft (`289646328504385536`). It does not write a second meter book
into `data/` (that is the Action / `build.mjs` job).

---

## 4. What we will not do

- Silently score a 1QB league on Cuckle’s Superflex curve.
- Copy Cuckle flair, Truman-only news admin, or a seven-year Champions Path onto a startup.
- Merge TEP, votes, or Ledger into the needle.
