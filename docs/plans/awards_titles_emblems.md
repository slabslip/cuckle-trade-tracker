# Awards, titles, and emblems

**Status:** Wave 1 shipping — matched title↔emblem pairs + creative 15.
**Owner:** product + `build-cosmetics.mjs`
**Shipped now:** **124-id catalog (62 pairs)**. Barracks `?view=cosmetics` from Settings → Profile and Account.
Equip one title + one emblem. Every award unlocks **both** kinds (shared `pair` key). Paint the
equipped pair on **every** seat's team home; your emblem also paints on **your** seat name;
title shows on the barracks / Profile plate.
**This document:** review of the expanded award list (2026-09-06) and what we
adopt vs park. Pairing law updated 2026-09-07 — matched twins are intentional.

## Review verdict

The championship ladder is the part we take as law. Five titles is the mountain;
three (`three_time`, ARae) is already rare air. The Tier 1–4 grind and the
“fresh 15” weekly awards still wait on weekly/waiver tape. **Matched pairs** for
live awards (Three-Peat title + Three-Peat Seal emblem, etc.) and fifteen creative
pairs from existing title-path / traders / marks / picks tape **are live**.

Copy we may adopt later on live crown titles (not this pass): Champion;
Back-to-Back / Two-Time Champion; Dynasty Established (3); Dynasty Immortal (4);
God of the League / Eternal Champion (5).

## Adopted prestige law

Championship titles sit **above every other award**. Display and unlock copy
must treat them as the mountain, not as peer badges next to Waiver Touch.

**Hierarchy (highest first):**

| Rank | Catalog id (planned / live) | Emblem name (flavor) | Title (what we mint) | Rule |
| --- | --- | --- | --- | --- |
| 1 | `five_time` **(locked row)** | Five Crowns (`five_time_mark`) | Eternal Champion | 5 career championships. Biggest unlock in the system. |
| 2 | `four_time` **(locked row)** | Four Crowns | Dynasty Immortal | 4 career championships. |
| 3 | `three_time` **(live)** | Triple Crown | Dynasty Established | 3 career championships. **Current league ceiling (ARae).** Elite. |
| 4 | `repeat` **(live)** | Repeat Seal | Back-to-Back | 2 **consecutive** championships. |
| 5 | `two_time` **(live)** | Double Crown | Two-Time Champion | Exactly 2 career championships (not necessarily consecutive). |
| 6 | `champion` **(live)** | Champ Ring | Champion | 1 career championship. |

Also live, still **below** the career-count ladder:

- `three_peat` / `three_peat_mark` — three **in a row** (harder than `three_time` if the three are consecutive).
- Display: crown title + mark together, then finalist pairs, then remaining by rarity.

**Stacking (keep current rule):** higher champ titles **replace** lower ones for
the same seat (`two_time` does not also show `champion`). `repeat` can coexist
with `two_time` when the two titles were consecutive. Unlocking a rung grants
**both** the title and its `_mark` emblem.

**Locked until earned:** `four_time` and `five_time` ship in the catalog so the
mountain is visible. Nobody has 4. Unlock receipts stay empty until then.

## Matched pairs (law)

Every award is a **pair**: one `kind: title` and one `kind: emblem` sharing `pair`.
The same gate unlocks both. Equip still allows only one of each slot (pairs may mix).
Existing live ids keep their original id; twins use `_title` / `_mark` suffixes.

## Live catalog vs the new list

Already covered (keep; each has a twin):

| Proposal / vibe | Live pair | Title id / Emblem id |
| --- | --- | --- |
| Win 1 championship | `champion` | `champion` / `champion_mark` |
| Back-to-back | `repeat` | `repeat` / `repeat_mark` |
| Two-time | `two_time` | `two_time` / `two_time_mark` |
| Three-time / Dynasty Established | `three_time` | `three_time` / `three_time_mark` |
| Three in a row | `three_peat` | `three_peat` / `three_peat_mark` |
| Finish 1st in total points | `points_champ` | `points_champ_title` / `points_champ` |
| Win chip, not top points | `bracket_thief` | `bracket_thief_title` / `bracket_thief` |
| Championship game losses | `finalist` (+ 2/3) | `*_title` / live emblems |
| Last place | `last_place` | `last_place_title` / `last_place` |
| Opening lineup retention | `iron_core` | twin title / emblem |
| Career trades / extract | `volume`, `whale`, `extractor` | twins |
| Win-now / investor / firsts / playoff / quiet | matching pairs | twins |
| Draft hit / sit / bench / waiver / opening / founding | matching pairs | twins |

**Creative 15 (live from existing tape):** Blowout, Nail-Biter, Table Climber, Loyalty,
Scorched Earth, Pick Collector, Rookie Whisperer, Trade Cartel, Wire Throne, Pick Path,
Player Path, Aging Gracefully, Sold the Farm, Inaugural Champion, Perfect Chip — see
`docs/COSMETICS_SDD.md` §2.

**Ceiling copy:** treat `three_time` as elite in UI (subtitle, sort weight),
not as a mid-card next to Waiver Touch.

## Parked — need weekly / waiver / lineup tape

Most Tier 1–4 and original “fresh 15” weekly awards still wait on engines in
`PRODUCT.md` / `OPEN_QUESTIONS.md`. Do not guess from Sleeper transactions without
a written weekly snapshot.

### Tier 1–4 / remaining Fresh 15 (park)

(Unchanged — onboarding streaks, undefeated RS, injury navigator, etc.)

**Comeback Dynasty** (last → chip within 3 years) still needs multi-year place tape;
`prior.place` on title rows powers **Table Climber** meanwhile.

## Implementation order

1. **Wave 1** — barracks, crown copy, locked 4/5, finalist emblems.
2. **Matched pairs + creative 15** — shipped (88 ids).
3. **Week score bands** — full ladder from Planetary Disgrace to World Breaker. Unlocks from **regular-season** tape only (`week < playoff_week_start`). Playoff weeks stay on the tape for a later batch.
4. Art for twin marks / new emblems and remaining title banners.
5. Comeback Dynasty when multi-year last-place years exist.
6. Weekly Tier 1–4 after weekly snapshot engines.

## What we will not do

- Mint 50 onboarding emblems from missing weekly data.
- Let a grind emblem sort above `three_time` in barracks or on the nameplate.
- Unlock `five_time` as a joke / debug id.

## Docs

- Law: `docs/COSMETICS_SDD.md`
- Home door: `docs/plans/home_digest.md`
- Parked engines: `docs/PRODUCT.md`, `docs/OPEN_QUESTIONS.md`
