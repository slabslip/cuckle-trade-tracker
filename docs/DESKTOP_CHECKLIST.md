# Build Chuckle Fantasy today — exact clicks

**Start here:** [`START_HERE.md`](START_HERE.md) — repo paths, Cloud Agent vs Mac, go-live order.

Spec: [`APP_SDD.md`](APP_SDD.md).  
Repo: **https://github.com/slabslip/cuckle-trade-tracker** (the Cuckle trade repo)  
Branch: **`main`** (live on GitHub Pages)  
Supabase project URL: **https://gtqyvnkkjiksmmtmzubw.supabase.co**  
Live site: **https://slabslip.github.io/cuckle-trade-tracker/**

The app code is already on the branch. Today you wire Supabase and prove the flow.

Cuckle Sleeper league ID (keep handy):

```text
1315431339301806080
```

---

## Step 1 — Pull `main` (repo root)

**Where:** Terminal at the **Cuckle trade repo root** — the folder with `supabase/`, `db/`, `generate-page.mjs`.

| Environment | Command |
| --- | --- |
| **Cursor Cloud Agent** | Already at `/workspace` — skip `cd` |
| **Mac / PC** | `cd ~/Documents/cuckle-trade-tracker` (your clone path) |

```bash
git fetch origin
git checkout main
git pull origin main
```

**Check it worked:**

```bash
git branch --show-current
# must print: main

ls db/wave1-invite-hardening.sql db/wave2-vote-identity.sql db/wave2b-vote-unique.sql db/wave5-invite-plain.sql supabase/functions/join-league/index.ts
# all five paths must exist
```

Optional repo self-check (no Supabase login required):

```bash
node generate-page.mjs && node verify-strategy.mjs
```

You are **not** pasting branch code into Supabase. The branch lives on GitHub / your disk. Supabase only gets the **SQL files** and the **Edge Function deploy** below.

---

## Step 2 — Paste SQL into Supabase (seven times)

**Where to open Supabase**

1. Browser → go to **https://supabase.com/dashboard**
2. Sign in
3. Open the project that matches **`gtqyvnkkjiksmmtmzubw`**  
   (Project Settings → API → Project URL should be `https://gtqyvnkkjiksmmtmzubw.supabase.co`)
4. Left sidebar → **SQL Editor**
5. Click **New query** (or “+”)

**Where the SQL text comes from**

On your computer, open each file **from the repo you just pulled**, in order.  
In Finder/Cursor they are under:

```text
cuckle-trade-tracker/db/
```

| Order | Open this file on disk | What to do |
| --- | --- | --- |
| 1 | `db/phase1-seat-auth.sql` | Select all → Copy |
| 2 | `db/multi-league-app.sql` | Select all → Copy |
| 3 | `db/commissioner-invites.sql` | Select all → Copy |
| 4 | `db/wave1-invite-hardening.sql` | Select all → Copy |
| 5 | `db/wave2-vote-identity.sql` | Select all → Copy |
| 6 | `db/wave2b-vote-unique.sql` | Select all → Copy (league-scoped vote uniqueness) |
| 7 | `db/wave5-invite-plain.sql` | Select all → Copy (unclaimed codes stay visible in console) |

**For each file:**

1. In Supabase SQL Editor → **New query** (fresh editor is safest)
2. Click in the big SQL text box
3. **Paste** the whole file
4. Click **Run** (bottom right / green play)
5. Wait until it says success (or “Success. No rows returned”)
6. Only then do the next file

**Do not** paste `seed-seat-auth.mjs` anywhere. Do not run that script.

If a file errors mid-way: stop and fix before continuing (screenshot the error). Most of these are idempotent and safe to re-run after a fix.

---

## Step 3 — Auth settings (same Supabase project)

Still in **https://supabase.com/dashboard** → your project:

### 3a. Turn off email confirm

1. Left sidebar → **Authentication**
2. Click **Providers** (or **Sign In / Providers**)
3. Open **Email**
4. Set **Confirm email** to **OFF**
5. Save if there is a Save button

### 3b. Site URL

1. Still under **Authentication**
2. Click **URL Configuration** (sometimes under “Settings”)
3. **Site URL** — paste exactly:

```text
https://slabslip.github.io/cuckle-trade-tracker
```

4. Under **Redirect URLs**, add the same URL if the list is empty or missing it:

```text
https://slabslip.github.io/cuckle-trade-tracker/**
```

5. Save

---

## Step 4 — Deploy the Edge Function from your Terminal

**Where:** same Terminal, same repo folder as Step 1  
**What gets deployed:** file on disk  
`supabase/functions/join-league/index.ts`  
→ Supabase hosted function named **`join-league`**

### 4a. One-time CLI setup (skip if already done)

```bash
# Install (pick one):
# macOS:   brew install supabase/tap/supabase
# Linux:   curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz && mv supabase ~/.local/bin/
# Any OS:  npx supabase --version   # no global install needed

supabase --version   # or: npx supabase --version

supabase login
# browser opens → authorize
# (Cloud Agent / CI: export SUPABASE_ACCESS_TOKEN from https://supabase.com/dashboard/account/tokens)

# Repo root — where supabase/functions/ lives (see START_HERE for your environment)
# Cloud Agent: already at /workspace
# Mac / PC:     cd ~/Documents/cuckle-trade-tracker   # your clone path
supabase link --project-ref gtqyvnkkjiksmmtmzubw
# if asked for DB password, use the one from Supabase → Project Settings → Database
```

