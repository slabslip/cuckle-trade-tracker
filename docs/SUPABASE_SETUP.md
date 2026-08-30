# Supabase setup

How to stand up the database this site will use to save data. First use is trade
"who won" votes, but the point is a general-purpose place to collect things, so
the schema is written as a pattern you can extend rather than a one-off.

Written for someone who has a Supabase account and has not set this project up.
Companion file: [`db/schema.sql`](../db/schema.sql), which is the thing you paste
into the SQL editor.

**Status of this document.** Done and live. `db/schema.sql` has been run against
the real project, and the upsert, the tally read and the denied `DELETE` were all
exercised against it with `curl`. The page now reads and writes those tallies —
see [`docs/VOTES_SDD.md`](VOTES_SDD.md) §5 for the adapter.

The project in use is `https://gtqyvnkkjiksmmtmzubw.supabase.co` with a **legacy
`anon` JWT** key, which is committed in `generate-page.mjs`. That is intended;
Step 4 explains why, and states plainly what it does not protect.

**One outstanding change.** The tally view gained a `where choice <> '__none__'`
predicate after the first run, to fix the cleared-vote defect in Step 3a. Re-run
`db/schema.sql` (or just that one `create or replace view` statement) to pick it
up. The page filters the sentinel client-side as well, so nothing is broken while
that is pending — the totals are correct either way.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Pick your personal org, name it something obvious like `cuckle-trade-tracker`.
3. Set a database password. You will not need it for this site — the page talks
   to the REST API, not to Postgres directly — but Supabase requires one and it
   is a pain to recover, so put it in your password manager now.
4. Pick the region closest to the league. This only affects latency.
5. Free tier is fine. Ten people voting on trades is nowhere near any limit.

Note the free tier pauses projects after a stretch of inactivity. If votes stop
working after a quiet month, check the dashboard — you may just need to unpause.

---

## 2. Find the two values we need

Go to **Project Settings → API Keys**, or use the **Connect** button in the top
bar, which shows both values together.

**Project URL** — looks like `https://abcdefghijklmnop.supabase.co`. The REST API
lives underneath it at `/rest/v1/`.

**The public key** — and here Supabase is mid-migration, so check which of these
you have:

| What you see | Looks like | This is |
| --- | --- | --- |
| **Publishable key** | `sb_publishable_...` | The current key. New projects get only this. |
| **`anon` key** (Legacy API Keys tab) | a long JWT starting `eyJ...` | The old key. Only on projects created before ~Nov 2025. |

Either one works for us and both are browser-safe. **Which one you have changes
the request headers**, so note the prefix — Step 5 explains why.

Ignore the **Secret key** (`sb_secret_...`) and the legacy **`service_role`** key
completely. See Step 4.

---

## 3. Run the schema

1. Open **SQL Editor** in the left sidebar, click **New query**.
2. Paste the entire contents of [`db/schema.sql`](../db/schema.sql).
3. Click **Run**.

You should get a success result with some `NOTICE` lines about things being
skipped. Those notices are the idempotency guards doing their job, not errors.
The file is safe to run again — a second run changes nothing, which is how you
apply future edits to it.

Then check it landed: **Table Editor** should show `trade_votes` with a
**"RLS enabled"** badge. If that badge says RLS is *disabled*, stop and tell us,
because that would mean the table is wide open.

What the file creates:

- `trade_votes` — one row per (trade, voter), with a unique constraint on
  `(transaction_id, voter)` so changing your mind updates your row instead of
  adding a second one.
- `trade_vote_tallies` — a view giving `(transaction_id, choice, votes)`, so the
  page can read counts without downloading every ballot.
- Row Level Security with exactly three policies for the public role: insert,
  update, select. No delete.

The comments in the file explain each policy and, more importantly, what it does
**not** protect. Please read that section before you decide this is fine —
summarised in Step 4.

---

## 3a. Re-run needed: the cleared-vote sentinel

**This is the one thing still to do.** Tapping your own side again clears your
vote. Anon has no `DELETE` — verified live, it returns `401` — so clearing cannot
remove the row, and it must not, because a delete verb would let any league member
erase everybody else's votes. A cleared vote is therefore stored as the reserved
`choice` value `__none__`, and the tally view has to filter it out. The first
version of the view did not, so a cleared vote was counted as a vote for a side
called `__none__`.

Reproduced against your project, two votes for one side, then one of them cleared:

```json
[{ "transaction_id": "…", "choice": "__none__", "votes": 1 },
 { "transaction_id": "…", "choice": "SEATX",    "votes": 1 }]
```

The phantom row inflates the denominator, so the page would show 50% / 50% on a
trade that has one real vote. Paste this into the SQL editor to fix it — it is
already in `db/schema.sql`, so re-running the whole file does the same thing:

