# Chuckle Fantasy — multi-league app

**Role:** How **Chuckle Fantasy** hosts many fantasy leagues behind one home.
Companion to [`PRODUCT.md`](PRODUCT.md). Votes: [`VOTES_SDD.md`](VOTES_SDD.md).
Domain: [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md).

---

## 1. Product shape (commissioner + invites)

```text
Commissioner
  ├─ Create account (username + password)
  ├─ Create a league → Sleeper league ID (+ optional ESPN league ID)
  ├─ App pulls roster from Sleeper → one invite code per team
  ├─ Invite console: DM codes, rotate unclaimed, claim own seat
  └─ Home lists leagues they created and seats they claimed

Member
  ├─ Create account (username + password only)
  ├─ Redeem invite code
  └─ Dashboard for that seat (team already bound on the invite)
```

**How we know which team is whose:** when the commissioner creates the league, Sleeper’s
public API returns each roster’s `user_id` + team name. Each invite is stored against that
`sleeper_user_id`. The member never types a Sleeper ID — the code *is* the seat.

**Sleeper credentials / OAuth:** Sleeper’s official API is **read-only and has no OAuth**.
Do **not** ask anyone for their Sleeper password (phishing / ToS). Per-seat invites are the
supported way to bind Chuckle Fantasy accounts to Sleeper seats.

**CuckleChunckle:** commissioner creates with league ID `1315431339301806080`, sends 10 codes.

**ESPN:** optional `espn_league_id` is stored for a later history import. First ship syncs Sleeper only.

---

## 2. Identity

| Concept | Store |
| --- | --- |
| App name | Chuckle Fantasy |
| App user | Supabase Auth + `app_profiles.username` |
| League | `leagues` (`sleeper_league_id`, optional `espn_league_id`, `created_by`) |
| Seat invite | `seat_invites` (code hash → `sleeper_user_id` + team name) |
| Membership | `league_memberships` after redeem / claim-seat |
| Vote identity | `league_memberships` for the ballot’s `sleeper_league_id` (not a global `seat_profiles` row) |

---

## 3. APIs

Edge Function `join-league`:

| action | Who | Result |
| --- | --- | --- |
| `create` | Commissioner | First time: register league + mint codes. Revisit: invite console status (no remint) |
| `rotate_invites` | Commissioner | New codes for **unclaimed** seats only |
| `list_invites` | Commissioner | Claimed/unclaimed status (no plaintext codes) |
| `redeem` | Member | Atomic claim seat + membership |
| `claim_seat` | Commissioner | Claim own unclaimed seat without typing the code |
| `preview` | Signed-in | Sleeper roster lookup |

SQL (apply in order):

1. [`db/phase1-seat-auth.sql`](../db/phase1-seat-auth.sql)
2. [`db/multi-league-app.sql`](../db/multi-league-app.sql)
3. [`db/commissioner-invites.sql`](../db/commissioner-invites.sql)
4. [`db/wave1-invite-hardening.sql`](../db/wave1-invite-hardening.sql)
5. [`db/wave2-vote-identity.sql`](../db/wave2-vote-identity.sql)

---

## 4. Meter data path

| Path | Role |
| --- | --- |
| `data/leagues/<id>/ui/*` | Per-league dashboard JSON |
| `data/leagues/<id>/raw/*` | Per-league build tape |
| `data/ui/*` | Legacy Cuckle dual-write (news + fallback) |
| Shared | `data/value_curve.json`, `data/players.nfl.json`, `data/ktc/`, `data/tx_cache/` |

```bash
node build.mjs <sleeper_league_id>   # writes scoped ui/raw; marks ready if service role set
node migrate-cuckle-ui.mjs           # one-time copy of legacy data/ui → scoped Cuckle ui
```

GitHub Action: [`.github/workflows/league-sync.yml`](../.github/workflows/league-sync.yml).

---

## 5. Operator checklist

**Start here at your desktop:** [`DESKTOP_CHECKLIST.md`](DESKTOP_CHECKLIST.md).

1. Apply SQL files in the order in §3
2. Auth Confirm email **OFF**; Site URL = app / custom domain
3. Deploy Edge Function `join-league`
4. Commissioner creates Cuckle → copy codes → DM managers → **Claim this seat** for their own team
5. Managers create account → Redeem invite → dashboard
6. Do **not** run `seed-seat-auth.mjs` (retired; use `--force-legacy` only for archaeology)

Username emails are synthetic: `{username}@users.cuckle.invalid`.
