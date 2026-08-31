-- ============================================================================
-- CuckleChunckle trade meter — Supabase schema
--
-- Paste this whole file into the Supabase SQL editor and run it.
-- It is idempotent: running it twice is safe and changes nothing the second
-- time. Setup walkthrough lives in docs/SUPABASE_SETUP.md.
--
-- ---------------------------------------------------------------------------
-- KEY HANDLING — READ THIS FIRST
-- ---------------------------------------------------------------------------
-- This site is static. It is served by GitHub Pages from `main`, there is no
-- server, and there is no way to keep a secret in the browser. Anything the
-- page can read, a league member can read by opening dev tools.
--
--   * ONLY the anon / publishable key may ever appear in the page or in this
--     repo. It is designed to be public. Every table it can touch is gated by
--     the Row Level Security policies below.
--
--   * The service_role key BYPASSES RLS ENTIRELY. It is a full read/write
--     master key for this database. It must NEVER be committed, never be put
--     in a page, a data file, a build script, or a GitHub Actions log. If it
--     ever leaks, rotate it in the Supabase dashboard immediately.
--
-- The anon key is not a security boundary. It is a routing token. The security
-- boundary is RLS, and the limits of that boundary are spelled out honestly in
-- the policy comments below.
--
-- ---------------------------------------------------------------------------
-- PRODUCT LAW
-- ---------------------------------------------------------------------------
-- Votes are OPINION, NOT VALUE. Nothing in this file may ever be joined into
-- the needle math, the even book, the Value Adjustment, the lens windows,
-- `today_delta`, partner grades, or any ranking. Opinion lives in its own
-- tables and its own files so it can never contaminate the meter. If a future
-- table needs to feed the book, that is a different conversation and a
-- different review.
--
-- ---------------------------------------------------------------------------
-- ASSUMPTIONS
-- ---------------------------------------------------------------------------
-- Written for Supabase, which already provides the `anon`, `authenticated` and
-- `service_role` roles and already exposes the `public` schema through
-- PostgREST. On a bare PostgreSQL install the `anon` role does not exist and
-- the GRANT/POLICY statements referring to it will fail until you create it.
-- ============================================================================


-- ============================================================================
-- 1. trade_votes — one row per (trade, voter)
-- ============================================================================
-- `transaction_id` is the Sleeper transaction id, e.g. '460470201385742336'.
-- These are 64-bit snowflakes that Sleeper hands out as JSON strings, and the
-- page carries them around as strings. Storing them as `text` keeps the client
-- and the database agreeing on one representation, with no bigint rounding
-- risk in JavaScript (they exceed Number.MAX_SAFE_INTEGER).
--
-- `choice` is WHICH SIDE the voter thinks won, stored as that seat's Sleeper
-- `user_id` — not the display name. Sleeper display names change whenever a
-- member feels like it; the `user_id` never does. Names are resolved at render
-- time from data/ui/members.json.
--
-- One reserved value: `__none__` means "this voter cleared their vote". Anon
-- cannot delete rows, so withdrawing an opinion is an UPDATE to the sentinel
-- rather than a DELETE, and `trade_vote_tallies` (section 3) filters it out.
--
-- `voter` is WHO cast the vote: a device-scoped uuid the page generates and
-- keeps in localStorage, or the selected seat's Sleeper `user_id` when the
-- reader has picked a seat. See the RLS section for what this value does and
-- does not prove.

create table if not exists public.trade_votes (
  id            bigint generated always as identity primary key,
  transaction_id text        not null,
  choice        text        not null,
  voter         text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Length bounds only. These stop a bored league member from parking
  -- megabytes of junk in a text column; they are NOT an identity check and
  -- they do NOT verify that the id refers to a real trade or a real seat.
  constraint trade_votes_transaction_id_len check (length(transaction_id) between 1 and 64),
  constraint trade_votes_choice_len         check (length(choice)         between 1 and 64),
  constraint trade_votes_voter_len          check (length(voter)          between 1 and 64)
);

-- `generated always as identity` is deliberate over `bigserial`:
--   * the client cannot supply or overwrite `id`, and
--   * an identity column needs no separate GRANT USAGE on a sequence, so the
--     anon INSERT below works with table privileges alone.