```sql
create or replace view public.trade_vote_tallies with (security_invoker = true) as
  select transaction_id, choice, count(*)::int as votes
  from public.trade_votes
  where choice <> '__none__'
  group by transaction_id, choice;
```

`__none__` cannot collide with a real answer: `choice` only ever holds a Sleeper
`user_id`, which is a decimal snowflake string.

---

## 4. What is safe to commit, and what is not

**Safe to commit, and we need them in the page:** the Project URL and the
publishable / `anon` key.

That is not a shortcut. It is what those values are for. This site is static,
served by GitHub Pages from `main`, with no server anywhere in the picture, so
there is no place to hide a secret from someone who opens dev tools. The
publishable key is designed to be public and it carries no privileges of its own;
the Row Level Security policies in `db/schema.sql` are what decide what it can
do, and they confine it to inserting, updating and reading rows in `trade_votes`.

**Never commit, never put in the page, never paste into a build script or an
Actions log:** the **Secret key** (`sb_secret_...`) or the legacy
**`service_role`** key. Those bypass Row Level Security entirely — they are full
read/write master keys for the whole database. If one ever lands in a commit,
rotate it in the dashboard immediately; note that legacy `service_role` keys
*cannot* be rotated, so a leak there means migrating to the new keys.

### The honest limitation

Because we are not using Supabase Auth, there is no logged-in user, so the
database cannot verify who is voting. The `voter` value is asserted by the
client. Concretely, a league member who opens dev tools can:

- vote as someone else, since seat `user_id`s are public in
  `data/ui/members.json`;
- overwrite someone else's existing vote;
- stuff the ballot with fresh uuids.

RLS stops none of that, and no amount of policy writing will while the identity
is client-asserted. This is acceptable here because it is a private ten-person
league of people who know each other, the stakes are an opinion counter, and
votes are firewalled from every number that actually matters — they never enter
the needle math, the even book, Value Adjustment, the lens windows,
`today_delta`, partner grades or any ranking. If you want votes to be
trustworthy rather than merely convenient, the answer is Supabase Auth, not a
tighter policy.

---

## 5. Verify it yourself with curl

Do this before we write any UI. If these two commands work, the setup is correct
and any later bug is ours, not the database's.

No npm client and no SDK is involved anywhere in this project — the page will use
plain `fetch`, which is the same thing these `curl` calls do.

### Headers: which ones depend on your key type

The `apikey` header is always required. The `Authorization` header is where the
two key types differ:

- **`sb_publishable_...`** — send **`apikey` only**. Supabase's migration guide
  is explicit that the new keys are not JWTs and are *rejected* on
  `Authorization: Bearer`, which fails with `Invalid JWT`.
- **legacy `anon` JWT (`eyJ...`)** — send `apikey` **and**
  `Authorization: Bearer <key>`, the long-standing form for these keys.

Set the placeholders once:

```bash
SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
SUPABASE_KEY="sb_publishable_YOUR_KEY_HERE"    # or your legacy eyJ... anon key
```

### 5a. Write a vote (the upsert)

`460470201385742336` is a real trade id from this league and
`458004578168729600` is a real seat's `user_id`, so this is shaped exactly like
what the page will send.

```bash
curl -i -X POST \
  "$SUPABASE_URL/rest/v1/trade_votes?on_conflict=transaction_id,voter" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d '{
        "transaction_id": "460470201385742336",
        "choice": "458004578168729600",
        "voter": "11111111-2222-3333-4444-555555555555"
      }'
```

Expect `201 Created` and the row echoed back.

**Now run the exact same command again with a different `choice`** — say
`457945712932417536`. That is the "changed my mind" path, and it is the one worth
testing, because it must **update** your row rather than add another. Then check
that only one row exists for that voter:

```bash
curl -s "$SUPABASE_URL/rest/v1/trade_votes?transaction_id=eq.460470201385742336&voter=eq.11111111-2222-3333-4444-555555555555&select=id,choice,created_at,updated_at" \
  -H "apikey: $SUPABASE_KEY"
```

One row, the new `choice`, the original `created_at`, a newer `updated_at`.

**`?on_conflict=transaction_id,voter` is not optional.** PostgREST infers the
conflict target from the primary key unless you name one, and our primary key is
a surrogate `id` column. Leave it off and the second write fails with a
duplicate-key error on `trade_votes_transaction_id_voter_key`. That failure is at
least loud rather than silent — verified locally — but it is still a failure, so
keep the parameter on.

### 5b. Read the tally

```bash
curl -s "$SUPABASE_URL/rest/v1/trade_vote_tallies?transaction_id=eq.460470201385742336&select=choice,votes" \
  -H "apikey: $SUPABASE_KEY"
```

