-- ============================================================================
-- Multi-league app — leagues, profiles, memberships
-- ============================================================================
-- Paste after db/phase1-seat-auth.sql (Auth + seat_profiles for votes may already
-- exist). Idempotent. Walkthrough: docs/APP_SDD.md and docs/SUPABASE_SETUP.md §8.
--
-- Product shape (Chuckle Fantasy):
--   Get started → Sleeper and/or ESPN user ID + username/password
--   Add league → Sleeper league ID → seat matched from Sleeper user ID
--   CuckleChunckle: enter league ID 1315431339301806080, then account → dashboard
--   One Auth user can join many leagues; one seat per league is unique.
-- ============================================================================


-- --------------------------------------------------------------------------
-- 1. app_profiles — username for the Auth user
-- --------------------------------------------------------------------------
create table if not exists public.app_profiles (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  username     text        not null,
  sleeper_user_id text,
  espn_user_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint app_profiles_username_len check (length(username) between 3 and 32),
  constraint app_profiles_username_shape check (username ~ '^[A-Za-z0-9_][A-Za-z0-9_.-]{2,31}$'),
  constraint app_profiles_sleeper_len check (sleeper_user_id is null or length(sleeper_user_id) between 1 and 64),
  constraint app_profiles_espn_len check (espn_user_id is null or length(espn_user_id) between 1 and 64),
  -- At least one platform identity is required to get started.
  constraint app_profiles_platform_required check (
    sleeper_user_id is not null or espn_user_id is not null
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_profiles'::regclass
      and conname  = 'app_profiles_username_key'
  ) then
    alter table public.app_profiles
      add constraint app_profiles_username_key unique (username);
  end if;
end $$;

alter table public.app_profiles enable row level security;

drop policy if exists app_profiles_select_authenticated on public.app_profiles;
create policy app_profiles_select_authenticated
  on public.app_profiles for select to authenticated
  using (true);

drop policy if exists app_profiles_select_anon on public.app_profiles;
create policy app_profiles_select_anon
  on public.app_profiles for select to anon
  using (true);

drop policy if exists app_profiles_insert_own on public.app_profiles;
create policy app_profiles_insert_own
  on public.app_profiles for insert to authenticated
  with check (auth_user_id = auth.uid());

drop policy if exists app_profiles_update_own on public.app_profiles;
create policy app_profiles_update_own
  on public.app_profiles for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

grant select on table public.app_profiles to anon, authenticated;
grant insert, update on table public.app_profiles to authenticated;
revoke delete, truncate on table public.app_profiles from anon, authenticated;


-- --------------------------------------------------------------------------
-- 2. leagues — one row per Sleeper league using the app
-- --------------------------------------------------------------------------
create table if not exists public.leagues (
  sleeper_league_id text primary key,
  name              text        not null,
  season            text,
  sport             text,
  total_rosters     int,
  status            text        not null default 'pending_sync',
  created_at        timestamptz not null default now(),
  synced_at         timestamptz,
  constraint leagues_id_len check (length(sleeper_league_id) between 1 and 64),
  constraint leagues_name_len check (length(name) between 1 and 128),
  constraint leagues_status_ok check (status in ('pending_sync', 'ready', 'error'))
);

alter table public.leagues enable row level security;

-- Anyone signed in can see leagues that exist (needed to join / switch).
drop policy if exists leagues_select_authenticated on public.leagues;
create policy leagues_select_authenticated
  on public.leagues for select to authenticated
  using (true);

drop policy if exists leagues_select_anon on public.leagues;
create policy leagues_select_anon
  on public.leagues for select to anon
  using (true);

-- Inserts/updates go through the join-league Edge Function (service role) or
-- a signed-in user creating a pending row they are about to join.
drop policy if exists leagues_insert_authenticated on public.leagues;
create policy leagues_insert_authenticated
  on public.leagues for insert to authenticated
  with check (true);

drop policy if exists leagues_update_authenticated on public.leagues;
create policy leagues_update_authenticated
  on public.leagues for update to authenticated
  using (true)
  with check (true);

grant select, insert, update on table public.leagues to authenticated;
grant select on table public.leagues to anon;
revoke delete, truncate on table public.leagues from anon, authenticated;


-- --------------------------------------------------------------------------
-- 3. league_memberships — Auth user ↔ seat in a league
-- --------------------------------------------------------------------------
create table if not exists public.league_memberships (
  id                bigint generated always as identity primary key,
  auth_user_id      uuid        not null references auth.users (id) on delete cascade,
  sleeper_league_id text        not null references public.leagues (sleeper_league_id) on delete cascade,
  sleeper_user_id   text        not null,
  team_name         text        not null,
  created_at        timestamptz not null default now(),
  constraint league_memberships_user_len check (length(sleeper_user_id) between 1 and 64),
  constraint league_memberships_team_len check (length(team_name) between 1 and 64)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.league_memberships'::regclass
      and conname  = 'league_memberships_auth_league_key'
  ) then
    alter table public.league_memberships
      add constraint league_memberships_auth_league_key
      unique (auth_user_id, sleeper_league_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.league_memberships'::regclass
      and conname  = 'league_memberships_seat_key'
  ) then
    alter table public.league_memberships
      add constraint league_memberships_seat_key
      unique (sleeper_league_id, sleeper_user_id);
  end if;
end $$;

create index if not exists league_memberships_auth_idx
  on public.league_memberships (auth_user_id);

alter table public.league_memberships enable row level security;

drop policy if exists league_memberships_select_own on public.league_memberships;
create policy league_memberships_select_own
  on public.league_memberships for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists league_memberships_insert_own on public.league_memberships;
create policy league_memberships_insert_own
  on public.league_memberships for insert to authenticated
  with check (auth_user_id = auth.uid());

drop policy if exists league_memberships_delete_own on public.league_memberships;
create policy league_memberships_delete_own
  on public.league_memberships for delete to authenticated
  using (auth_user_id = auth.uid());

grant select, insert, delete on table public.league_memberships to authenticated;
revoke update, truncate on table public.league_memberships from authenticated;
revoke all on table public.league_memberships from anon;


-- --------------------------------------------------------------------------
-- 4. Bridge Phase 1 vote identity to multi-league seats
-- --------------------------------------------------------------------------
-- Keep seat_profiles in sync when a membership is created so trade_votes RLS
-- (auth → seat_user_id) still works. One Auth user may sit in several leagues;
-- vote rows key on sleeper user_id (globally unique snowflakes) + transaction_id.
-- When the same human has different Sleeper user_ids across leagues (rare),
-- seat_profiles stores their *active* seat — the page sends the membership seat
-- as voter and the force_voter trigger uses seat_profiles. Prefer updating
-- seat_profiles on league switch from the client via upsert of the active seat.
--
-- For multi-seat users, widen seat_profiles to allow multiple seats later.
-- Phase now: one active seat_user_id per auth user (last joined / last switched).

create or replace function public.sync_seat_profile_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.seat_profiles (auth_user_id, seat_user_id, seat_name)
  values (new.auth_user_id, new.sleeper_user_id, new.team_name)
  on conflict (auth_user_id) do update
    set seat_user_id = excluded.seat_user_id,
        seat_name    = excluded.seat_name;
  return new;
end $$;

drop trigger if exists league_memberships_sync_seat on public.league_memberships;
create trigger league_memberships_sync_seat
  after insert on public.league_memberships
  for each row execute function public.sync_seat_profile_from_membership();


-- --------------------------------------------------------------------------
-- 5. Seed CuckleChunckle as the first hosted league
-- --------------------------------------------------------------------------
insert into public.leagues (sleeper_league_id, name, season, sport, total_rosters, status)
values ('1315431339301806080', 'CuckleChunckle', '2026', 'nfl', 10, 'ready')
on conflict (sleeper_league_id) do update
  set name = excluded.name,
      season = excluded.season,
      status = 'ready';


-- --------------------------------------------------------------------------
-- 6. Platform IDs on existing app_profiles (idempotent converge)
-- --------------------------------------------------------------------------
alter table public.app_profiles add column if not exists sleeper_user_id text;
alter table public.app_profiles add column if not exists espn_user_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_profiles'::regclass
      and conname = 'app_profiles_sleeper_len'
  ) then
    alter table public.app_profiles
      add constraint app_profiles_sleeper_len
      check (sleeper_user_id is null or length(sleeper_user_id) between 1 and 64) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_profiles'::regclass
      and conname = 'app_profiles_espn_len'
  ) then
    alter table public.app_profiles
      add constraint app_profiles_espn_len
      check (espn_user_id is null or length(espn_user_id) between 1 and 64) not valid;
  end if;
  begin
    alter table public.app_profiles validate constraint app_profiles_sleeper_len;
  exception when check_violation then
    raise warning 'app_profiles_sleeper_len: existing rows violate; enforced for new rows only';
  end;
  begin
    alter table public.app_profiles validate constraint app_profiles_espn_len;
  exception when check_violation then
    raise warning 'app_profiles_espn_len: existing rows violate; enforced for new rows only';
  end;
  -- Platform-required: only add if no orphan profiles lack both IDs.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_profiles'::regclass
      and conname = 'app_profiles_platform_required'
  ) then
    begin
      alter table public.app_profiles
        add constraint app_profiles_platform_required
        check (sleeper_user_id is not null or espn_user_id is not null) not valid;
      alter table public.app_profiles validate constraint app_profiles_platform_required;
    exception when check_violation then
      raise warning 'app_profiles_platform_required blocked by rows missing both platform IDs; fill them then re-run';
    end;
  end if;
end $$;

create unique index if not exists app_profiles_sleeper_user_uidx
  on public.app_profiles (sleeper_user_id)
  where sleeper_user_id is not null;

create unique index if not exists app_profiles_espn_user_uidx
  on public.app_profiles (espn_user_id)
  where espn_user_id is not null;
