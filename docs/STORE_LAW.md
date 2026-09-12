# Chuckle Fantasy — Store law

Locked rules for the App Store / TestFlight binary. The web app on GitHub Pages
stays the product. The native shell is a signed window onto that origin.

Companion: [`STORE_OPS.md`](STORE_OPS.md) (human account / DNS / SQL),
[`STORE_GATE.md`](STORE_GATE.md) (device pass), [`PRODUCT.md`](PRODUCT.md),
[`UI_SDD.md`](UI_SDD.md), [`APP_SDD.md`](APP_SDD.md).

---

## 1. One product, two doors

| Door | Origin | Who |
|------|--------|-----|
| Safari / PWA | Pages or custom domain | Dogfood, Add to Home Screen |
| Store shell | Same HTTPS origin + `?store=1` | TestFlight / App Review |

The binary does **not** bundle `index.html`, Design Mode pages, or a second nav.
It loads:

`https://slabslip.github.io/cuckle-trade-tracker/?store=1`

(or the custom domain once [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md) is live).

`localStorage` is origin-bound. Changing the origin signs everyone out.

---

## 2. Five destinations only

League bar is **Home | Teams | News | Ledger | Menu**. No sixth destination.
No + FAB. No personal bag totals on Home.

Store copy may relabel Ledger slips (see §5). It may not add rooms.

---

## 3. Service worker

[`sw.js`](../sw.js) is **network-only for HTML**. Never cache `index.html`,
`preview.html`, or Design Mode documents. A stale document in a WKWebView looks
like a broken App Store build.

Bump `CACHE` + `DATA_V` on every UI ship that the store shell will see.

---

## 4. Design Mode stays out of the binary

The shell User-Agent is `ChuckleStore/1`. It refuses to open:

- `?design=`
- `design-league-home.html`
- `design-league-home-frame.html`
- `iphone-preview.html`
- `preview.html`

Agents still use those URLs in Chrome. Reviewers never should.

---

## 5. Ledger is honor-system in the store

Payouts are off-app. App Review can still read dollar stakes + “wager” as
gambling.

When `isStoreShell()` is true (`?store=1`, session flag, or `ChuckleStore/` UA):

- Visible copy says **side bet** / **slip**, not wager.
- Caption states: honor system among league members; **no money moves in the app**.
- Do not add IAP, Apple Pay, or in-app balances.

Safari / PWA without `?store=1` keeps the existing Ledger words.

---

## 6. What the shell may not do

- Rewrite Home / Teams / News / Ledger / Menu in SwiftUI.
- Collect Sleeper passwords or invent Sleeper OAuth ([`APP_SDD.md`](APP_SDD.md) §1).
- Merge votes, news, or Ledger into the trade needle.
- Ship a second data pipeline. Pages + `build.mjs` remain the book.

---

## 7. After Cuckle is in TestFlight

Any Sleeper league (dynasty, keeper, redraft; 1QB / Superflex / TEP) pastes an
ID, syncs, and uses this same dashboard on **their** tape — including proof
tiles they can text when someone remembers a deal or a season wrong
([`MEMORY_SDD.md`](MEMORY_SDD.md)). Format books and empty first-year states
are the portability work — not a new app.
