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
-- anon key with no policy involved at all. That is why the pattern in section 5
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
-- 5. PATTERN FOR FUTURE TABLES  (nothing below this line executes)
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
