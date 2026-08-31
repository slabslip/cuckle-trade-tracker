# Desktop checklist — Chuckle Fantasy go-live

Do these in order when you are at your machine with the Supabase dashboard and this repo open. PR: [#44](https://github.com/slabslip/cuckle-trade-tracker/pull/44) · branch `cursor/multi-league-app-878c`.

---

## 1. Pull the branch

```bash
git fetch origin
git checkout cursor/multi-league-app-878c
git pull origin cursor/multi-league-app-878c
```

---

## 2. Apply SQL (Supabase → SQL Editor)

Run **each file once**, top to bottom. Safe to re-run if a file says idempotent.

1. [`db/phase1-seat-auth.sql`](../db/phase1-seat-auth.sql)
2. [`db/multi-league-app.sql`](../db/multi-league-app.sql)
3. [`db/commissioner-invites.sql`](../db/commissioner-invites.sql)
4. [`db/wave1-invite-hardening.sql`](../db/wave1-invite-hardening.sql)
5. [`db/wave2-vote-identity.sql`](../db/wave2-vote-identity.sql)

Skip `seed-seat-auth.mjs` — it is retired.

---

## 3. Auth settings (Supabase → Authentication)

- **Providers → Email → Confirm email = OFF**
- **URL Configuration → Site URL** = your live app origin  
  (today: `https://slabslip.github.io/cuckle-trade-tracker` — later: custom domain per [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md))
- Add the same origin under **Redirect URLs** if prompted

---

## 4. Deploy the Edge Function

```bash
# from repo root, with Supabase CLI logged in to this project
supabase functions deploy join-league
```

Function source: [`supabase/functions/join-league/index.ts`](../supabase/functions/join-league/index.ts).

---

## 5. Dogfood Cuckle (prove the real path)

1. Open the app (Pages URL or local static serve of `index.html`).
2. **Create account** (commissioner) → **Create a league** with Sleeper ID  
   `1315431339301806080`
3. Copy the **CF-** invite codes → DM yourself / a second browser profile.
4. On the invite console: **Claim this seat** for your own team.
5. Second account: **Create account** → **Redeem invite** → dashboard opens.
6. Open a 2-team trade → cast a vote as that seat.

If create remints every time you revisit, Wave 1 SQL/function is not deployed yet.  
If votes fail after joining a second league later, Wave 2 SQL is missing.

---

## 6. Optional tonight

| Task | When |
| --- | --- |
| Merge PR #44 to `main` after dogfood looks good | After step 5 |
| `node build.mjs <other_league_id>` for a second league | When you want a non-Cuckle meter |
| Custom domain / PWA home screen | [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md) — anytime |
| ESPN import / web push | Parked — not needed for Cuckle |

---

## Reference

- Product shape: [`APP_SDD.md`](APP_SDD.md)
- Full Supabase walkthrough: [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) §8
- Votes identity: [`VOTES_SDD.md`](VOTES_SDD.md) §5.5
