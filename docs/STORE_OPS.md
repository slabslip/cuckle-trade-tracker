# Chuckle Fantasy — Store ops (human)

In-repo files are ready. These steps need **your** Apple, DNS, and Supabase
logins. The Cloud Agent cannot hold those.

Law: [`STORE_LAW.md`](STORE_LAW.md). Domain: [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md).
SQL order: [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) + [`DESKTOP_CHECKLIST.md`](DESKTOP_CHECKLIST.md).

---

## 1. Custom domain + Auth origin

Do this **before** pointing TestFlight at a new host. github.io sessions do not
carry over.

1. GitHub repo → Settings → Pages → custom domain (or keep github.io for the
   first TestFlight).
2. GoDaddy (or registrar): A / CNAME as in [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md).
3. Supabase → Authentication → URL Configuration:
   - **Site URL** = the origin the WebView will load
   - **Redirect URLs** = that origin `/**` **and**
     `https://slabslip.github.io/cuckle-trade-tracker/**` during cutover
4. Authentication → Providers → Email → **Confirm email OFF**
5. Phone: open the new origin, sign in again, cast one vote.

Until DNS is live, the shell default origin stays
`https://slabslip.github.io/cuckle-trade-tracker/?store=1`.

---

## 2. Supabase SQL waves (live project)

Paste in the SQL Editor, in order, if not already applied. Votes + news
submissions are already live. Ledger / cosmetics / dash persist are the usual
gaps.

1. [`db/schema.sql`](../db/schema.sql) (if a fresh project)
2. [`db/phase1-seat-auth.sql`](../db/phase1-seat-auth.sql)
3. [`db/multi-league-app.sql`](../db/multi-league-app.sql)
4. [`db/commissioner-invites.sql`](../db/commissioner-invites.sql)
5. [`db/wave1-invite-hardening.sql`](../db/wave1-invite-hardening.sql)
6. [`db/wave2-vote-identity.sql`](../db/wave2-vote-identity.sql)
7. [`db/wave2b-vote-unique.sql`](../db/wave2b-vote-unique.sql)
8. [`db/wave5-invite-plain.sql`](../db/wave5-invite-plain.sql)
9. [`db/wave6-one-seat-redeem.sql`](../db/wave6-one-seat-redeem.sql) (if present)
10. Ledger: [`db/wave12-ledger.sql`](../db/wave12-ledger.sql) through
    [`db/wave17-ledger-clock.sql`](../db/wave17-ledger-clock.sql)
11. [`db/wave18-seat-cosmetics.sql`](../db/wave18-seat-cosmetics.sql)
12. [`db/wave19-seat-data-dash.sql`](../db/wave19-seat-data-dash.sql) (optional)
13. [`db/wave20-seat-trade-block.sql`](../db/wave20-seat-trade-block.sql) (optional)
14. [`db/wave21-news-league.sql`](../db/wave21-news-league.sql) — per-league news

Deploy Edge (from a machine with the CLI logged in):

```bash
./scripts/deploy-join-league.sh
# supabase functions deploy dispatch-news --project-ref gtqyvnkkjiksmmtmzubw
```

GitHub secrets that must exist:

| Secret | Used by |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | `league-sync`, `values-daily`, `mark-league-ready` |
| `GITHUB_PAT` | Edge `dispatch-news` **and** `join-league` → `league-sync` |

`join-league` now dispatches `league-sync` on create when `GITHUB_PAT` is set
on the function. Add the same secret the news dispatcher already uses.

---

## 3. Apple Developer (store identity)

1. Enroll at [developer.apple.com](https://developer.apple.com) (personal or
   org). Bundle id reserved in-repo: **`com.chuckle.fantasy`**.
2. Certificates → Apple Distribution + Development.
3. Identifiers → App ID `com.chuckle.fantasy` (no extra capabilities for v1).
4. Profiles → App Store + Development.
5. App Store Connect → New app:
   - Name: **Chuckle Fantasy**
   - SKU: `chuckle-fantasy`
   - Bundle ID: `com.chuckle.fantasy`
   - Category: Sports
6. Privacy nutrition: **no tracking**. Data collected: account (username) on
   device + our servers (Supabase). No third-party advertising. Encryption:
   standard HTTPS only — set **ITSAppUsesNonExemptEncryption = false**
   (already in [`ios/Chuckle/Info.plist`](../ios/Chuckle/Info.plist)).
7. Icons: 1024×1024 master is [`data/ui/icon-1024.png`](../data/ui/icon-1024.png).
   The Xcode asset catalog points at it.

---

## 4. Build and upload (Mac with Xcode)

```bash
cd ios
make origin          # prints the URL the WebView will load
make build           # xcodebuild archive (needs Xcode)
make testflight      # notes for Transporter / altool
```

Or open `ios/Chuckle.xcodeproj` → Signing team → Archive → Distribute →
TestFlight (internal). First testers: the ten Cuckle seats.

Override origin without a rebuild of JS:

```bash
make build ORIGIN='https://yourdomain.com'
```

---

## 5. What this repo already did

- Store law + device gate docs
- iOS WKWebView shell + Makefile
- `?store=1` Ledger honor-system copy
- Auto `league-sync` dispatch from `join-league`
- Per-league news write + optional `sleeper_league_id` column
- Format detection (1QB / Superflex / TEP / redraft) on the book
- N-team Teams list + first-year empty Champions Path