-- --------------------------------------------------------------------------
-- 1a. The unique constraint that makes "change your mind" an UPDATE
-- --------------------------------------------------------------------------
-- One voter gets one vote per trade. Without this, a member clicking a
-- different side would pile up rows and the tally would count them all.
-- With it, the client can upsert: insert, and on conflict update the existing
-- row in place.
--
-- This is also the conflict target the REST upsert names. Note that PostgREST
-- infers the conflict target from the PRIMARY KEY unless you tell it
-- otherwise, and our primary key is the identity column — so the client MUST
-- pass `?on_conflict=transaction_id,voter` on the request alongside
-- `Prefer: resolution=merge-duplicates`. Getting that wrong is the single
-- easiest way to break the upsert path; docs/SUPABASE_SETUP.md shows the exact
-- request.
--
-- `alter table ... add constraint` is not idempotent on its own, hence the
-- guard. A named constraint (rather than a bare unique index) is used so that
-- `on_conflict=transaction_id,voter` has a real constraint to bind to and so
-- the intent is visible in the table definition.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trade_votes'::regclass
      and conname  = 'trade_votes_transaction_id_voter_key'
  ) then
    alter table public.trade_votes
      add constraint trade_votes_transaction_id_voter_key
      unique (transaction_id, voter);
  end if;
end $$;

-- No separate index on `transaction_id` is needed. The unique constraint above
-- is backed by a btree index with `transaction_id` as its leading column, so
-- "all votes for this trade" already uses it.


-- --------------------------------------------------------------------------
-- 1b. updated_at maintenance, and created_at immutability
-- --------------------------------------------------------------------------
-- On the upsert path the client's payload does not carry timestamps, so the
-- database owns them. This trigger stamps `updated_at` on every update and
-- pins `created_at` back to its original value, so a client cannot rewrite
-- when a vote was first cast even though it is allowed to update the row.
--
-- Doing it in a trigger rather than with column-level GRANTs is deliberate:
-- restricting UPDATE to a column list would break the moment PostgREST
-- generated a `DO UPDATE SET` touching a column outside that list, which is
-- exactly the kind of silent breakage this path cannot afford.
create or replace function public.trade_votes_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists trade_votes_touch_updated_at on public.trade_votes;
create trigger trade_votes_touch_updated_at
  before update on public.trade_votes
  for each row execute function public.trade_votes_touch_updated_at();


-- ============================================================================
-- 2. Row Level Security
-- ============================================================================
-- RLS is default-deny. Once enabled, a role can only do what a policy
-- explicitly permits, so the three policies below are the complete list of
-- what the public anon key can do to this table.
--
-- WHAT THESE POLICIES DO PROTECT
--   * Only these three verbs are reachable. There is no DELETE policy, so
--     nobody can delete a vote through the REST API — a member can change
--     their vote but not erase it, and nobody can wipe the table. That is a
--     deliberate trade: it costs us a real DELETE for "clear my vote", which is
--     why `__none__` exists (section 3), and it buys the guarantee that no
--     league member can erase anybody else's opinion.
--   * The check constraints bound the size of what can be stored.
--
-- Note this section only describes THIS table. RLS is per-table: another table
-- in `public` is only protected if it enables RLS too. A table with RLS left
-- off and the default Supabase grants in place is readable and writable by the
-- anon key with no policy involved at all. That is why the pattern in section 6
-- puts `enable row level security` on every new table.
--
-- WHAT THESE POLICIES DO **NOT** PROTECT — STATED PLAINLY
--   * We are not using Supabase Auth. There is no logged-in user, so there is
--     no `auth.uid()` to compare against. The `voter` column is entirely
--     CLIENT-ASSERTED and therefore UNVERIFIABLE by the database.
--   * Consequence: a determined league member who opens dev tools can vote as
--     someone else, by sending another member's `user_id` (these are public,
--     they sit in data/ui/members.json) or a fresh uuid, as the `voter`. They
--     can also change or overwrite another member's existing vote, because
--     `using (true)` on the UPDATE policy cannot tell one caller from another.
--   * Consequence: ballot stuffing is possible. A new uuid per request is a
--     new voter as far as the unique constraint is concerned.
--   * Nothing here rate-limits. Supabase's platform limits are the only cap.
--
-- Why that is acceptable HERE, and only here: this is a private 10-team
-- dynasty league of about ten people who all know each other, the stakes are
-- an opinion counter next to a trade, and the votes are firewalled from every
-- number that actually matters (see PRODUCT LAW above). This is a low-value
-- target guarded by social trust, not by cryptography. It is NOT a model to
-- copy for anything where the data matters.
--
-- The fix, if it ever matters: turn on Supabase Auth, then narrow these
-- policies to `auth.uid()` and drop the client-asserted `voter` column. Do not
-- reach for a client-asserted header check instead — the client controls the
-- header too, so it would look like a control while protecting nothing.

alter table public.trade_votes enable row level security;

