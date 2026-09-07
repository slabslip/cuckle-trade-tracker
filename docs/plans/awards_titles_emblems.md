# Awards, titles, and emblems

**Status:** Wave 1 shipping — barracks sort + reserved 4/5 titles. Do not mint a 70-id catalog.
**Owner:** product + `build-cosmetics.mjs`
**Shipped now:** 29-id catalog. Barracks `?view=cosmetics` from Settings → Profile and Account.
Equip one title + one emblem. Paint the equipped pair on **every** seat's team home.
**This document:** review of the expanded award list (2026-09-06) and what we
adopt vs park.

## Review verdict

The championship ladder is the part we take as law. Five titles is the mountain;
three (`three_time`, ARae) is already rare air. The Tier 1–4 grind and the
“fresh 15” are a good long-term chase — **after** we have weekly matchups,
lineups, and waivers. Minting them from championship + trade JSON would be a
lie. Their Emblem + Title pairing is flavor for one catalog card, not two ids.

Copy we may adopt later on live crown titles (not this pass): Champion;
Back-to-Back / Two-Time Champion; Dynasty Established (3); Dynasty Immortal (4);
God of the League / Eternal Champion (5).

## Adopted prestige law

Championship titles sit **above every other award**. Display and unlock copy
must treat them as the mountain, not as peer badges next to Waiver Touch.

**Hierarchy (highest first):**

| Rank | Catalog id (planned / live) | Emblem name (flavor) | Title (what we mint) | Rule |
| --- | --- | --- | --- | --- |
| 1 | `five_time` **(locked row)** | Five-Time Champion | Eternal Champion | 5 career championships. Biggest unlock in the system. |
| 2 | `four_time` **(locked row)** | Four-Time Champion | Dynasty Immortal | 4 career championships. |
| 3 | `three_time` **(live)** | Three-Time Champion | Dynasty Established | 3 career championships. **Current league ceiling (ARae).** Elite. |
| 4 | `repeat` **(live)** | Repeat Champion | Back-to-Back | 2 **consecutive** championships. |
| 5 | `two_time` **(live)** | Repeat / Two-Time | Two-Time Champion | Exactly 2 career championships (not necessarily consecutive). |
| 6 | `champion` **(live)** | Dynasty Champion | Champion | 1 career championship. |

Also live, still **below** the career-count ladder:

- `three_peat` — three **in a row** (harder than `three_time` if the three are consecutive).
- Display: `five_time` → `four_time` → `three_peat` (if earned) → `three_time` → `repeat` → `two_time` → `champion`, then remaining titles/emblems by tier.

**Stacking (keep current rule):** higher champ titles **replace** lower ones for
the same seat (`two_time` does not also show `champion`). `repeat` can coexist
with `two_time` when the two titles were consecutive.

**Locked until earned:** `four_time` and `five_time` ship in the catalog so the
mountain is visible. Nobody has 4. Unlock receipts stay empty until then.

## Model mismatch (do not “fix” by pairing)

The proposal lists each award as **Emblem name + Title string**. Our law
(`COSMETICS_SDD.md`) is **one catalog id, one kind** — either a title *or* an
emblem. Equip one of each. The flavor name is the card heading; the short
string is `label`.

Championship rungs stay **`kind: title`**. New grind awards, when we add them,
are usually **`kind: emblem`** unless the copy is a name people wear
(“Offensive Juggernaut”). We will not create two ids per award.

## Live catalog vs the new list

Already covered (keep; do not duplicate):

| Proposal / vibe | Live id | Kind |
| --- | --- | --- |
| Win 1 championship | `champion` | title |
| Back-to-back | `repeat` | title |
| Two-time | `two_time` | title |
| Three-time / Dynasty Established | `three_time` | title |
| Three in a row | `three_peat` | title |
| Finish 1st in total points | `points_champ` | title |
| Win chip, not top-3 points | `bracket_thief` | title |
| Championship game | `finalist` | emblem |
| Two / three chip-game losses | `two_time_finalist` / `three_time_finalist` | emblem |
| Last place | `last_place` | title |
| Playoff seasons / compete seasons | `iron_core` | title |
| Career trades 8 / 15 / 30 | `volume`, `whale` | title |
| Extractor / win-now / investor / firsts | matching emblems | emblem |
| Playoff trades | `playoff_trader` | emblem |
| Quiet year / manners | matching emblems | emblem |
| Draft hit / sit right / bench crime | matching emblems | emblem |
| Waiver touch | `waiver_touch` | emblem |
| Opening day / founding draft | matching emblems | emblem |

**Ceiling copy:** treat `three_time` as elite in UI (subtitle, sort weight),
not as a mid-card next to Waiver Touch.

## Parked — need weekly / waiver / lineup tape

