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
  └─ DM each manager their code

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

---

## 2. Identity

| Concept | Store |
| --- | --- |
| App name | Chuckle Fantasy |
| App user | Supabase Auth + `app_profiles.username` |
| League | `leagues` (`sleeper_league_id`, optional `espn_league_id`, `created_by`) |
| Seat invite | `seat_invites` (code hash → `sleeper_user_id` + team name) |
| Membership | `league_memberships` after redeem |
| Vote identity | `seat_profiles` synced from membership |

---

## 3. APIs

Edge Function `join-league`:

| action | Who | Result |
| --- | --- | --- |
| `create` | Commissioner | Register league + mint invite codes (shown once) |
| `rotate_invites` | Commissioner | New codes for **unclaimed** seats |
| `list_invites` | Commissioner | Claimed/unclaimed status (no plaintext codes) |
| `redeem` | Member | Claim seat + membership |
| `preview` | Signed-in | Sleeper roster lookup |

SQL: [`db/multi-league-app.sql`](../db/multi-league-app.sql) + [`db/commissioner-invites.sql`](../db/commissioner-invites.sql).

---

## 4. Operator checklist

1. `db/phase1-seat-auth.sql` → `db/multi-league-app.sql` → `db/commissioner-invites.sql`
2. Auth Confirm email **OFF**; Site URL = app / custom domain
3. Deploy Edge Function `join-league`
4. Commissioner creates Cuckle → copy codes → DM managers
5. Managers create account → Redeem invite → dashboard