-- `drop policy if exists` before each `create policy` is the idempotency
-- pattern here: PostgreSQL has no `create policy if not exists`.

-- INSERT: anon may add a vote row. `with check (true)` accepts any row that
-- satisfies the table's own constraints. This is what a first-time vote uses,
-- and it is also the first half of the upsert.
drop policy if exists trade_votes_anon_insert on public.trade_votes;
create policy trade_votes_anon_insert
  on public.trade_votes
  for insert
  to anon
  with check (true);

-- UPDATE: required by the upsert path. This policy is load-bearing, not
-- decorative — `INSERT ... ON CONFLICT DO UPDATE` needs BOTH halves of an
-- UPDATE policy to pass or the whole statement is rejected:
--   * `using (true)`      — checked against the row ALREADY in the table, so
--                           the conflicting row is visible to the update; and
--   * `with check (true)` — checked against the row AFTER the update, so the
--                           new choice is accepted.
-- Drop this policy and a returning voter's second click fails with an RLS
-- error rather than updating their vote. `using (true)` also means anon can
-- update ANY row, including someone else's — see the honest list above.
drop policy if exists trade_votes_anon_update on public.trade_votes;
create policy trade_votes_anon_update
  on public.trade_votes
  for update
  to anon
  using (true)
  with check (true);

-- SELECT: the whole point is a public tally, so every row is readable. This
-- policy also backs two things that are easy to forget:
--   * the tally view below reads this table as the caller (security_invoker),
--     so without a SELECT policy the view returns nothing; and
--   * a write sent with `Prefer: return=representation` reads back the row it
--     just wrote, which needs SELECT as well as INSERT/UPDATE.
drop policy if exists trade_votes_anon_select on public.trade_votes;
create policy trade_votes_anon_select
  on public.trade_votes
  for select
  to anon
  using (true);


