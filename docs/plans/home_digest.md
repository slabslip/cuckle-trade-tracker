# Home digest — hybrid Home, calc, barracks

**Status:** Shipped — first tab **Home**, signed-in Your 3 (notifications only), signed-in
**On your roster** news, 2-team calculator on the today / `even` book, 25 titles/emblems + barracks.

Canonical product rules: [`docs/UI_SDD.md`](../UI_SDD.md) §1–3c, [`docs/VALUE_SDD.md`](../VALUE_SDD.md) §12,
[`docs/COSMETICS_SDD.md`](../COSMETICS_SDD.md), [`docs/PRODUCT.md`](../PRODUCT.md).

This file is the archive of the Home digest working paper. Law lives in `docs/`. Older artifact
plans stay as history; do not paste them here.

---

## Locked for this pass

- Four top tabs, one row: **Home | Teams | Ledger | History**. No fifth tab. No `#goHome` icon.
- First tab label **Home**. `homeTab` stores `"home"`; `"league"` is an alias.
- Hybrid Home: league water cooler on top (one Recent Trade + **Price a deal** + existing News
  Feed peek). Signed-in **Your 3** (wager / vote only) and **On your roster** (team-tagged
  feed hits, not a second copy of the league peek). No bag hero.
- Your 3 (omit when signed out; blank reserved slot when signed in with nothing waiting):
  Ledger involving you; an uncast vote on the deal on this page. Do not fill with the
  calculator or a news teaser.
- Calculator is `?view=calc`, not a tab. 2-team, rostered players + still-held picks, today /
  `even` (flatten + 40/60 KTC) + `applyVa`. Votes never enter the number.
- Residual + reserved vote-nudge are specified in VALUE / VOTES / PRODUCT — not built.
- Barracks `?view=cosmetics`: 25 shared titles/emblems, unlock from history, equip 1 + 1.
  Flex across the app is later.
- Existing CSS tokens only. Votes stay opinion-only.

## Parked (own later pass)

Oracle, waiver AI, playoff-odds, marketplace + accept odds, decision journal, push,
Flutter rewrite, cosmetics painted on names, Manager DNA chat.