```json
[{ "choice": "457945712932417536", "votes": 1 }]
```

Drop the `transaction_id` filter to get every trade's tallies at once, which is
what a build-time bake would do:

```bash
curl -s "$SUPABASE_URL/rest/v1/trade_vote_tallies?select=transaction_id,choice,votes" \
  -H "apikey: $SUPABASE_KEY"
```

Supabase caps rows per request (1000 by default). Not a concern at this league's
size, but if the tally list ever outgrows it, page with
`?limit=1000&offset=...`.

### If it fails

- `401` with `Invalid JWT` — you sent a `sb_publishable_...` key on the
  `Authorization` header. Drop that header.
- `401` / `Invalid API key` — wrong key, or you grabbed the key from the wrong
  tab.
- `404` on `trade_votes` — the schema did not run, or it ran in a schema other
  than `public`.
- `403` / `new row violates row-level security policy` — the policies did not
  get created. Re-run `db/schema.sql`.

Cleaning up your test rows needs the SQL editor, not `curl`: there is
deliberately no delete policy, so
`delete from trade_votes where voter = '11111111-2222-3333-4444-555555555555';`
in the SQL editor is the way.

---

## 6. Two read strategies — decided: A with B as fallback

**Shipped.** The page reads live tallies from Supabase and paints the committed
`data/ui/votes.json` first, exactly as the recommendation below argues. Read
precedence is live Supabase → committed `votes.json` → local-only. The reasoning
is kept below because it is the reason the fallback exists at all.

Both fit behind the vote UI's storage seam (`readVotes(transactionId)` /
`writeVote(transactionId, choice)`), so this is a reversible decision — but they
feel different to use.

### Option A — query Supabase live from the page

The page fetches `trade_vote_tallies` when it renders a trade.

- Tallies are current, including your own vote a moment after you cast it.
- No rebuild needed for a vote to show up.
- Needs the publishable key in the page. Fine, per Step 4.
- Adds a network call to the render path, and votes show nothing if Supabase is
  paused or unreachable.

### Option B — bake totals into `data/ui/votes.json` at rebuild

`build.mjs` pulls the tallies during a rebuild and commits them as a data file
alongside `league.json`; the page reads it like any other static data.

- Page stays fully static, offline-capable, no key in it at all.
- Zero runtime dependency on Supabase.
- **Stale between rebuilds.** Worse: writes still have to go somewhere live, so
  you either keep the key in the page anyway for writing, or you cannot vote
  from the page at all.
- Your own vote does not appear until the next rebuild, which reads as broken.

### Recommendation: Option A, with Option B as a cached fallback

Go live. A vote counter whose count does not move when you vote is a worse
product than a page that makes one extra `fetch`, and Option B does not actually
avoid putting the key in the page unless we give up on voting from the page —
which is the whole feature. Option B's real value is as a **fallback**, not a
primary: `build.mjs` bakes the current totals into `data/ui/votes.json` on each
rebuild, the page paints those instantly, then refreshes from Supabase and
replaces them when the response lands. Offline or paused project degrades to
last-known totals rather than to nothing.

If you would rather the page never talk to Supabase at all, Option B alone is a
legitimate choice — it just means votes are cast somewhere else, and this becomes
a read-only display of a number someone else collected.

Either way, the baked file stays a *separate file* from `league.json`. Opinion
does not get to share a payload with the book.

---

## 7. CORS and origins

The Supabase REST API is built to be called from browsers with the publishable
key and responds with permissive CORS headers, so there is no origin allowlist to
fill in for `/rest/v1/` calls. Step 5's `curl` commands do not exercise CORS
(curl is not a browser), so the first real check is the browser console once the
UI exists — a CORS failure shows up there as a blocked cross-origin request
rather than as an HTTP error code.

For the record, this site is served from **`https://slabslip.github.io`** (path
`/cuckle-trade-tracker/`), and locally from `http://localhost:8766` per the
README. Those are the origins that will appear in requests.

Origins do become configurable in two places we are not using yet — if we ever
add either, come back to this:

- **Supabase Auth** keeps an allowlist of redirect URLs. Only relevant if we turn
  on real logins.
- **Edge Functions** set their own CORS headers in code and do not inherit the
  REST API's.

---

## 8. Hand back — done

Both values were handed over and are wired into `generate-page.mjs`:

1. **Project URL** — `https://gtqyvnkkjiksmmtmzubw.supabase.co`
2. **Key** — legacy **`anon` JWT** (`eyJ...`), so both the `apikey` header and
   `Authorization: Bearer` are sent

`curl` in Step 5 worked. No secret / `service_role` key was sent, and none is
wanted — it cannot be used in a static page and would have to be rotated.

The only thing left is the one `create or replace view` in Step 3a.
