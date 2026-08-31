# Multi-league app (WANT / HAVE bridge)

**Role:** How the product hosts **many Sleeper leagues** behind one app home.
Companion to [`PRODUCT.md`](PRODUCT.md). Vote identity still follows
[`VOTES_SDD.md`](VOTES_SDD.md). Domain cutover: [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md).

---

## 1. Product shape

```text
App home
  ├─ Create account (username + password)
  ├─ Sign in
  └─ My leagues
        ├─ Add league → Sleeper league ID → pick your team → join
        └─ Open league → dashboard (meter, trades, votes) for THAT league
```

One Auth account can belong to many leagues. Each league seat (`sleeper_user_id`)
can be claimed by **one** app account. The dashboard math (DynastyProcess, Value
Adjustment, boards) is the same infrastructure, parameterized by `sleeper_league_id`.

---

## 2. Identity

| Concept | Store |
| --- | --- |
| App user | Supabase Auth + `app_profiles.username` |
| Synthetic email | `{username}@users.cuckle.invalid` (Confirm email OFF) |
| League | `leagues.sleeper_league_id` |
| Seat claim | `league_memberships` (auth user ↔ league ↔ Sleeper user_id) |
| Vote identity | `seat_profiles` kept in sync from membership (Phase 1 RLS) |

Username is unique app-wide. Team name is the Sleeper display / team_name at join time.

---

## 3. Data layout

| Path | Role |
| --- | --- |
| `data/ui/*` | **Legacy Cuckle** path — still served; also the ready dataset for league `1315431339301806080` |
| `data/leagues/<id>/ui/*` | Preferred path for any league once synced |
| Page loader | Try `data/leagues/<id>/ui/…` first; fall back to `data/ui/…` for Cuckle |

New leagues start as `leagues.status = pending_sync` until the pipeline writes UI JSON.

---

## 4. Join flow (API)

Edge Function `join-league` (`supabase/functions/join-league`):

1. **preview** — Sleeper GET league + users + rosters → team list  
2. **join** — upsert `leagues`, insert `league_memberships`, seat_profiles trigger fires  

SQL: [`db/multi-league-app.sql`](../db/multi-league-app.sql).

---

## 5. Sync pipeline (per league)

```text
node sleeper-sync.mjs <league_id>
  → (next) write under data/leagues/<id>/ …
node draft-resolve.mjs / value-snapshot / revalue / … (parameterized)
```

**Cuckle** is seeded `status = ready` and keeps using the existing `data/ui` book.
**Other leagues:** first ship is join + membership + pending_sync banner; full meter
sync is the same scripts pointed at that league_id (tracked as ops work — first
manual sync, then Actions).

---

## 6. What is in / out for this ship

**In**

- App gate (create account / sign in)
- App home (my leagues + add league)
- Join by Sleeper league ID + pick team
- Username / password Auth
- Open Cuckle (or any `ready` league) into the existing dashboard
- Votes still require claimed seat (membership → seat_profiles)

**Out / later**

- Automatic full value rebuild for every new league on join (manual/Action first)
- App Store binary (PWA / custom domain is the phone app for now)
- Push notifications
- Billing

---

## 7. Operator checklist

1. Run `db/phase1-seat-auth.sql` (if not already) then `db/multi-league-app.sql`
2. Auth → Email → Confirm email **OFF**; Site URL = app origin / custom domain
3. Deploy Edge Function: `join-league`
4. Deploy page; open app home; create account; join `1315431339301806080` as your seat
5. For a second league: join by ID → run sync scripts for that ID → set `status = ready`
