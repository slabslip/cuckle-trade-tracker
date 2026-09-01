# Start here — Chuckle Fantasy (Cuckle tracker session repo)

**This repo is the product and the Cursor Cloud Agent session workspace.** Everything for
Chuckle Fantasy / CuckleChunckle lives in **https://github.com/slabslip/cuckle-trade-tracker**
— not SlabSlip, not another folder name. When docs say “session repo” or “Cuckle trade repo,”
they mean this repository.

| What | Where |
| --- | --- |
| **Repo** | `slabslip/cuckle-trade-tracker` |
| **Branch** | **`main`** (canonical — ignore old `cursor/*-878c` draft PRs unless you are reviving one) |
| **Live site** | https://slabslip.github.io/cuckle-trade-tracker/ |
| **Supabase** | https://gtqyvnkkjiksmmtmzubw.supabase.co |
| **Cuckle Sleeper league** | `1315431339301806080` |
| **Truman Cooper seat** | username `TrumanCooper`, Sleeper `458342725222133760` |

---

## Where is the code on your machine?

| Environment | Repo root | Do **not** use |
| --- | --- | --- |
| **Cursor Cloud Agent** | `/workspace` | `~/Documents/...`, `/path/to/...` |
| **Mac / PC clone** | wherever you cloned, e.g. `~/Documents/cuckle-trade-tracker` | literal `/path/to/cuckle-trade-tracker` |

```bash
# Always start in the repo root (folder that contains supabase/, db/, generate-page.mjs)
git checkout main
git pull origin main
```

---

## Go-live checklist (do in order)

Full click-by-click detail: [`DESKTOP_CHECKLIST.md`](DESKTOP_CHECKLIST.md).

### 1. Supabase SQL (seven files, in order)

Supabase dashboard → **SQL Editor** → paste each file from `db/` and **Run**:

1. `db/phase1-seat-auth.sql`
2. `db/multi-league-app.sql`
3. `db/commissioner-invites.sql`
4. `db/wave1-invite-hardening.sql`
5. `db/wave2-vote-identity.sql`
6. `db/wave2b-vote-unique.sql`
7. `db/wave5-invite-plain.sql`
8. `db/wave6-one-seat-redeem.sql`

Optional vote clean slate: `scripts/wipe-trade-votes.sql` → `truncate public.trade_votes ...`

### 2. Supabase Auth settings

Authentication → Providers → Email → **Confirm email OFF**

Authentication → URL Configuration:

- **Site URL:** `https://slabslip.github.io/cuckle-trade-tracker`
- **Redirect URLs:** `https://slabslip.github.io/cuckle-trade-tracker/**`

### 3. Deploy Edge Function `join-league`

From repo root:

```bash
# Cloud Agent (Linux) — no brew, no cd to Documents
cd /workspace
export SUPABASE_ACCESS_TOKEN='sbp_...'   # from https://supabase.com/dashboard/account/tokens
npx supabase login --token "$SUPABASE_ACCESS_TOKEN"
./scripts/deploy-join-league.sh
```

Mac (if you cloned locally):

```bash
cd ~/Documents/cuckle-trade-tracker   # your clone path
brew install supabase/tap/supabase    # one-time
supabase login
./scripts/deploy-join-league.sh
```

Confirm: Supabase → **Edge Functions** → **`join-league`**.

### 4. Dogfood

1. **Commissioner:** live URL → Create account → Create league `1315431339301806080` → copy **TrumanCooper** invite link
2. **Member (incognito / phone):** open `?invite=CF-…` → suggested username from team name → Create account → dashboard → Add to Home Screen

---

## Build / regenerate site (optional)

```bash
node generate-page.mjs && node verify-strategy.mjs
```

Full meter pipeline: see [`README.md`](../README.md).

---

## Specs (read when you need depth)

| Doc | Purpose |
| --- | --- |
| [`APP_SDD.md`](APP_SDD.md) | Accounts, invites, league home |
| [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) | Votes, news queue, RLS |
| [`PRODUCT.md`](PRODUCT.md) | Meter canon |
| [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md) | Own domain later |

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `cd: ... No such file` | Use `/workspace` (Cloud Agent) or your real clone path |
| `supabase: command not found` | `npx supabase` or `./scripts/deploy-join-league.sh` |
| `brew: command not found` | You are on Linux — skip brew, use `npx` |
| Signup “invalid email” | Fixed on `main` (`.invalid` domain); hard-refresh |
| Invite link missing team name | Redeploy `join-league` (includes `invite_preview`) |
| Old meter-only UI | Wrong URL or cache — use live Pages URL above |