-- ============================================================================
-- 3. trade_vote_tallies — the cheap aggregate the page reads
-- ============================================================================
-- (transaction_id, choice, votes). The page asks for one trade's tallies and
-- gets a handful of rows, instead of pulling every ballot and counting in
-- JavaScript.
--
-- `security_invoker = true` matters. PostgreSQL 15+ still defaults views to
-- running with the VIEW OWNER's privileges, which would read straight past the
-- caller's RLS — that is what Supabase's security advisor flags as a "security
-- definer view". With security_invoker on, the view reads `trade_votes` as
-- whoever queried it, so the SELECT policy above is what governs. Same answer
-- today because that policy is `using (true)`; the difference is that it stays
-- correct if the policy is ever narrowed.
--
-- `::int` keeps the JSON a plain integer rather than a bigint string.
--
-- `where choice <> '__none__'` is the load-bearing line. Clearing a vote cannot
-- delete the row: anon has no DELETE policy and no DELETE privilege (by design —
-- see section 2 — because a delete verb would let any league member erase
-- everybody else's votes). So a cleared vote is stored as the sentinel choice
-- `__none__` and this view drops it. Without the predicate the view counts
-- `__none__` as a vote for a phantom side, which inflates the denominator the
-- page divides by and shows a percentage split against a seat that does not
-- exist. Verified against the live project: with the predicate absent, clearing
-- one of two votes left `[{choice:"__none__",votes:1},{choice:"SEATX",votes:1}]`
-- instead of `[{choice:"SEATX",votes:1}]`.
--
-- `__none__` is safe as a sentinel because `choice` only ever holds a Sleeper
-- `user_id`, which is a decimal snowflake string. No real seat can collide with
-- it. It is not stored NULL because `choice` is `not null` and, more usefully,
-- because a sentinel keeps one row per (trade, voter) for the whole life of that
-- voter's opinion — including the fact that they withdrew it.
create or replace view public.trade_vote_tallies
  with (security_invoker = true)
  as
    select
      transaction_id,
      choice,
      count(*)::int as votes
    from public.trade_votes
    where choice <> '__none__'
    group by transaction_id, choice;


-- ============================================================================
-- 4. Grants
-- ============================================================================
-- Supabase's bootstrap usually grants the anon role broad table privileges in
-- `public` already and relies on RLS to gate them. These statements are
-- explicit anyway, so this file describes the intended access on its own
-- rather than depending on project defaults.
grant usage on schema public to anon;
grant select, insert, update on table public.trade_votes to anon;
grant select on table public.trade_vote_tallies to anon;

-- DELETE is redundant with the missing DELETE policy, but revoked so the
-- intent is recorded in one place.
--
-- TRUNCATE is the one that genuinely needs revoking: TRUNCATE is NOT subject
-- to RLS, so a broad `grant all` would leave the table wipeable by privilege
-- alone. It is not reachable through the REST API — PostgREST offers no SQL
-- passthrough — so this is defense in depth against a future RPC, not a hole
-- being closed.
revoke delete, truncate on table public.trade_votes from anon;


-- ============================================================================
-- 5. news_submissions — a tweet a league member shared into the feed
-- ============================================================================
-- One row per "I saw this on X and the league should see it". An iOS Shortcut
-- POSTs here from the share sheet; news-sync.mjs reads the unprocessed rows,
-- fetches the tweet's text from X's oEmbed endpoint, and publishes the result
-- into data/ui/news.json alongside the automated items.
--
-- THE ANON KEY IS NOT A SECURITY BOUNDARY ON THIS TABLE EITHER, and it matters
-- more here than it does for votes. A vote is a number in a tally. This table
-- feeds TEXT THAT GETS RENDERED ON THE PAGE. Anyone holding the anon key —
-- which is in the page source, so: anyone — can insert a row, and that row's
-- URL will be fetched by the build and its tweet text will be published. There
-- is no author check, because without Supabase Auth there is nothing to check
-- against. The mitigations are downstream, not here:
--
--   * `url` must match an x.com/twitter.com status URL (constraint below), so
--     the build cannot be pointed at an arbitrary host to fetch.
--   * The published text is whatever X returns for a real public tweet. It is
--     escaped at render time, in text and in attributes, and the tweet's HTML
--     is never injected — news-sync.mjs strips it to text.
--   * A submission publishes; it does not move a number. PRODUCT LAW holds.
--
-- Acceptable for ten friends who all know each other, on the same reasoning as
-- votes. Not a pattern to copy where the data matters.
--
-- `target_name` holds a MANAGER DISPLAY NAME, not a `user_id`, which is a
-- deliberate inversion of the rule `trade_votes.choice` follows. The reason is
-- the client: this row is written by an iOS Shortcut off a share sheet, and
-- making a human pick a 18-digit snowflake out of a list on a phone is how the
-- feature goes unused. The name is resolved to a `user_id` server-side in
-- news-sync.mjs, which is the one place that can fail loudly and fall back to
-- publishing the item addressed to nobody. A name that no longer matches a
-- member therefore costs attribution on one row, not a wrong attribution.

-- WHY THIS SECTION IS WRITTEN AS create-THEN-CONVERGE, AND NOT AS ONE
-- create table WITH THE CONSTRAINTS INLINE
--
-- `create table if not exists` does exactly nothing when a table of that name
-- already exists — including when that table is missing every constraint below
-- it. It does not compare shapes and it does not warn. So a file that declares
-- its constraints inline is idempotent in the trivial sense (it runs twice
-- without erroring) while being useless in the sense that matters: run it
-- against a project where a `news_submissions` already exists and you get a
-- clean "success" and none of the protection.
--
-- That is not hypothetical here. On 2026-08-30 this project already had a
-- `news_submissions` with exactly these seven column names and NONE of the
-- constraints, policies or grants: it accepted `https://evil.com/a/status/1`,
-- had no unique constraint, and let the anon key rewrite the `url` of an
-- existing row. An inline-only version of this file would have reported
-- success against it and changed nothing.
--
-- So every constraint, index, policy and grant below is applied SEPARATELY and
-- idempotently, and the create is only responsible for the columns. Running
-- this file brings a pre-existing table up to spec rather than skipping it.

create table if not exists public.news_submissions (
  id           bigint generated always as identity primary key,
  url          text        not null,
  note         text,
  target_name  text,
  submitted_by text,
  created_at   timestamptz not null default now(),
  -- NULL until news-sync.mjs has published this row. The pipeline stamps it so
  -- a submission is ingested exactly once; see the column-level grant below for
  -- why this is the only column anon is allowed to change.
  processed_at timestamptz
);

-- Converge the columns, for a table that predates this file. `add column if not
-- exists` is a no-op on a fresh create and fills the gaps on an older one.
alter table public.news_submissions add column if not exists note         text;
alter table public.news_submissions add column if not exists target_name  text;
alter table public.news_submissions add column if not exists submitted_by text;
alter table public.news_submissions add column if not exists created_at   timestamptz not null default now();
alter table public.news_submissions add column if not exists processed_at timestamptz;
-- Soft-delete. Anon has no DELETE (see 5d); removing a post from the feed is a stamp on
-- these columns, the same shape as clearing a vote with `__none__`. news-sync skips any row
-- with deleted_at set, and the page hides it as soon as the admin PATCH lands.
alter table public.news_submissions add column if not exists deleted_at   timestamptz;
alter table public.news_submissions add column if not exists deleted_by   text;
-- Private coaching for the smack/summary agent. Not shown on the feed row (that is `note`).
-- See docs/SMACK_AGENT.md. Optional Shortcut Ask → agent_tip; news-sync appends data/smack-tips.json.
alter table public.news_submissions add column if not exists agent_tip    text;


-- --------------------------------------------------------------------------
-- 5a. The check constraints, applied separately so they reach an old table too
-- --------------------------------------------------------------------------
-- `url` is http(s) only and only a tweet permalink on a host we recognise.
-- This is the constraint that keeps the build from being aimed at an arbitrary
-- URL: news-sync.mjs re-validates the same shape before it fetches, but a row
-- that could never satisfy this check cannot reach the pipeline in the first
-- place. `~*` is a case-insensitive POSIX regex.
--
-- The tail is enumerated rather than left as `([?#/].*)?$`. The looser version
-- accepted `…/status/12/../../evil`, because a traversal is just more path. It
-- could not have escaped the host, so it was never an SSRF, but a URL that is
-- not a permalink has no business being stored as one.
--
-- Two real share-sheet forms have to survive that tightening: `?s=20&t=…`,
-- which iOS appends to every share, and `/photo/1` or `/video/1`, which is what
-- the sheet produces when the share starts from the media rather than the
-- tweet. Both still identify the same tweet, and news-sync.mjs rebuilds the
-- canonical `https://x.com/<handle>/status/<id>` from the captured parts before
-- it fetches anything, so the stored suffix is never what gets used.
--
-- Each is added NOT VALID and then validated in a separate step that downgrades
-- failure to a warning. The reason is the pre-existing table described above:
-- it may already hold rows that violate these checks, and a plain `add
-- constraint` against one of them aborts the whole script — which would mean a
-- single junk row from before this file existed permanently blocks the setup
-- that would have prevented it. NOT VALID still enforces the check on every
-- INSERT and UPDATE from this moment on, so the protection is live either way;
-- validation only decides whether the *existing* rows are certified. If it
-- fails you get a WARNING naming the constraint, and the query to find the
-- offending rows is in docs/SUPABASE_SETUP.md.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('news_submissions_url_len',
       'check (length(url) between 12 and 500)'),
      ('news_submissions_url_shape',
       'check (url ~* ''^https?://(www\.)?(x|twitter)\.com/[A-Za-z0-9_]{1,15}/status(es)?/[0-9]{1,25}(/(photo|video)/[0-9]{1,2})?/?([?#].*)?$'')'),
      -- Length bounds only. Not an identity check, and not a content check:
      -- `note` is free text a person typed and is escaped at render time.
      ('news_submissions_note_len',
       'check (note is null or length(note) between 1 and 500)'),
      -- Private coaching for the smack agent — not rendered on the feed (see docs/SMACK_AGENT.md).
      ('news_submissions_agent_tip_len',
       'check (agent_tip is null or length(agent_tip) between 1 and 500)'),
      ('news_submissions_target_name_len',
       'check (target_name is null or length(target_name) between 1 and 64)'),
      ('news_submissions_submitted_by_len',
       'check (submitted_by is null or length(submitted_by) between 1 and 64)'),
      ('news_submissions_deleted_by_len',
       'check (deleted_by is null or length(deleted_by) between 1 and 64)')
    ) as t(name, body)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.news_submissions'::regclass and conname = c.name
    ) then
      execute format('alter table public.news_submissions add constraint %I %s not valid', c.name, c.body);
    end if;
    begin
      execute format('alter table public.news_submissions validate constraint %I', c.name);
    exception when check_violation then
      raise warning 'news_submissions: existing rows violate %; it is enforced for new rows only. See docs/SUPABASE_SETUP.md to find them.', c.name;
    end;
  end loop;
