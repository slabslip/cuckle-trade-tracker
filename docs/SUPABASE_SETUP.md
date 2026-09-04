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

## 3b. Run needed: `news_submissions`, for tweets shared in from X

This is the intake table for the "share a tweet from X into the feed" flow. The
iOS Shortcut POSTs a row here; `news-sync.mjs` reads the unprocessed rows,
fetches each tweet's text from X's oEmbed endpoint, and publishes it into
`data/ui/news.json`.

**Re-running the whole of `db/schema.sql` does all of this** and is still safe to
run twice. The standalone snippet is below if you would rather paste just this
part.

### Why this section is written as create-then-converge

On 2026-08-30 this project already had a `news_submissions` with exactly the
right seven column names and **none** of the constraints, policies or grants. It
accepted `https://evil.com/a/status/1`, had no unique constraint, and let the
anon key rewrite the `url` of a row that was already stored.

`create table if not exists` does nothing when a table of that name exists,
whatever shape it is in, and reports success. So a version of this that declared
its constraints inline would be idempotent in the trivial sense and useless in
the sense that matters. Every constraint, index, policy and grant below is
therefore applied separately, and two details are load-bearing:

* **`revoke update` before `grant update (processed_at)`.** A table-wide grant
  and a column-level grant are separate privilege entries; granting the column
  does not remove the table-wide one. Without the revoke, `url` stays rewritable.
* **Check constraints go on `not valid`, then validate in a block that
  downgrades failure to a warning.** A legacy row violating a new check would
  otherwise abort the whole script, letting one piece of junk permanently block
  the setup that prevents more of it. `not valid` still enforces on every insert
  and update from that moment; validation only certifies the *old* rows.

If you see a warning about existing rows violating `news_submissions_url_shape`,
this finds them:

```sql
select id, url, created_at from public.news_submissions
where url !~* '^https?://(www\.)?(x|twitter)\.com/[A-Za-z0-9_]{1,15}/status(es)?/[0-9]{1,25}(/(photo|video)/[0-9]{1,2})?/?([?#].*)?$'
order by id;
```

Anon has no `DELETE` here either, by the same deliberate trade as votes, so
clearing those out needs the SQL editor.

**Marking a row processed no longer suppresses it.** That instruction was
correct when the feed read `processed_at is null`; since the feed became manual
submissions only it reads the whole table, because reading only the unpublished
rows would empty the feed on the second build. `processed_at` is now a record of
when a share first appeared. Soft-delete (`deleted_at`) is how a post leaves the
feed — see §3c. Hard DELETE stays revoked for anon.

### One-time: clear the rows this feature was built against

**Run this. It is the only thing on this page the feed still needs from you.**

Building this left rows in the queue. Ids 1–13 are test submissions —
`jack/status/20`, two Obama tweets, a park photo, and four deliberately hostile
ones used for the XSS proof (`https://evil.com/...`, a `javascript:` url, a
`<script>` in `note`). **Ids 14 and up are genuine submissions** sent from the
Shortcut and must be left alone.

```sql
delete from public.news_submissions where id between 1 and 13;
```

Until that runs, four of them publish: ids 3, 11, 12 and 13. The rest are
removed by the pipeline on its own — ids 1, 5 and 6 are rejected because their
URLs are not X permalinks, ids 2, 7, 8, 9, 10 share a tweet with a later row and
collapse into it, and id 4's tweet is deleted. The four that do publish are
inert: id 3's `note` is an attribute-breakout payload and renders as the visible
characters `" onmouseover="window.__XSS_ATTR=1" data-x="`, which is ugly and
harmless. This was verified in a browser rather than argued — see NEWS_SDD §10a.

They are also obviously not league news, which is the point of leaving the
pipeline to handle them rather than depending on this delete having happened:
the ingest must be safe against a hostile row arriving at any time, not only
against the ones somebody remembered to remove.

### The uniqueness rule, and why it is not `url` alone

Unique on **`(url, submitted_by)` with `nulls not distinct`**.

A unique constraint on `url` alone would stop the same tweet ever being added
twice — and would also stop two league members putting their own jab on the same
tweet. The second person's row is not a duplicate, it is the content. Two
managers reacting to one Schefter tweet is the feature working.