### 4b. Deploy

```bash
# Cloud Agent: cd /workspace   |   Mac: cd ~/Documents/cuckle-trade-tracker
./scripts/deploy-join-league.sh
# or manually:
# supabase functions deploy join-league --project-ref gtqyvnkkjiksmmtmzubw
```

**Check it worked:** Supabase dashboard → left sidebar → **Edge Functions** → you should see **`join-league`**.

---

## Step 5 — Open the new Chuckle Fantasy page

You need the **new** `index.html` from this branch (gate / Create league / Redeem), not an old build.

### Option A — Local (fastest to test)

**Where:** Terminal, repo root:

```bash
# Cloud Agent: cd /workspace   |   Mac: cd ~/Documents/cuckle-trade-tracker
python3 -m http.server 8766
```

**Where to open in browser:**

```text
http://localhost:8766
```

Leave the Terminal running while you test.

### Option B — GitHub Pages (live URL)

Open **https://slabslip.github.io/cuckle-trade-tracker/** (already deployed from `main`).

(You can dogfood on localhost first, then merge.)

---

## Step 6 — Dogfood as commissioner

**Where:** the app URL from Step 5 (`localhost:8766` or Pages).

1. You should see **Chuckle Fantasy** → **Create account**
2. Enter a **username** and **password** (password at least 6 characters) → Create account
3. On **Your leagues** → click **Create a league**
4. In **Sleeper league ID**, paste:

```text
1315431339301806080
```

5. ESPN field: leave blank  
6. Click **Create & generate invites**
7. You land on **Invite console** with `CF-XXXX-XXXX` codes  
8. **Copy invite link** (or each `CF-` code) and DM it — do **not** save the CF- code as the
   account password. Managers pick their own username + password on the link.  
9. Find **your** team row → click **Claim this seat**  
10. Click **Open dashboard**  
11. Confirm the trade meter loads and Teams is your seat  

---

## Step 7 — Dogfood as a member

**Where:** a **different** browser profile or a **Private / Incognito** window (so you are not still signed in as commissioner).

1. Open an **invite link** from Step 6 (preferred), or the app URL + **Redeem invite**  
2. Confirm the page says the CF- code is a **seat ticket, not your password**  
3. **Create account** with a **username** and a **new password** (not the CF- code)  
4. You should land in that team’s dashboard (link path redeems automatically)  
5. If you used Redeem by hand: paste an unused `CF-` code → **Join & open dashboard**  
6. Confirm you are that team  
7. Open any **2-team trade** → tap a side to **vote** → tally should move  

---

## Step 8 — Prove create does not remint

**Where:** back in the commissioner session (normal browser).

1. Go **← Leagues** / Your leagues  
2. Click **Create a league** again  
3. Paste the same ID `1315431339301806080`  
4. Submit  

**Expected:** Invite console opens with status / hidden codes — **not** a brand-new set of codes.  
New codes only appear after **Rotate unclaimed**.  
For a **claimed** seat (manager left), use **Reissue for new manager** — that clears the old membership and shows one fresh code.  
**Transfer admin** (bottom of invite console) moves commissioner to another member who already redeemed.

---

## Done when all of these are true

- [ ] Terminal is on branch `main`
- [ ] All **seven** SQL files ran in Supabase SQL Editor (through `wave5-invite-plain.sql`)
- [ ] Confirm email is **OFF**; Site URL set
- [ ] Edge Functions list shows **`join-league`**
- [ ] Commissioner claimed a seat and sees the meter
- [ ] Second account redeemed and voted
- [ ] Re-create same league does **not** silently remint

Then: DM real managers their **invite links** (or CF- codes). Remind them the code is a
seat ticket — they still choose their own username and password. Stop for today.

---

## If something breaks

| What you see | Where to fix |
| --- | --- |
| `supabase: command not found` | Install CLI (Step 4a) or use `npx supabase`; or run `./scripts/deploy-join-league.sh` |
| `cd: ... No such file` | Cloud Agent: `/workspace`. Mac: your clone path, e.g. `~/Documents/cuckle-trade-tracker` |
| Deploy asks for access token | Run `supabase login` or `export SUPABASE_ACCESS_TOKEN=sbp_...` |
| Signup fails / “confirm email” | Supabase → Authentication → Providers → Email → Confirm OFF |
| Create league 401 / failed fetch | Redeploy Step 4; hard-refresh app; sign out/in |
| Create remints every time | Re-run `db/wave1-invite-hardening.sql`; redeploy `join-league` |
| Redeem 500 / unknown function | Re-run `db/wave1-invite-hardening.sql` |
| Vote does not save | Re-run `db/wave2-vote-identity.sql`; confirm that account redeemed a seat |
| Old page with no Create league | Hard-refresh; confirm URL is https://slabslip.github.io/cuckle-trade-tracker/ |
| “Already has a commissioner” | That league’s `created_by` is already set — use that Auth user |

---

## Not today

Second-league `node build.mjs`, custom domain, ESPN import, chat scrape.