end $$;


-- --------------------------------------------------------------------------
-- 5a.1. Canonicalise `url` on write, so the uniqueness rule below can work
-- --------------------------------------------------------------------------
-- Every URL an iOS share sheet produces carries tracking:
--
--   https://x.com/adamschefter/status/2094028581080834282?s=12&t=6MCtlgACvPE…
--
-- `t` is regenerated per share. So one person tapping Share twice on the same
-- tweet produces two different strings, and the (url, submitted_by) constraint
-- in 5b — whose entire stated purpose is to make a double tap or a Shortcut
-- retry a no-op — never fires. It was not firing: ids 14 and 16 in this
-- project's own table are the same tweet, from the same submitter, minutes
-- apart, both stored, because their `t` values differ.
--
-- The shape check in 5a deliberately *accepts* those suffixes, because
-- rejecting a real share is worse than storing a noisy one. Accepting them and
-- then treating them as identifying is the mistake. So the row is normalised
-- before it is stored, and uniqueness compares tweets rather than strings.
--
-- The rewrite is the same one news-sources.mjs `parseTweetUrl()` performs, and
-- deliberately so: both rebuild `https://x.com/<handle>/status/<id>` from the
-- captured parts, so the value in the table equals the value the pipeline
-- derives and the build's canonical-form self-check cannot disagree with the
-- database. Case is preserved for the same reason — the pipeline preserves it,
-- and the two must not diverge. Two spellings of one handle are collapsed
-- downstream, on the tweet id, where a display detail cannot cause a duplicate.
--
-- A URL the pattern does not match is left exactly as submitted: normalising is
-- not this trigger's opinion about validity. 5a's check constraint is what
-- refuses a bad row, and it runs regardless.
create or replace function public.news_submissions_canonical_url()
returns trigger
language plpgsql
as $$
declare
  parts text[];