The duplicate that actually happens is narrower: one person taps Share twice, or
the Shortcut retries on flaky LTE and POSTs the identical body again. That
collision is (same url, same submitter), so that is what the constraint covers.

`nulls not distinct` is required, not decorative. By the SQL default two NULLs
are distinct, so without it a submitter who does not send `submitted_by` — which
is optional — would defeat the constraint entirely and every retry would insert.

**It was not firing, and 5a.1 is the fix.** Every URL an iOS share sheet
produces carries `?s=12&t=…`, and `t` is regenerated on every share, so two taps
on the same tweet are two different strings and the constraint never sees a
collision. Ids 14 and 16 in this project's table are that exact case: same
tweet, same submitter, minutes apart, both stored. A `before insert` trigger now
rewrites `url` to `https://x.com/<handle>/status/<id>` — the same rewrite
`parseTweetUrl()` performs, so the stored value and the value the build derives
cannot disagree — and uniqueness compares tweets instead of strings.

Collapsing two people's takes on one tweet into one feed row is a *display*
decision, and it is handled downstream in `news-sync.mjs`, keyed on the tweet's
numeric id, and can be tuned without a migration.

### The honest limits, same as votes but they matter more here

The anon key is in the page, so **anyone who can read the site can insert a row
into this table.** There is no author check because without Supabase Auth there
is nothing to check against; `submitted_by` is client-asserted and unverifiable.
A vote is a number in a tally. This table feeds **text that gets rendered on the
page**, so the mitigations are downstream and each one is real:

* `url` must match an x.com/twitter.com status permalink, so the build cannot be
  aimed at another host.
* `news-sync.mjs` re-validates the same shape and rebuilds the canonical URL from
  the captured handle and id, so the stored string is never what gets fetched.
* The oEmbed **HTML is never forwarded** — the tweet is stripped to plain text.
* Every field is escaped at render, in text and in attributes, and a build guard
  refuses a page that interpolates a news field without `esc()`.
* A submission publishes; it cannot move a number. PRODUCT LAW still holds.

Anyone with the key can also stamp `processed_at`. That used to suppress a
pending submission; since the feed reads the whole table it only writes a wrong
timestamp on a bookkeeping column. Acceptable for ten friends, on the same
reasoning as votes. Worth saying rather than implying otherwise.

### The SQL

```sql
create table if not exists public.news_submissions (
  id           bigint generated always as identity primary key,
  url          text        not null,
  note         text,
  target_name  text,
  submitted_by text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.news_submissions add column if not exists note         text;
alter table public.news_submissions add column if not exists target_name  text;
alter table public.news_submissions add column if not exists submitted_by text;
alter table public.news_submissions add column if not exists created_at   timestamptz not null default now();
alter table public.news_submissions add column if not exists processed_at timestamptz;

do $$
declare c record;
begin
  for c in
    select * from (values
      ('news_submissions_url_len',   'check (length(url) between 12 and 500)'),
      ('news_submissions_url_shape', 'check (url ~* ''^https?://(www\.)?(x|twitter)\.com/[A-Za-z0-9_]{1,15}/status(es)?/[0-9]{1,25}(/(photo|video)/[0-9]{1,2})?/?([?#].*)?$'')'),
      ('news_submissions_note_len',         'check (note is null or length(note) between 1 and 500)'),
      ('news_submissions_target_name_len',  'check (target_name is null or length(target_name) between 1 and 64)'),
      ('news_submissions_submitted_by_len', 'check (submitted_by is null or length(submitted_by) between 1 and 64)')
    ) as t(name, body)
  loop
    if not exists (select 1 from pg_constraint
                   where conrelid = 'public.news_submissions'::regclass and conname = c.name) then
      execute format('alter table public.news_submissions add constraint %I %s not valid', c.name, c.body);
    end if;
    begin
      execute format('alter table public.news_submissions validate constraint %I', c.name);
    exception when check_violation then
      raise warning 'news_submissions: existing rows violate %; enforced for new rows only.', c.name;
    end;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.news_submissions'::regclass
                   and conname  = 'news_submissions_url_submitted_by_key') then
    begin
      alter table public.news_submissions
        add constraint news_submissions_url_submitted_by_key
        unique nulls not distinct (url, submitted_by);
    exception when unique_violation then
      raise warning 'news_submissions: existing duplicate (url, submitted_by) rows blocked the unique constraint.';
    end;
  end if;
end $$;

create index if not exists news_submissions_unprocessed_idx
  on public.news_submissions (created_at) where processed_at is null;

alter table public.news_submissions enable row level security;

drop policy if exists news_submissions_anon_insert on public.news_submissions;
create policy news_submissions_anon_insert on public.news_submissions
  for insert to anon with check (true);

drop policy if exists news_submissions_anon_select on public.news_submissions;
create policy news_submissions_anon_select on public.news_submissions
  for select to anon using (true);

drop policy if exists news_submissions_anon_update on public.news_submissions;
create policy news_submissions_anon_update on public.news_submissions
  for update to anon using (true) with check (true);

grant select, insert on table public.news_submissions to anon;
revoke update on table public.news_submissions from anon;
grant update (processed_at, deleted_at, deleted_by) on table public.news_submissions to anon;
revoke delete, truncate on table public.news_submissions from anon;
```

