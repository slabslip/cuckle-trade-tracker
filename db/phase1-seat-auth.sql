-- ============================================================================
-- Phase 1 — claimed-seat auth for trade votes
-- ============================================================================
-- Paste this into the Supabase SQL editor after db/schema.sql has already been
-- applied (it has, on the live project). Safe to re-run.
--
-- What this does:
--   1. seat_profiles — maps auth.users → Sleeper seat user_id
--   2. Narrows trade_votes writes to the authenticated role only
--   3. Forces voter = the caller's claimed seat (client cannot assert another)
--   4. Leaves tallies publicly readable (anon SELECT stays)
--
-- After this file: run `node seed-seat-auth.mjs` with SUPABASE_SERVICE_ROLE_KEY
-- to create the ten Auth users and print invite codes. Walkthrough:
-- docs/SUPABASE_SETUP.md §7 and docs/CUSTOM_DOMAIN.md.
-- ============================================================================


-- --------------------------------------------------------------------------
-- 1. seat_profiles
-- --------------------------------------------------------------------------
-- Seeded only by the service_role script. The browser never inserts here.
-- authenticated may read their own row so the page can confirm seat identity
-- after a token refresh.

create table if not exists public.seat_profiles (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  seat_user_id text        not null,
  seat_name    text        not null,
  created_at   timestamptz not null default now(),
  constraint seat_profiles_seat_user_id_len check (length(seat_user_id) between 1 and 64),
  constraint seat_profiles_seat_name_len    check (length(seat_name)    between 1 and 64)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seat_profiles'::regclass
      and conname  = 'seat_profiles_seat_user_id_key'
  ) then
    alter table public.seat_profiles
      add constraint seat_profiles_seat_user_id_key unique (seat_user_id);
  end if;
end $$;

alter table public.seat_profiles enable row level security;

drop policy if exists seat_profiles_select_own on public.seat_profiles;
create policy seat_profiles_select_own
  on public.seat_profiles
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE for anon or authenticated. Seeding is service_role only.
grant select on table public.seat_profiles to authenticated;
revoke insert, update, delete, truncate on table public.seat_profiles from anon;
revoke insert, update, delete, truncate on table public.seat_profiles from authenticated;


-- --------------------------------------------------------------------------
-- 2. Force voter from the claimed seat
-- --------------------------------------------------------------------------
-- Belt-and-braces with the RLS with-check below. Even if a client sends a
-- different voter string, the row is rewritten to their seat before insert/
-- update. auth.uid() is null for the anon key — those writes are rejected by
-- RLS after section 3 drops the open anon policies.

create or replace function public.trade_votes_force_voter()
returns trigger
language plpgsql
as $$
declare
  sid text;
begin
  select p.seat_user_id into sid
  from public.seat_profiles p
  where p.auth_user_id = auth.uid();

  if sid is null then
    raise exception 'trade_votes: no claimed seat for this session';
  end if;

  new.voter := sid;
  return new;
end $$;

drop trigger if exists trade_votes_force_voter on public.trade_votes;
create trigger trade_votes_force_voter
  before insert or update on public.trade_votes
  for each row execute function public.trade_votes_force_voter();


-- --------------------------------------------------------------------------
-- 3. Narrow trade_votes writes to authenticated + claimed seat
-- --------------------------------------------------------------------------
-- Drop the Phase-0 open policies. Anon keeps SELECT so anyone can read the
-- public tally without signing in. Writes require a claimed seat.

drop policy if exists trade_votes_anon_insert on public.trade_votes;
drop policy if exists trade_votes_anon_update on public.trade_votes;

-- SELECT stays public (re-assert for clarity; idempotent drop/create).
drop policy if exists trade_votes_anon_select on public.trade_votes;
create policy trade_votes_anon_select
  on public.trade_votes
  for select
  to anon
  using (true);

drop policy if exists trade_votes_authenticated_select on public.trade_votes;
create policy trade_votes_authenticated_select
  on public.trade_votes
  for select
  to authenticated
  using (true);

drop policy if exists trade_votes_auth_insert on public.trade_votes;
create policy trade_votes_auth_insert
  on public.trade_votes
  for insert
  to authenticated
  with check (
    voter = (select p.seat_user_id from public.seat_profiles p where p.auth_user_id = auth.uid())
  );

-- Upsert needs both halves of UPDATE (see original schema §2 comments).
drop policy if exists trade_votes_auth_update on public.trade_votes;
create policy trade_votes_auth_update
  on public.trade_votes
  for update
  to authenticated
  using (
    voter = (select p.seat_user_id from public.seat_profiles p where p.auth_user_id = auth.uid())
  )
  with check (
    voter = (select p.seat_user_id from public.seat_profiles p where p.auth_user_id = auth.uid())
  );

grant select on table public.trade_votes to anon;
grant select, insert, update on table public.trade_votes to authenticated;
grant select on table public.trade_vote_tallies to anon;
grant select on table public.trade_vote_tallies to authenticated;

revoke insert, update, delete, truncate on table public.trade_votes from anon;
revoke delete, truncate on table public.trade_votes from authenticated;


-- --------------------------------------------------------------------------
-- 4. Optional: clear legacy unverified ballots before go-live
-- --------------------------------------------------------------------------
-- Uncomment once, run, then re-comment. Wipes device-UUID and client-asserted
-- seat votes from Phase 0 so the tally starts clean under claimed seats.
--
--   truncate public.trade_votes restart identity;
