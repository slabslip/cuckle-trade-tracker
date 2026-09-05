# Ledger (bet slips)

Season-long (and shorter) bets between league members — stakes, odds, terms, and an
**accept / lock** handshake. Lives on the **Ledger** top tab.

**Go-live / buildout runbook:** [`LEDGER_BUILD_SDD.md`](LEDGER_BUILD_SDD.md)
(architecture + ordered Supabase / Shortcut steps).

Companion SQL: [`db/wave12-ledger.sql`](../db/wave12-ledger.sql) ·
[`db/wave13-ledger-visibility.sql`](../db/wave13-ledger-visibility.sql) ·
[`db/wave16-ledger-wager.sql`](../db/wave16-ledger-wager.sql)  
Ingest function: [`supabase/functions/ledger-ingest/index.ts`](../supabase/functions/ledger-ingest/index.ts)  
**Shortcut note (later):** [`LEDGER_NOTE_SDD.md`](LEDGER_NOTE_SDD.md)

### Nav

Top tabs: **`League | Teams | Ledger | History`**. League is far left (Latest trade).
There is no brand Home icon (`#goHome`); the centered league name returns to League.

---

## Product rules

1. **House sends a wager.** Ledger starts with **New wager**, not a note. Pick Them,
   house stake, a −500…0…+500 odds meter, description, and a clock, then **Send**.
   House = the first sender (`proposer` / `side_a`). They stay house when the other
   side counters. Shortcut “save the group text” is a later capture tool, not this tab.
2. **Them Accept / Counter / No.** Accept locks their side → both locks promote to
   `open`. No → `declined`. Counter revises stake / meter / description / clock and
   Sends back (`offer_rev` bumps; house lock clears). Database events stay
   `accepted` / `declined` / `countered`.
3. **Identity is Sleeper `user_id`.** Display names change; seats do not.
4. **Opinion only.** Ledger never feeds the trade meter, VA, lenses, or rankings.
5. **Tip Slip screenshot** is a product reference for information architecture, not a
   visual skin. Chuckle stays dark + gold.
6. **Own Ledger = my slips only.** The Ledger tab lists bets where you are a party —
   never a league-wide browse.
7. **Public by default.** `visibility` is `public` or `private` (default `public`).
   Either party may toggle anytime. Private slips are visible only to the two parties.
8. **Team home public ledger.** Another seat’s team page shows that seat’s **public**
   slips plus W/L money (taken from / lost to) and bets they lost. Private slips never
   appear there.
9. **Join / more exposure (v1.1 — planned).** On a locked **public** `open` bet, any
   other league member may request to take a side (pick side + stake). An existing
   party on the **opposite** side Accepts (takes more exposure) or Declines. Private
   bets stay two-party. Full design: [`plans/ledger_join_exposure.md`](plans/ledger_join_exposure.md).
10. **Negotiate until both lock.** Offers stay `proposed` until both parties accept
    the **same** `offer_rev`. Any counter resets the other side’s lock. Locked
    `open` slips are not edited (cancel only if already allowed; default: no edit
    after lock). Live preview is derived from stake + house American line
    (`house_odds`, Them is the opposite sign).
11. **Ledger badge.** Count of slips **sent to you** on the current version
    (amount > 0, your lock is false). Copy: “sent to you, you have not accepted
    this version.” Opening the tab does not clear it. Accept / No / they Cancel
    does. No `localStorage` seen-store.
12. **After the clock.** Settle actions stay hidden until `deadline_at` has passed.
    Each party picks I won / They won / Push (`side_a_claim` / `side_b_claim`).
    Matching claims → `winner` + `settled` and the fun W/L tab updates. Mismatch
    → slip stays `open` (disputed); every claimed seat votes on
    `ledger_settle_votes`; simple majority of votes cast sets official `winner`.
    Ties stay disputed. **Payout is off-app.** SMS and Shortcut stay later.

### Status machine

```
proposed → proposed      (Counter: offer_rev++, sender locked, other unlocked)
proposed → open          (both side_*_lock true)
proposed → declined      (counterparty No)
proposed → canceled      (proposer Cancel)
proposed → expired       (deadline_at passed while still proposed)
open → settled           (matching claims, or league-vote majority)
open → open (disputed)   (both claims present and different; league votes)
open → canceled          (admin void — future)
```

