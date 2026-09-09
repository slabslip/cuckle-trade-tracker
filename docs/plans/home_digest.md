# Home digest — hybrid Home, calc, barracks

**Status:** Shipped — first tab **Home**, signed-in Alerts (notifications only), signed-in
**Trade Desk** (one to three first-person talks: Fill / Move / Even), 2-team calculator on
the today / `even` book, titles/emblems + barracks.

Canonical product rules: [`docs/UI_SDD.md`](../UI_SDD.md) §1–3c, [`docs/VALUE_SDD.md`](../VALUE_SDD.md) §12,
[`docs/COSMETICS_SDD.md`](../COSMETICS_SDD.md), [`docs/PRODUCT.md`](../PRODUCT.md),
[`docs/plans/awards_titles_emblems.md`](./awards_titles_emblems.md).

This file is the archive of the Home digest working paper. Law lives in `docs/`. Older artifact
plans stay as history; do not paste them here.

---

## Locked for this pass

- Five bottom cells, one row: **Home | Teams | News | Ledger | Menu**. No sixth tab. No `#goHome` icon.
  Menu opens a glass popover (Calculator / League Data / Settings). League Data is the research
  homebase (internal tab id `history`). News is Alerts + the feed.
- First tab label **Home**. `homeTab` stores `"home"`; `"league"` is an alias.
- Hybrid Home: league water cooler on top (**Cuckle trade calculator**).
  Signed-in **Trade Desk** (talks for your bag from
  the four-source today book into the calculator — not a second copy of the league peek;
  omit when signed out; never other-other pairs).
  No bag hero. No Recent Trade chip on
  Home — the vote notification lives on the News tab.
- Alerts live on News (omit when signed out; blank reserved slot when signed in with nothing waiting):
  Ledger involving you; an uncast vote on the deal on this page. Do not fill with the
  calculator or a news teaser.
- Calculator is `?view=calc`, not a tab. 2-team, rostered players + still-held picks, today /
  `even` (flatten + KTC + FantasyCalc + DynastyDealer) + `calcReceiveTotals` / `applyVa`.
  Trade Desk even talks use the same receive+VA totals. Votes never enter the number.
- League leftover (percent of league capital) and a vote-nudge (opens the existing vote
  sheet; opinion only) ship on the calculator after a priced 2-team deal.
- Barracks `?view=cosmetics`: 29 shared titles/emblems, unlock from history, equip 1 + 1.
  Championship ladder is the top of the catalog (see awards plan). Your emblem paints on your
  seat name; title flex across every byline is later.
- Existing CSS tokens only. Votes stay opinion-only.

## Parked (own later pass)

Oracle, waiver AI, playoff-odds, marketplace + accept odds, decision journal, push,
Flutter rewrite, cosmetics painted on names, Manager DNA chat, weekly/waiver grind awards
(see [`awards_titles_emblems.md`](./awards_titles_emblems.md)).