### 3c. Run needed: soft-delete for admin Remove on the alert feed

**Paste this if you have already run §3b and only need the delete columns.** Re-running
the whole of `db/schema.sql` also applies it.

Anon still has **no hard DELETE**. Removing a post stamps `deleted_at` / `deleted_by`.
The page hides the row as soon as the stamp lands; `news-sync.mjs` skips it on the
next build. The Remove button is offered only when this device's remembered seat is
`TrumanCooper` (pick yourself once via Teams, then Home). That is a UI gate among
friends — anyone holding the anon key can still PATCH these columns, the same honesty
as the insert surface.

```sql
alter table public.news_submissions add column if not exists deleted_at timestamptz;
alter table public.news_submissions add column if not exists deleted_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.news_submissions'::regclass
      and conname = 'news_submissions_deleted_by_len'
  ) then
    alter table public.news_submissions
      add constraint news_submissions_deleted_by_len
      check (deleted_by is null or length(deleted_by) between 1 and 64) not valid;
  end if;
  begin
    alter table public.news_submissions validate constraint news_submissions_deleted_by_len;
  exception when check_violation then
    raise warning 'news_submissions: existing rows violate deleted_by length; enforced for new rows only.';
  end;
end $$;

revoke update on table public.news_submissions from anon;
grant update (processed_at, deleted_at, deleted_by) on table public.news_submissions to anon;

create index if not exists news_submissions_alive_idx
  on public.news_submissions (created_at desc)
  where deleted_at is null;
```

### 3d. Run needed: ping GitHub when a row lands (immediate publish)

The public site is static GitHub Pages. A share only becomes visible after
`news-sync.mjs` rebuilds `data/ui/news.json` and that file is on `main`. The
workflow [`.github/workflows/news-refresh.yml`](../.github/workflows/news-refresh.yml)
does that on `repository_dispatch` (`news-submission`).

**Do this once:** follow **[`docs/NEWS_DISPATCH.md`](NEWS_DISPATCH.md)** —
Supabase Edge Function `dispatch-news` + Database Webhook + `GITHUB_PAT` secret.
(The older `pg_net` SQL path was returning HTTP 401 to GitHub in this project.)

### One-tap Shortcut — “Send to Cuckle” (the intended path)

**Share on X → Send to Cuckle → done.** No Ask, no Choose from List, no If, no
note, no target picker. The feed auto-tags whoever rosters the player(s).

1. New Shortcut named **Send to Cuckle**.
2. Details → **Show in Share Sheet** → accept **URLs** (and Safari web pages if
   offered).
3. Optional but tidy: **Set Variable** `Tweet URL` = **Shortcut Input**
   (or **Get URLs from Input** → that URL, if Share sometimes sends text).
4. One action: **Get Contents of URL**.