While `open`, pending **join requests** may accumulate; they do not change parent
`status` until Accept (leg added) or Decline/Cancel (request ends).

---

## Setup

### 1. Run SQL

1. Paste [`db/wave12-ledger.sql`](../db/wave12-ledger.sql) into the Supabase SQL Editor and **Run**.
2. Paste [`db/wave13-ledger-visibility.sql`](../db/wave13-ledger-visibility.sql) and **Run**
   (adds `visibility` + tightens SELECT RLS to party-or-public).
3. Paste [`db/wave16-ledger-wager.sql`](../db/wave16-ledger-wager.sql) and **Run**
   (`house_odds`, `offer_rev`, `ledger_settle_votes` + majority trigger). Wave15
   is only needed if leftover Shortcut drafts should stay insertable.

### 2. Deploy Edge Function `ledger-ingest`

1. Install Supabase CLI (or use Dashboard → Edge Functions).
2. Set secrets:
   - `LEDGER_INGEST_SECRET` — long random string shared with the iPhone Shortcut
   - `SUPABASE_SERVICE_ROLE_KEY` — already available to functions in hosted Supabase
3. Deploy `supabase/functions/ledger-ingest`.
4. Note the URL: `https://<project>.supabase.co/functions/v1/ledger-ingest`

### 3. iPhone Shortcut (capture-first)

Create a Shortcut (separate from the News share Shortcut). **Do not** ask for
amount, odds, deadline, or visibility on the phone. The group text is the proof;
money and wording are finished on Ledger (**Complete**).

1. Receive Text from Share Sheet (or Clipboard if run from the Home Screen).
2. Dictionary of league seats → Sleeper user ids.
3. Choose **Your side** and **Their side** (two taps).
4. **Get Contents of URL** — POST JSON.

**Headers**

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `apikey` | anon / public key |
| `Authorization` | `Bearer <same anon key>` |
| `x-ledger-secret` | same as `LEDGER_INGEST_SECRET` |

**Body (capture-first)**

```json
{
  "sleeper_league_id": "1315431339301806080",
  "submitted_by": "458342725222133760",
  "raw_text": "<shared group text>",
  "side_a_name": "458342725222133760",
  "side_b_name": "457784547094818816"
}
```

- `side_*` / `submitted_by` are Sleeper **user ids** (or canonical names
  `TrumanCooper`, `TipsUp`, …). Emoji team names do not resolve.
- `raw_text` is required. Stored as `source_text` + `terms`. `title` defaults to
  the first line. `amount_cents` defaults to `0` until Complete on the site.
- Optional extras (`title`, `amount`, `odds`, `deadline`, `visibility`) are still
  accepted if sent; the Shortcut should omit them.
- Idempotent: same league + sides + `raw_text` returns the existing `bet_id`
  (`deduped: true`).

**Success response**

```json
{ "ok": true, "bet_id": "…", "status": "proposed", "deduped": false }
```

Fast path: Copy the message → Home Screen **Chuckle Ledger** → two team taps.

---

## In-app Ledger tab

- Summary: total / open / settled / pending / next deadline (**your** slips only)
- Toolbar: **New wager** + **Refresh** (no league-wide All filter)
- Cards: title, house vs Them, stake, house line, description, status chip,
  Public/Private toggle, clock, actions
- Actions by role:
  - Unlocked party on `proposed`: **Accept** / **Counter** / **No**
  - Leftover $0 / Shortcut cards: **Complete** still available
  - Proposer on `proposed`: Cancel
  - Either party on `open` **after the clock**: I won / They won / Push (claims)
  - Mismatched claims: every claimed seat votes; majority sets the W/L tab
  - Either party: toggle `visibility` public ↔ private
- Design Mode seeds sample slips (including a past-clock dispute) so Ledger + team
  home are walkable without SQL.
- **v1.1:** second section **Open board** — public `open` slips you are not on, with
  **Join** (see below).
- Shortcut note capture stays later. This tab does not start with Add note.