Most Tier 1–4 and “fresh” awards are real chase value. We **do not** unlock
them from championship + trade JSON alone. They wait on engines already
parked in `PRODUCT.md` / `OPEN_QUESTIONS.md` (matchup strip, waivers, legal
lineups).

Do not guess from Sleeper “transactions” without a written weekly snapshot.

### Tier 1 — onboarding (park)

First roster move, first waiver, first trade proposed/accepted, set lineup 4
straight weeks, score 100+ in a week, win a matchup, survive 6 weeks without
last, full season legal lineups, mid-season pickup 20+, 10 transactions in a
season.

### Tier 2 — contributor (park)

5 waivers / 3 trades in a season, 150+ week, win by 40+, legal lineups 2
seasons, 4 players 15+ same week, better record after week 8, waiver 200+
season, 3+ player/pick trade, 100+ in 8 weeks, make playoffs, 3 wins by ≤5,
5 original draft picks at season end, 8 career trades *(partially `volume`)*,
2 full seasons *(partially `iron_core`)*.

### Tier 3 — multi-season (park / partial)

15 career waivers, 15 career trades *(partially `volume`)*, 175+ week, same 5
players 3 seasons, playoffs in 3 seasons *(partially `iron_core`)*,
championship game *(`finalist`)*, 90+ every regular-season week, 7 original
picks productive year 2, last → playoffs next year, 1,800+ regular-season
points, 5 value-won trades, 4 full seasons, 8 players 15+ one week, 110+ in
12 weeks across two seasons, 3 career playoff wins.

### Tier 4 — elite (park / partial)

3 waiver pickups 250+ each, 30 career trades *(`whale`)*, same 4 players 5
seasons, playoffs in 5 seasons, chip game in 3 seasons, 2,000+ points,
6 original picks productive year 3, legal lineups 5 seasons, 7 full seasons,
win a championship **and** 35 other awards (meta — only after those 35 exist).

### Fresh 15 (park unless noted)

| Flavor emblem | Wearable title | Gate | Tape |
| --- | --- | --- | --- |
| Rookie Developer | Hit the Prospect | Rookie scores 200+ in year 1 or 2 | Draft class + seasonal points |
| Pick Collector | Future Assets | Hold 4+ future 1sts at once | Pick ledger (partially have) |
| Zero RB Survivor | Late Round Hero | Win a week starting 0 RBs drafted rounds 1–5 | Weekly starters + draft slots |
| Trade Rejector | Not Today | Reject 10 trade offers | Offer log (not on disk) |
| Boom or Bust | Volatile | Same player 30+ and &lt;5 in one season on roster | Weekly player scores |
| Schedule Master | Soft Landing | Win 4 straight vs that year’s bottom-4 points teams | Full-season standings + weekly winners |
| Injury Navigator | Next Man Up | Win a week after two top-6 drafted players ruled out | Injury + draft slot + result |
| Points Leader | Offensive Juggernaut | 1st in total points | **Have** → `points_champ` |
| Defense Wins Championships | Grit | Win chip, outside top 3 points | **Have** → `bracket_thief` |
| The Long Game | Patient Builder | Trade away WR1/RB1, still make playoffs | Positional rank + trades + playoffs |
| Unbeaten Streak | On Fire | 8 straight regular-season wins | Weekly matchups |
| Perfect Regular Season | Untouchable | Undefeated regular season | Weekly matchups |
| Comeback Dynasty | From the Depths | Last overall, chip within next 3 years | Season ranks + champs (champ + last we have; need year alignment) |
| Roster Continuity | Loyalty | Same QB, RB, WR started 4 straight seasons | Yearly starters |
| Waiver Throne | King of the Wire | Lead waiver claims 3 different seasons | Waiver engine |

**Comeback Dynasty** is the only fresh award we might compute soon from
existing `titles.json` (last place year + championship year ≤ +3). Still
write the rule in `build-cosmetics.mjs` before unlocking — do not ship from
this plan pass.

## Implementation order

1. **Wave 1 (this pass)** — barracks sort, crown copy (Back-to-Back, Dynasty
   Established, Dynasty Immortal, Eternal Champion), locked `four_time` /
   `five_time` rows. Catalog is **29** (added two- and three-time finalist emblems).
2. **Comeback Dynasty** — needs last-place *year* per seat, not only the
   latest `members.json` place-10. Do not guess from one season.
3. **Pick Collector** if future-1st counts are trustworthy on every seat.
4. Everything else waits on weekly snapshot + waiver/lineup engines.

## What we will not do

- Mint 50 onboarding emblems from missing weekly data.
- Give every award both an emblem id and a title id.
- Let a grind emblem sort above `three_time` in barracks or on the nameplate.
- Unlock `five_time` as a joke / debug id.

## Docs

- Law: `docs/COSMETICS_SDD.md`
- Home door: `docs/plans/home_digest.md`
- Parked engines: `docs/PRODUCT.md`, `docs/OPEN_QUESTIONS.md`
