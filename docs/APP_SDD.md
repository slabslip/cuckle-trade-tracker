# Chuckle Fantasy — multi-league app

**Role:** How **Chuckle Fantasy** hosts many fantasy leagues behind one home.
Companion to [`PRODUCT.md`](PRODUCT.md). Vote identity: [`VOTES_SDD.md`](VOTES_SDD.md).
Domain: [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md).

---

## 1. Product shape

```text
Get started
  ├─ Sleeper user ID and/or ESPN user ID (at least one required)
  ├─ Username + password
  └─ Your leagues
        ├─ Add league → Sleeper league ID → seat matched from Sleeper user ID
        └─ Open league → dashboard for THAT league
```

**CuckleChunckle:** each manager enters league ID `1315431339301806080`, uses the
account they created with their Sleeper user ID, and opens the meter.

One Auth account can belong to many leagues. Each league seat (`sleeper_user_id`)
can be claimed by **one** app account.

---

## 2. Identity

| Concept | Store |
| --- | --- |
| App name | Chuckle Fantasy |
| App user | Supabase Auth + `app_profiles.username` |
| Platform IDs | `app_profiles.sleeper_user_id` and/or `espn_user_id` (≥1 required) |
| Synthetic email | `{username}@users.cuckle.invalid` (Confirm email OFF) |
| League | `leagues.sleeper_league_id` |
| Seat claim | `league_memberships` (matched from Sleeper user ID when present) |
| Vote identity | `seat_profiles` synced from membership |

ESPN ID is stored for managers who moved from ESPN→Sleeper (or still have ESPN
history). Seat matching on Sleeper leagues uses the Sleeper user ID.

---

## 3. Data layout

| Path | Role |
| --- | --- |
| `data/ui/*` | Legacy **CuckleChunckle** ready dataset |
| `data/leagues/<id>/ui/*` | Preferred path once a league is synced |
| Page loader | Try league-scoped first; fall back to `data/ui` for Cuckle |

---

## 4. Join flow (API)

Edge Function `join-league`:

1. **preview** — Sleeper GET → team list; UI auto-selects the caller's Sleeper user ID  
2. **join** — upsert `leagues`, insert `league_memberships`

SQL: [`db/multi-league-app.sql`](../db/multi-league-app.sql).

---

## 5. Operator checklist

1. `db/phase1-seat-auth.sql` then `db/multi-league-app.sql`
2. Auth → Email → Confirm email **OFF**; Site URL = app / custom domain
3. Deploy `join-league` Edge Function
4. Managers: Get started → Sleeper user ID + username/password → Add league `1315431339301806080`
