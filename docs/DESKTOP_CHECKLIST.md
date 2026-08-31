# Build Chuckle Fantasy today

Ordered path for **this session at your desktop**. Spec: [`APP_SDD.md`](APP_SDD.md).  
PR [#44](https://github.com/slabslip/cuckle-trade-tracker/pull/44) · branch `cursor/multi-league-app-878c`.

The app code is already on the branch. Today you **wire Supabase + prove the flow**.

---

## Step 0 — Open the right tools (5 min)

1. Laptop with browser tabs: **GitHub** (this repo) · **Supabase** project dashboard · optional **Terminal**.
2. Have the **service_role** key handy only if you use the CLI to deploy (never commit it).
3. Cuckle Sleeper league ID (copy-paste ready):

```text
1315431339301806080
```

---

## Step 1 — Get the code

```bash
cd /path/to/cuckle-trade-tracker
git fetch origin
git checkout cursor/multi-league-app-878c
git pull origin cursor/multi-league-app-878c
```

Skim [`APP_SDD.md`](APP_SDD.md) §§2–3 if you want the shape fresh; then come back here.

---

## Step 2 — Apply SQL (Supabase → SQL → New query)

Paste and **Run** each file **in order**. Wait for success before the next.

| # | File |
| --- | --- |
| 1 | `db/phase1-seat-auth.sql` |
| 2 | `db/multi-league-app.sql` |
| 3 | `db/commissioner-invites.sql` |
| 4 | `db/wave1-invite-hardening.sql` |
| 5 | `db/wave2-vote-identity.sql` |

**Do not** run `node seed-seat-auth.mjs`.

---

## Step 3 — Auth settings (Authentication)

1. **Providers → Email → Confirm email = OFF**
2. **URL Configuration → Site URL** =

```text
https://slabslip.github.io/cuckle-trade-tracker
```

3. Add that URL under **Redirect URLs** if the UI asks for it.

(Custom domain later → [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md).)

---

## Step 4 — Deploy Edge Function

From the repo root (Supabase CLI logged into this project):

```bash
supabase functions deploy join-league
```

Source: `supabase/functions/join-league/index.ts`.

If you have not used the CLI on this machine: install/login once (`supabase login` + `supabase link`), then deploy.

---

## Step 5 — Ship the page (if Pages is still on old main)

Either:

- **Merge PR #44 → `main`** so GitHub Pages serves the new shell, **or**
- Locally: `python3 -m http.server 8766` from the repo root and open `http://localhost:8766`.

You need the **new** `index.html` (Chuckle Fantasy gate / create / redeem), not the old single-league-only boot.

---

## Step 6 — Dogfood (the real product test)

### 6a. Commissioner

1. Open the app → **Create account** (pick a username + password ≥ 6).
2. **Create a league** → paste `1315431339301806080` → Create & generate invites.
3. **Invite console:** copy each `CF-` code somewhere private (Notes / password manager).
4. Click **Claim this seat** on **your** team.
5. **Open dashboard** → confirm the meter loads and Teams is your seat.

### 6b. Member (second browser or private window)

1. **Create account** (different username).
2. **Redeem invite** → paste one unused `CF-` code → Join.
3. Confirm dashboard opens as that team.
4. Open a **2-team trade** → cast a vote → tally moves.

### 6c. Idempotent create check

1. Sign back in as commissioner → Create a league → same ID again.
2. Expect invite console **without new codes** (status / hidden). Remint only via **Rotate unclaimed**.

---

## Step 7 — Done for today when…

- [ ] All five SQL files ran without error  
- [ ] `join-league` is deployed  
- [ ] Confirm email is OFF  
- [ ] Commissioner claimed a seat and sees the meter  
- [ ] Second account redeemed and voted  
- [ ] Re-create same league does **not** silently remint  

Then: merge #44 if not already, DM real managers their codes, and stop.

---

## If something breaks

| Symptom | Fix |
| --- | --- |
| Signup says confirm email / no session | Confirm email OFF; hard-refresh |
| Create league 401 / function error | Redeploy `join-league`; check JWT session |
| Create remints every time | Wave 1 SQL + latest function not live |
| Redeem “unknown function” / 500 | Run `wave1-invite-hardening.sql` |
| Vote write fails | Run `wave2-vote-identity.sql`; must have membership |
| Dashboard empty for Cuckle | Pages still on old build, or wrong origin; Cuckle should use `data/ui` fallback |
| “Already has a commissioner” | Someone else already set `created_by` — use that account or fix row in SQL |

---

## Not today (parked)

- Second Sleeper league full meter (`node build.mjs <id>` + Action)  
- Custom domain / PWA  
- ESPN import  
- Smack-agent voice bank / Sleeper chat scrape (**won’t do**)  

---

## Reference

| Doc | Use |
| --- | --- |
| [`APP_SDD.md`](APP_SDD.md) | Full app path spec |
| [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) §8 | Longer Supabase notes |
| [`VOTES_SDD.md`](VOTES_SDD.md) §5.5 | Vote identity |
| [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md) | After go-live |