```
URL     https://gtqyvnkkjiksmmtmzubw.supabase.co/rest/v1/news_submissions?on_conflict=url,submitted_by

Method  POST

Headers
  apikey         <anon key from the live page / news-sources.mjs>
  Authorization  Bearer <same anon key>
  Content-Type   application/json
  Prefer         resolution=ignore-duplicates,return=minimal

Request Body     JSON
  {
    "url":          <Tweet URL / Shortcut Input>,
    "submitted_by": "TrumanCooper"
  }
```

**Do not send `target_name` or `note`.** Leave those keys out of the JSON
entirely. Empty/`null` is fine too; the matcher fills the manager header.

5. No further actions. (Optional: **Show Notification** “Sent to Cuckle”.)

That is the whole Shortcut — three taps on the phone become two: Share, then
Send to Cuckle. Instant publish is §3d (webhook → `news-refresh` → `main`).

### Optional fields (only if you want them later)

Only `url` is required. A successful POST answers **201** with an empty body.

* **`url`** — whatever the share sheet gives you. `twitter.com` or `x.com`, with
  `?s=20&t=…` or a `/photo/1` suffix, all fine; the pipeline canonicalises it.
* **`submitted_by`** — who shared it. Used for the uniqueness rule (same person
  re-sharing the same tweet is a no-op). Hard-code your seat name.
* **`note`** — optional jab. Ships in its **own** attributed field on the row;
  it does not replace the locker-room summary. Up to 500 characters, trimmed to
  240 in the feed. Skip it for one-tap.
* **`agent_tip`** — optional **private** coaching for the smack/summary agent
  (tone, “no poke”, a line you would have said). **Not** shown on the feed.
  Saved into `data/smack-tips.json` on ingest. See [`SMACK_AGENT.md`](SMACK_AGENT.md).
  Up to 500 characters. Skip it for one-tap.
* **`target_name`** — optional manual override of who the row is aimed at. Send
  a **name**, not a `user_id`. Case and spaces do not matter; aliases resolve.
  Ambiguous fragments refuse; the item still publishes under "The league".
  **Omit for Auto** — that is the one-tap path. If you add a Choose-from-List,
  wire **Chosen Item** into this field or it arrives as `null`.

### Optional: “Send to Cuckle (with tip)” — coach the agent

Same as one-tap, plus one Ask before the POST. Use when you want the summary
agent to remember how *you* would talk about this share.

1. Duplicate **Send to Cuckle** → rename **Send to Cuckle (with tip)**.
2. After the Tweet URL variable, add **Ask for Input** (or **Dictate Text**):
   “Tip for the smack agent (optional)”. Allow empty.
3. **Set Variable** `Agent Tip` = **Provided Input**.
4. Change the Get Contents of URL JSON body to:

```
{
  "url":          <Tweet URL>,
  "submitted_by": "TrumanCooper",
  "agent_tip":    <Agent Tip>
}
```

If the Ask is blank, either omit `agent_tip` or send it only when non-empty
(Shortcut If). Empty tips are ignored by the pipeline.

Run `db/schema.sql` (or the `agent_tip` alter) on Supabase once so the column
exists. Until then, ingest still builds the feed (it retries the select without
`agent_tip`); tips simply are not stored. Do **not** skip the alter if you use
the with-tip Shortcut — PostgREST rejects inserts that name an unknown field.

`resolution=ignore-duplicates` maps to `ON CONFLICT DO NOTHING`, so a second tap
on Share answers 201 with an empty body instead of a `409` the Shortcut would
surface as a failure. It needs `INSERT` only.

**Run the SQL above before building the Shortcut.** `on_conflict=url,submitted_by`
names a constraint, and until that constraint exists PostgREST answers **400**
`42P10 there is no unique or exclusion constraint matching the ON CONFLICT
specification` — verified against this project on 2026-08-30. Dropping the
`?on_conflict=…` query and the `Prefer` header makes it a plain insert that works
today, at the cost of a duplicate row per extra tap.