begin
  parts := regexp_match(
    new.url,
    '^https?://(?:www\.)?(?:x|twitter)\.com/([A-Za-z0-9_]{1,15})/status(?:es)?/([0-9]{1,25})',
    'i');
  if parts is not null then
    new.url := 'https://x.com/' || parts[1] || '/status/' || parts[2];
  end if;
  return new;
end $$;

drop trigger if exists news_submissions_canonical_url_t on public.news_submissions;
create trigger news_submissions_canonical_url_t
  before insert or update of url on public.news_submissions
  for each row execute function public.news_submissions_canonical_url();


-- --------------------------------------------------------------------------
-- 5b. Uniqueness: (url, submitted_by), NOT url alone
-- --------------------------------------------------------------------------
-- THE DECISION, AND WHY.
--
-- A unique constraint on `url` alone would stop the same tweet ever being
-- added twice. It would also stop two league members putting their own jab on
-- the same tweet — and the second person's row is not a duplicate, it is the
-- content. Two managers reacting to one Schefter tweet is the feature working.
--
-- The duplicate that actually happens is narrower than that: one person taps
-- Share twice, or the Shortcut retries on a flaky LTE connection and POSTs the
-- identical body again. That collision is (same url, same submitter), so that
-- is what the constraint covers.
--
-- `nulls not distinct` is required and is the whole reason this works. By the
-- SQL default, two NULLs are distinct, so without it a submitter who does not
-- send `submitted_by` — which is optional, and a Shortcut may well not send it
-- — would defeat the constraint entirely and every retry would insert a new
-- row. Requires PostgreSQL 15+; Supabase is well past that.
--
-- What this deliberately does NOT do is collapse two people's takes on one
-- tweet into one feed row. That is handled downstream in news-sync.mjs, which
-- dedupes a submission against automated items about the same player and
-- category within a few hours, and can be tuned without a migration.
--
-- Naming the constraint (rather than creating a bare unique index) is what lets
-- the client send `?on_conflict=url,submitted_by`, which is how a retry becomes
-- a no-op instead of an error — see 5e.
--
-- A unique constraint cannot be added NOT VALID, so unlike the checks above
-- this one can genuinely fail on a pre-existing table that already holds
-- duplicates. That is trapped and downgraded to a warning for the same reason:
-- old junk must not block the rest of the setup. Without the constraint the
-- Shortcut's `on_conflict` request is the thing that breaks, loudly, rather
-- than anything silently going unprotected.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.news_submissions'::regclass
      and conname  = 'news_submissions_url_submitted_by_key'
  ) then
    begin
      alter table public.news_submissions
        add constraint news_submissions_url_submitted_by_key
        unique nulls not distinct (url, submitted_by);
    exception when unique_violation then
      raise warning 'news_submissions: existing duplicate (url, submitted_by) rows blocked the unique constraint. De-duplicate them and re-run this file; until then the Shortcut must POST without on_conflict.';
    end;
  end if;
end $$;

-- The feed reads the whole table, newest first, capped: since the feed became
-- manual submissions only, "rows nobody has published yet" is the wrong set —
-- news.json is rebuilt from scratch each run, so reading only the unpublished
-- rows would empty the feed on the second build. See fetchSubmissions() in
-- news-sources.mjs.
create index if not exists news_submissions_created_idx
  on public.news_submissions (created_at desc);

-- Kept for the "what is still unpublished" query, which is now bookkeeping
-- rather than the feed's read path. A partial index over exactly those rows
-- stays small no matter how long the table grows.
create index if not exists news_submissions_unprocessed_idx
  on public.news_submissions (created_at)
  where processed_at is null;