## Team home public Ledger

On another seat’s team page (Teams → seat):

- **Taken money from** — settled public wins, summed by opponent
- **Lost money to** — settled public losses, summed by opponent
- **Bets lost** — those losing slips (title, opponent, amount)
- Public open + settled cards for that seat (read-only unless you are a party)
- **v1.1:** **Join** on public `open` cards when you are not already a party

---

## Join / more exposure (v1.1 — planned)

**Implementation SDD:** [`LEDGER_JOIN_SDD.md`](LEDGER_JOIN_SDD.md)  
Design archive: [`plans/ledger_join_exposure.md`](plans/ledger_join_exposure.md).

After both original parties lock (`open`) and the slip is **public**, any other
league member may:

1. Open the slip (Open board or team-home card).
2. Choose **side A or side B** and a stake (UI defaults to the original amount; editable).
3. Submit a **join request** (`pending`).

An existing locked party on the **opposite** side then **Accepts** (takes more
exposure — request becomes an accepted **leg**) or **Declines**. v1: first Accept
wins; one Accept is enough.

**Settlement:** parent settle (winner / push) applies to all accepted legs; W/L
money sums per leg. Parent `amount_cents` stays the original stake; **exposure
totals** = sum of accepted legs per side.

**Not joinable:** `private` slips, `proposed` / terminal statuses, or when you are
already a party on that parent.

---

## Shortcut note (later — not the dashboard start)

**Implementation SDD:** [`LEDGER_NOTE_SDD.md`](LEDGER_NOTE_SDD.md)  
**Archive:** [`plans/ledger_compose_and_alerts.md`](plans/ledger_compose_and_alerts.md).

The dashboard start path is **New wager**. A Shortcut that saves group text is a
later capture tool. It does not replace the house / meter / clock handshake.

- Draft note: `needs_review`, filer-only. Finish leftover $0 cards if they exist.
- SMS on Send and phone numbers stay later (v1.3).

---

## Edge cases (summary)

| Case | Behavior |
| --- | --- |
| Same person both sides | Reject |
| Unknown / ambiguous name | 422 needs_review |
| Duplicate Shortcut | Return existing bet_id |
| Accept when not a party | RLS deny |
| Double Accept | No-op |
| Deadline passed while proposed | `expired` (RPC + client) |
| Signed out | Read CTA; no Accept |
| Edit after both locked | v1: cancel + recreate |
| Join private / non-open slip | Reject (v1.1) |
| Join when already a party | Reject (v1.1) |
| Opposite side Declines join | Request `declined`; parent unchanged |
| Draft note / no Them yet | Filer only leftover; no badge (Shortcut later) |
| Send with $0, no Them, or no clock | Block |
| Claims before the clock | Hidden |
| Matching claims | `settled` + W/L tab |
| Mismatched claims | League vote; majority settles the tab |
| Vote tie | Stay disputed |
| SMS opened as the wrong seat | CTA; do not Accept (v1.3) |
| SMS with no phone on Them | Send still works; badge only (v1.3) |
| Duplicate Send | No second SMS (v1.3) |

---

## What is not in v1

- Tip Slip green/cream skin
- Commissioner Admin toggle / force-edit after open
- Separate `ledger_notes` table (use `ledger_bet_events` kind `note` later)
- Discord bot ingest
- Join / more exposure (**v1.1** — see above)
- Shortcut note capture + SMS on Send (**later**)
- Using phone numbers to pick Shortcut sides

---

## Planning history

Cursor plans (archived; this SDD is canonical):

- [`docs/plans/ledger_and_league_tab.md`](plans/ledger_and_league_tab.md) — League tab + Ledger v1 (shipped)
- [`docs/plans/ledger_privacy_views.md`](plans/ledger_privacy_views.md) — my slips, privacy, team public W/L (shipped)
- [`docs/plans/ledger_join_exposure.md`](plans/ledger_join_exposure.md) — join open bets / more exposure (**planned** v1.1)
- [`docs/plans/ledger_compose_and_alerts.md`](plans/ledger_compose_and_alerts.md) — Note → Finish → Send, badge, SMS (**planned** v1.2 / v1.3)
