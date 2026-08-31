# Custom domain (GoDaddy → GitHub Pages)

Chuckle Fantasy auth and the dashboard both work on whatever **origin** the
browser is on. A GoDaddy domain does not change the app code; it changes DNS,
GitHub Pages, and one Supabase Auth setting. Do this whenever you are ready —
before or after managers redeem invites.

Today the site is at:

`https://slabslip.github.io/cuckle-trade-tracker/`

After a custom domain it will be at the domain root, e.g.:

`https://yourdomain.com/`

Relative paths (`data/ui/members.json`, `data/leagues/<id>/ui/…`) keep working either way.

**PWA / “Add to Home Screen”:** after the custom domain is live, managers can install
the site as a home-screen web app from Safari/Chrome. A dedicated service worker and
web push are parked for a later slice — the domain cutover does not depend on them.

**ESPN history import** is also parked; optional `espn_league_id` on create is storage only.

---

## 1. How the pieces fit

```text
Phone browser
   │
   ├─ loads HTML/CSS/JS + data/leagues/<id>/ui/*.json (Cuckle also data/ui)
   │     from GitHub Pages (custom domain or github.io)
   │
   └─ auth / votes / invites
         to Supabase (Auth + REST + Edge) — same project URL either way
```

| Piece | Role with a custom domain |
| --- | --- |
| **GoDaddy DNS** | Points your domain at GitHub’s servers |
| **GitHub Pages** | Serves this repo; optional `CNAME` file pins the domain |
| **Supabase Auth** | Must list the new origin as an allowed Site / Redirect URL |
| **localStorage** | Bound to the **origin**. github.io sessions do **not** carry over to the custom domain — each manager signs in again on the new URL |

Supabase’s project URL (`*.supabase.co`) does not change. You do not move the
database when you add a domain.

---

## 2. GitHub Pages setup

1. Repo → **Settings → Pages**.
2. Under **Custom domain**, enter your domain (apex `yourdomain.com` and/or `www.yourdomain.com`).
3. Enable **Enforce HTTPS** once DNS has propagated (can take a few minutes to 48h).
4. GitHub will commit a `CNAME` file at the repo root with that hostname. Keep it on `main`.

If you prefer to commit it yourself before flipping DNS:

```text
yourdomain.com
```

One hostname per line is enough for the apex; add `www.yourdomain.com` if you
use www as canonical.

---

## 3. GoDaddy DNS

In GoDaddy → your domain → **DNS**:

### Option A — apex (`yourdomain.com`)

GitHub Pages A records (current; confirm in [GitHub’s docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) if they ever change):

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

Optional IPv6 AAAA records are listed in the same GitHub doc.

### Option B — `www` only

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `www` | `slabslip.github.io` |

Then set the GitHub custom domain to `www.yourdomain.com` and redirect apex → www
in GoDaddy if you want a single canonical host.

**Do not** CNAME the apex `@` to `slabslip.github.io` on GoDaddy unless GoDaddy’s
ALIAS/ANAME feature is what you intentionally use — many registrars break apex
CNAMEs. Prefer the A records above for apex.

Remove any old A/CNAME records that point elsewhere (parking pages, old hosts)
or they will fight GitHub.

---

## 4. Supabase Auth URLs (required for claim-seat)

Dashboard → **Authentication → URL Configuration**:

| Field | Set to |
| --- | --- |
| **Site URL** | Your canonical HTTPS origin, e.g. `https://yourdomain.com` |
| **Redirect URLs** | Include **both** during cutover: `https://yourdomain.com/**` and `https://slabslip.github.io/cuckle-trade-tracker/**` |

Phase 1 uses password grant (username + password), not OAuth redirects, but Site
URL still matters for Auth session validation. Keeping the github.io URL during
cutover avoids a weekend where old bookmarks cannot sign in.

Also confirm (**Authentication → Providers → Email**):

- **Confirm email** = **OFF** (account emails are synthetic `{username}@users.cuckle.invalid` and are never mailed).

---

## 5. Cutover checklist

1. DNS live; `https://yourdomain.com` serves this site (HTTPS green).
2. Supabase Site URL + Redirect URLs updated.
3. Open the **new** URL on your phone → sign in (or redeem invite if first time).
4. Cast a test vote; confirm the tally moves.
5. Tell the league the new link. Old github.io links can keep working if you leave
   that Redirect URL in place; remind them they must **sign in again** on the new
   domain (different origin = empty localStorage).
6. Optional later: stop advertising github.io once everyone has moved.
7. Optional: Add to Home Screen (PWA install). Web push stays later.

---

## 6. What you do *not* need

- No change to the anon key or project URL in `generate-page.mjs` for a domain alone.
- No GoDaddy “forwarding / masking” — use real DNS to GitHub, not a framed redirect.
- No App Store build for this cutover (PWA home-screen is enough for now).
- No IP allowlisting — identity is Auth + invite membership, not the network.

---

## 7. If sign-in works on github.io but fails on the new domain

1. Hard-refresh / clear site data for the new origin and try again.
2. Re-check Supabase Site URL matches the exact scheme + host (no trailing path).
3. Confirm HTTPS is enforced (mixed content or cert pending can break Auth fetch).
4. Confirm Email confirm is still off.