-- --------------------------------------------------------------------------
-- 5c. Row Level Security
-- --------------------------------------------------------------------------
-- Same shape as trade_votes, with one difference that is the point of the
-- table: there is NO general UPDATE grant, so a submission's url, note and
-- target cannot be rewritten after the fact. The only columns anon may change
-- are `processed_at` (the pipeline stamp) and `deleted_at` / `deleted_by` (the
-- admin soft-delete), enforced by the COLUMN-LEVEL GRANT in section 5d rather
-- than by the policy, because RLS cannot see which columns a statement touched.
--
-- And, as with trade_votes: NO DELETE. Nobody can erase a row through the REST
-- API. Removing a post from the feed is a soft-delete stamp, not a DELETE.
alter table public.news_submissions enable row level security;

-- INSERT: anyone with the anon key may submit. This is the write-open surface
-- described in the header. The table's own constraints are the only filter.
drop policy if exists news_submissions_anon_insert on public.news_submissions;
create policy news_submissions_anon_insert
  on public.news_submissions
  for insert
  to anon
  with check (true);

-- SELECT: the build reads the queue with the anon key, so it needs this. It
-- also means submissions are public to anyone with the key, including the
-- private jab in `note` before it is published. That is true of everything in
-- this database and is stated here so it is not a surprise.
drop policy if exists news_submissions_anon_select on public.news_submissions;
create policy news_submissions_anon_select
  on public.news_submissions
  for select
  to anon
  using (true);

-- UPDATE: exists only so the pipeline can stamp `processed_at`. Both halves
-- are `true` for the same reason they are on trade_votes — the row must be
-- visible before the update and acceptable after it — and the actual narrowing
-- is the column grant below, not this policy.
drop policy if exists news_submissions_anon_update on public.news_submissions;
create policy news_submissions_anon_update
  on public.news_submissions
  for update
  to anon
  using (true)
  with check (true);


-- --------------------------------------------------------------------------
-- 5d. Grants
-- --------------------------------------------------------------------------
-- The column-level UPDATE grant is the load-bearing line: anon may write
-- `processed_at`, `deleted_at` and `deleted_by`, and nothing else. An attempt
-- to PATCH `url` or `note` fails on privileges before RLS is consulted.
--
-- The `revoke update` immediately before it is not decoration and must not be
-- deleted as redundant. A table-wide `grant update` and a column-level one are
-- separate entries in the privilege list, and granting the column does NOT
-- remove the table-wide grant — so on the pre-existing table described at the
-- top of this section, which had table-wide UPDATE, `grant update
-- (processed_at)` alone would leave `url` rewritable and this file would again
-- report success while changing nothing that mattered. Revoke first, then
-- grant the allowed columns.
--
-- Section 1b warns off column-level grants on the votes path, and that warning
-- does not apply here — it is worth saying why, because the two paths
-- look similar. The votes path is `INSERT ... ON CONFLICT DO UPDATE`, and
-- PostgREST generates a `DO UPDATE SET` listing every column in the payload,
-- so any column outside the grant list fails the whole statement. This table
-- never does that: submissions insert with `ON CONFLICT DO NOTHING` (5e), which
-- performs no update at all, and the pipeline's stamp / the admin soft-delete
-- are plain PATCHes whose payloads name only granted columns. Neither statement
-- can touch a column outside the grant.
--
-- Soft-delete is not real auth. The UI only offers Remove to TrumanCooper's
-- remembered seat; anyone holding the anon key can still PATCH these columns.
-- That is the same honesty as the insert surface, stated here so it is not a
-- surprise. Acceptable for ten friends; not a pattern to copy where the data
-- matters.
grant select, insert on table public.news_submissions to anon;
revoke update on table public.news_submissions from anon;
grant update (processed_at, deleted_at, deleted_by) on table public.news_submissions to anon;

-- Hard DELETE stays revoked so no member can erase a row — the same trade
-- trade_votes makes. Soft-delete is the remove path. TRUNCATE is not subject
-- to RLS, so revoking it is the one that closes a real hole rather than
-- restating a closed one.
revoke delete, truncate on table public.news_submissions from anon;

-- Partial index for the feed's "still visible" read. Soft-deleted rows stay in
-- the table for audit; the build and the page both ask for deleted_at is null.
create index if not exists news_submissions_alive_idx
  on public.news_submissions (created_at desc)
  where deleted_at is null;