Nothing appears in the feed until `news-sync.mjs` runs and `news.json` is on
`main` — this is a static site, so the feed is a committed file, not a live
query. With §3d wired, that happens on every share (and every admin Remove);
without it, the workflow's five-minute cron is the fallback.

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
README. Those are the origins that will appear in requests. A GoDaddy (or any)
custom domain becomes another origin — see [`CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md).

**Supabase Auth** (Phase 1 claim-seat) **does** keep an allowlist:

- Dashboard → Authentication → URL Configuration → **Site URL** + **Redirect URLs**
- Include both github.io and the custom domain during cutover

---

## 7a. Phase 1 — claimed-seat auth (**superseded by §8**)

Phase 1 `CUCK-` per-seat Auth users via [`seed-seat-auth.mjs`](../seed-seat-auth.mjs) are
**retired**. Chuckle Fantasy binds seats with commissioner `CF-` invites (§8). Keep
[`db/phase1-seat-auth.sql`](../db/phase1-seat-auth.sql) for the original `seat_profiles` /
vote write gate, then apply multi-league + Wave 1/2 SQL so votes resolve from
`league_memberships`.

Do **not** seed CUCK codes for Cuckle — they collide with invite-redeem memberships.
`seed-seat-auth.mjs` exits unless you pass `--force-legacy`.

### Historical verify

```bash
# Anon write must fail after Phase 1 SQL:
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$URL/rest/v1/trade_votes" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"transaction_id":"0","choice":"0","voter":"0"}'
# expect 401 or 403
```

---

## 8. Multi-league app (Chuckle Fantasy)

See [`APP_SDD.md`](APP_SDD.md). Apply SQL **in order**:

1. [`db/phase1-seat-auth.sql`](../db/phase1-seat-auth.sql)
2. [`db/multi-league-app.sql`](../db/multi-league-app.sql)
3. [`db/commissioner-invites.sql`](../db/commissioner-invites.sql)
4. [`db/wave1-invite-hardening.sql`](../db/wave1-invite-hardening.sql) — atomic redeem, claim-seat RPCs, tighten RLS
5. [`db/wave2-vote-identity.sql`](../db/wave2-vote-identity.sql) — per-league vote identity

Then:

1. Deploy Edge Function `supabase/functions/join-league`
2. Auth Confirm email stays **OFF**; Site URL includes your app origin
3. **Commissioner:** Create account → Create a league → Sleeper league ID (Cuckle: `1315431339301806080`) + optional ESPN → DM codes → **Claim this seat**
4. **Members:** Create account → Redeem invite → dashboard
5. **Meter sync (non-Cuckle):** `node build.mjs <league_id>` (or Action `league-sync`); status → `ready`

Username emails are synthetic: `{username}@users.cuckle.invalid`.

Sleeper has **no OAuth** — do not collect Sleeper passwords. Invites bind seats.

---

## 9. Hand back — done

Both values were handed over and are wired into `generate-page.mjs`:

1. **Project URL** — `https://gtqyvnkkjiksmmtmzubw.supabase.co`
2. **Key** — legacy **`anon` JWT** (`eyJ...`), so both the `apikey` header and
   `Authorization: Bearer` are sent

`curl` in Step 5 worked. No secret / `service_role` key was sent, and none is
wanted — it cannot be used in a static page and would have to be rotated.

The only thing left is the one `create or replace view` in Step 3a.

---

## 10. Ledger (bet slips)

Season-long bets between members with Shortcut ingest and accept/lock.
Slips default to **public**; either party can mark **private**. Own Ledger shows
only your slips; another seat’s team page shows that seat’s public W/L + slips.

1. Run [`db/wave12-ledger.sql`](../db/wave12-ledger.sql) in the SQL Editor.
2. Run [`db/wave13-ledger-visibility.sql`](../db/wave13-ledger-visibility.sql)
   (adds `visibility` + SELECT RLS: party or public).
3. Deploy Edge Function `ledger-ingest` with secret `LEDGER_INGEST_SECRET`.
4. Build the iPhone Shortcut per [`docs/LEDGER_SDD.md`](LEDGER_SDD.md)
   (full operator checklist: [`LEDGER_BUILD_SDD.md`](LEDGER_BUILD_SDD.md)).

Planning archive (shipped): [`plans/ledger_and_league_tab.md`](plans/ledger_and_league_tab.md),
[`plans/ledger_privacy_views.md`](plans/ledger_privacy_views.md).

The Ledger tab in the app reads `ledger_bets` with the signed-in member JWT (same
pattern as `trade_votes`). Design Mode seeds sample slips without Supabase.
