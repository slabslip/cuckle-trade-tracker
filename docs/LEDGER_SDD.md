# Ledger (bet slips)

Season-long (and shorter) bets between league members — stakes, odds, terms, and an
**accept / lock** handshake. Lives on the **Ledger** top tab.

Companion SQL: [`db/wave12-ledger.sql`](../db/wave12-ledger.sql) ·
[`db/wave13-ledger-visibility.sql`](../db/wave13-ledger-visibility.sql)  
Ingest function: [`supabase/functions/ledger-ingest/index.ts`](../supabase/functions/ledger-ingest/index.ts)

### Nav

Top tabs: **`League | Teams | Ledger | History`**. League is far left (Latest trade).
There is no brand Home icon (`#goHome`); the centered league name returns to League.

---

## Product rules

1. **Proposer auto-locks.** When a slip is created (Shortcut or in-app), the proposer’s
   side is already locked.
2. **Counterparty Accept or Decline.** The other party must Accept (locks their side →
   status `open`) or Decline (terminal `declined`).
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

### Status machine

```
proposed → open          (both side_*_lock true)
proposed → declined      (counterparty Decline)
proposed → canceled      (proposer Cancel)
proposed → expired       (deadline_at passed)
open → settled           (party Settle with winner)
open → canceled          (admin void — future)
```

---

## Setup

### 1. Run SQL

1. Paste [`db/wave12-ledger.sql`](../db/wave12-ledger.sql) into the Supabase SQL Editor and **Run**.
2. Paste [`db/wave13-ledger-visibility.sql`](../db/wave13-ledger-visibility.sql) and **Run**
   (adds `visibility` + tightens SELECT RLS to party-or-public).

### 2. Deploy Edge Function `ledger-ingest`

1. Install Supabase CLI (or use Dashboard → Edge Functions).
2. Set secrets:
   - `LEDGER_INGEST_SECRET` — long random string shared with the iPhone Shortcut
   - `SUPABASE_SERVICE_ROLE_KEY` — already available to functions in hosted Supabase
3. Deploy `supabase/functions/ledger-ingest`.
4. Note the URL: `https://<project>.supabase.co/functions/v1/ledger-ingest`

### 3. iPhone Shortcut

Create a Shortcut (separate from the News share Shortcut):

1. **Receive** Text (or Share Sheet from Messages).
2. Optional Ask for: title, amount (number), odds, side A name, side B name, deadline.
3. **Get Contents of URL** — POST JSON to the function URL.

**Headers**

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `x-ledger-secret` | same as `LEDGER_INGEST_SECRET` |
| `Authorization` | `Bearer <anon key>` (Supabase gateway often wants apikey/anon) |

**Body (v1)**

```json
{
  "sleeper_league_id": "1315431339301806080",
  "submitted_by": "TrumanCooper",
  "raw_text": "Truman vs Sam — Stribling SF WR1 — $100 even — ends Dec 18, 2026",
  "title": "Stribling will finish the season as SF WR1",
  "amount": 100,
  "odds": "even",
  "side_a_name": "Truman",
  "side_b_name": "Sam",
  "deadline": "2026-12-18",
  "visibility": "public"
}
```

- `amount` is **dollars** (stored as cents). Or send `amount_cents`.
- `visibility` is optional (`public` default; `private` hides from non-parties).
- Names resolve against `league_memberships.team_name` (normalized). Ambiguous → HTTP 422
  `needs_review` — do not invent a seat.
- Idempotent: same league + parties + amount + title + odds hash returns the existing
  `bet_id` (`deduped: true`).

**Success response**

```json
{ "ok": true, "bet_id": "…", "status": "proposed", "deduped": false }
```

Show that in a Shortcut notification: “Slip proposed — waiting on Sam.”

---

## In-app Ledger tab

- Summary: total / open / settled / pending / next deadline (**your** slips only)
- Toolbar: **Refresh** (no league-wide All filter)
- Cards: title, parties, amount, odds, terms, status chip, Public/Private toggle,
  deadline, actions
- Actions by role:
  - Counterparty on `proposed`: Accept / Decline
  - Proposer on `proposed`: Cancel
  - Either party on `open`: Settle (I won / They won / Push)
  - Either party: toggle `visibility` public ↔ private
- Design Mode seeds sample slips (including settled public W/L) so Ledger + team home
  are walkable without SQL.

## Team home public Ledger

On another seat’s team page (Teams → seat):

- **Taken money from** — settled public wins, summed by opponent
- **Lost money to** — settled public losses, summed by opponent
- **Bets lost** — those losing slips (title, opponent, amount)
- Public open + settled cards for that seat (read-only unless you are a party)

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

---

## What is not in v1

- Tip Slip green/cream skin
- In-app “compose bet” form (Shortcut is the capture path)
- Commissioner Admin toggle / force-edit after open
- Separate `ledger_notes` table (use `ledger_bet_events` kind `note` later)
- Discord bot ingest

---

## Planning history

Shipped Cursor plans (archived; this SDD is canonical):

- [`docs/plans/ledger_and_league_tab.md`](plans/ledger_and_league_tab.md) — League tab + Ledger v1
- [`docs/plans/ledger_privacy_views.md`](plans/ledger_privacy_views.md) — my slips, privacy, team public W/L