-- --------------------------------------------------------------------------
-- 5e. The exact request the iOS Shortcut sends
-- --------------------------------------------------------------------------
-- POST https://<project>.supabase.co/rest/v1/news_submissions
--        ?on_conflict=url,submitted_by
--   apikey:        <anon key>
--   Authorization: Bearer <anon key>
--   Content-Type:  application/json
--   Prefer:        resolution=ignore-duplicates,return=minimal
--
--   { "url": "https://x.com/AdamSchefter/status/123",
--     "note": "your TE is cooked",          -- optional public jab on the row
--     "agent_tip": "lean harder — he overdrafted this guy",  -- optional private coaching
--     "target_name": "SF69erss",            -- optional, a members.json name
--     "submitted_by": "BubbaCuckShremp" }   -- optional
--
-- One-tap Shortcut sends only url + submitted_by. agent_tip is the Ask/Dictation path
-- documented in docs/SUPABASE_SETUP.md §3b and docs/SMACK_AGENT.md.
--
-- The pipeline's stamp, for the record:
--   PATCH .../news_submissions?id=eq.<id>   {"processed_at": "<iso8601>"}


-- ============================================================================
-- 6. PATTERN FOR FUTURE TABLES  (nothing below this line executes)
-- ============================================================================
-- This database is meant to hold more than votes. Every future table should
-- repeat the same five moves, in this order:
--
--   1. create table if not exists           — idempotent
--   2. guarded unique constraint             — if the client needs to upsert
--   3. enable row level security             — default-deny
--   4. drop policy if exists / create policy — one per verb, `to anon`
--   5. explicit grants, revoke truncate      — and revoke delete unless wanted
--
-- Only grant the verbs the feature actually needs. A write-once table wants
-- INSERT and SELECT and no UPDATE policy at all; skipping UPDATE is what makes
-- it write-once, and it means the REST upsert will NOT work on that table.
--
-- The same honesty applies to anything added here: with no Supabase Auth, any
-- "who did this" column is client-asserted and unverifiable. Do not build a
-- feature that needs to trust one.
--
-- And PRODUCT LAW still holds: a table added here holds opinion or side data.
-- It does not feed the needle, the even book, the Value Adjustment, the lens
-- windows, `today_delta`, partner grades, or any ranking.
--
-- Worked example — free-text reactions to a trade. Uncomment, rename, adjust.
-- It is left commented so that running this file creates only trade_votes.
--
--   create table if not exists public.trade_notes (
--     id             bigint generated always as identity primary key,
--     transaction_id text        not null,
--     author         text        not null,   -- client-asserted, unverifiable
--     body           text        not null,
--     created_at     timestamptz not null default now(),
--     updated_at     timestamptz not null default now(),
--     constraint trade_notes_transaction_id_len check (length(transaction_id) between 1 and 64),
--     constraint trade_notes_author_len         check (length(author)         between 1 and 64),
--     constraint trade_notes_body_len           check (length(body)           between 1 and 2000)
--   );
--
--   -- One note per author per trade, so editing a note is an upsert. Drop
--   -- this constraint if you want many notes per author instead — but then
--   -- the client must POST plain inserts, not merge-duplicates.
--   do $$
--   begin
--     if not exists (
--       select 1 from pg_constraint
--       where conrelid = 'public.trade_notes'::regclass
--         and conname  = 'trade_notes_transaction_id_author_key'
--     ) then
--       alter table public.trade_notes
--         add constraint trade_notes_transaction_id_author_key
--         unique (transaction_id, author);
--     end if;
--   end $$;
--
--   create or replace function public.trade_notes_touch_updated_at()
--   returns trigger language plpgsql as $fn$
--   begin
--     new.updated_at := now();
--     new.created_at := old.created_at;
--     return new;
--   end $fn$;
--
--   drop trigger if exists trade_notes_touch_updated_at on public.trade_notes;
--   create trigger trade_notes_touch_updated_at
--     before update on public.trade_notes
--     for each row execute function public.trade_notes_touch_updated_at();
--
--   alter table public.trade_notes enable row level security;
--
--   drop policy if exists trade_notes_anon_insert on public.trade_notes;
--   create policy trade_notes_anon_insert on public.trade_notes
--     for insert to anon with check (true);
--
--   drop policy if exists trade_notes_anon_update on public.trade_notes;
--   create policy trade_notes_anon_update on public.trade_notes
--     for update to anon using (true) with check (true);
--
--   drop policy if exists trade_notes_anon_select on public.trade_notes;
--   create policy trade_notes_anon_select on public.trade_notes
--     for select to anon using (true);
--
--   grant select, insert, update on table public.trade_notes to anon;
--   revoke delete, truncate on table public.trade_notes from anon;
--
-- ============================================================================
