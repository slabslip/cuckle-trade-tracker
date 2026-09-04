# Ledger (bet slips)

Season-long (and shorter) bets between league members — stakes, odds, terms, and an
**accept / lock** handshake. Lives on the **Ledger** top tab.

**Go-live / buildout runbook:** [`LEDGER_BUILD_SDD.md`](LEDGER_BUILD_SDD.md)
(architecture + ordered Supabase / Shortcut steps).

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
9. **Join / more exposure (v1.1 — planned).** On a locked **public** `open` bet, any
   other league member may request to take a side (pick side + stake). An existing
   party on the **opposite** side Accepts (takes more exposure) or Declines. Private
   bets stay two-party. Full design: [`plans/ledger_join_exposure.md`](plans/ledger_join_exposure.md).
10. **Add bet on Ledger (v1.2 — planned).** Signed-in claimed seat can compose a slip
    on the Ledger tab: two different league seats, title, amount, odds, optional
    deadline / visibility / source note. Proposer auto-locks. Same status machine as
    Shortcut. Full design: [`plans/ledger_compose_and_alerts.md`](plans/ledger_compose_and_alerts.md).
11. **Ledger bell (v1.2 — planned).** Unread = `proposed` slips where you are a party
    and your `side_*_lock` is false. Gold badge on the **Ledger** top tab. Opening
    Ledger (or Accept/Decline) clears that slip for you (`localStorage` v1; optional
    `ledger_bet_events` kind `seen` later).
12. **SMS Accept ping (v1.3 — planned).** Optional phone on the seat (Settings). After
    insert/Complete, text the counterparty a dashboard link that opens Ledger
    (`?tab=ledger`). Phone is notify-only — it does not choose Shortcut sides.
    Identity stays Sleeper `user_id`.

### Status machine

```
proposed → open          (both side_*_lock true)
proposed → declined      (counterparty Decline)
proposed → canceled      (proposer Cancel)
proposed → expired       (deadline_at passed)
open → settled           (party Settle with winner; accepted join legs settle with parent)
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
- Toolbar: **Refresh** (no league-wide All filter)
- Cards: title, parties, amount, odds, **quoted `source_text`** (group-text proof),
  status chip, Public/Private toggle, deadline, actions
- Actions by role:
  - Either party on `proposed`: **Complete** (title, amount, odds, deadline)
  - Counterparty on `proposed`: Accept / Decline (toast if amount is still `$0`)
  - Proposer on `proposed`: Cancel
  - Either party on `open`: Settle (I won / They won / Push)
  - Either party: toggle `visibility` public ↔ private
- Design Mode seeds sample slips (including settled public W/L) so Ledger + team home
  are walkable without SQL.
- **v1.1:** second section **Open board** — public `open` slips you are not on, with
  **Join** (see below).
- **v1.2:** **Add bet** control on this tab (not team home). Seat chips; cannot pick
  the same seat twice. JWT insert (`ledger_bets_insert_member`). List sorts “needs
  your accept” first. Bell on the Ledger tab.

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

## Add bet + Accept alerts (v1.2 / v1.3 — planned)

**Archive:** [`plans/ledger_compose_and_alerts.md`](plans/ledger_compose_and_alerts.md).

Shortcut capture (group text + two seats) stays the fast path. **Add bet** is the
other door when there is no message to share.

**v1.2 — compose + bell (no SMS)**

- **Add bet** on Ledger: pick two seats, title, amount, odds, optional deadline /
  visibility / paste of group text into `source_text`.
- Proposer auto-locks; counterparty Accepts. Complete still used for Shortcut `$0`
  rows.
- Badge on the Ledger top-tab when you have a proposed slip waiting on your lock.
- Deep link: persist `homeTab` as `?tab=ledger` so SMS (v1.3) and shares land here.

**v1.3 — phone + SMS**

- Optional `phone` on `league_memberships` (or Settings). Not required to file a bet.
- After insert/Complete, SMS the counterparty if they have a number: who proposed,
  title, link to `?tab=ledger`.
- No SMS until a number is saved. Vendor is an operator secret.

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
| Add bet same seat twice | Reject (v1.2) |
| Add bet signed out / no seat | CTA; no insert |
| SMS with no phone on seat | Skip send (v1.3) |

---

## What is not in v1

- Tip Slip green/cream skin
- Commissioner Admin toggle / force-edit after open
- Separate `ledger_notes` table (use `ledger_bet_events` kind `note` later)
- Discord bot ingest
- Join / more exposure (**v1.1** — see above)
- In-app **Add bet** + Ledger bell (**v1.2** — see above)
- Seat phone + SMS Accept ping (**v1.3** — see above)
- Using phone numbers to pick Shortcut sides (still two team taps)

---

## Planning history

Cursor plans (archived; this SDD is canonical):

- [`docs/plans/ledger_and_league_tab.md`](plans/ledger_and_league_tab.md) — League tab + Ledger v1 (shipped)
- [`docs/plans/ledger_privacy_views.md`](plans/ledger_privacy_views.md) — my slips, privacy, team public W/L (shipped)
- [`docs/plans/ledger_join_exposure.md`](plans/ledger_join_exposure.md) — join open bets / more exposure (**planned** v1.1)
- [`docs/plans/ledger_compose_and_alerts.md`](plans/ledger_compose_and_alerts.md) — Add bet, Ledger bell, SMS Accept ping (**planned** v1.2 / v1.3)
