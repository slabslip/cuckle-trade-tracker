-- ============================================================================
-- Chuckle Fantasy — commissioner + per-seat invites
-- ============================================================================
-- Run after db/multi-league-app.sql (or together). Idempotent.
--
-- Model:
--   One commissioner creates the league (Sleeper league ID + optional ESPN league ID).
--   Sleeper roster → one invite code per seat. Members redeem code → username/password
--   (no Sleeper/ESPN IDs required for members). Seat is already bound on the invite.
-- ============================================================================


-- --------------------------------------------------------------------------
-- 1. Relax app_profiles: platform IDs optional (members need not enter them)
-- --------------------------------------------------------------------------
alter table public.app_profiles add column if not exists sleeper_user_id text;
alter table public.app_profiles add column if not exists espn_user_id text;

alter table public.app_profiles drop constraint if exists app_profiles_platform_required;


-- --------------------------------------------------------------------------
-- 2. League creator + optional ESPN league id
-- --------------------------------------------------------------------------
alter table public.leagues add column if not exists created_by uuid references auth.users (id);
alter table public.leagues add column if not exists espn_league_id text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leagues'::regclass
      and conname = 'leagues_espn_len'
  ) then
    alter table public.leagues
      add constraint leagues_espn_len
      check (espn_league_id is null or length(espn_league_id) between 1 and 64);
  end if;
end $$;


-- --------------------------------------------------------------------------
-- 3. seat_invites — one code per Sleeper seat in a league
-- --------------------------------------------------------------------------
create table if not exists public.seat_invites (
  id                bigint generated always as identity primary key,
  sleeper_league_id text        not null references public.leagues (sleeper_league_id) on delete cascade,
  sleeper_user_id   text        not null,
  team_name         text        not null,
  code_hash         text        not null,
  created_by        uuid        references auth.users (id),
  claimed_by        uuid        references auth.users (id),
  claimed_at        timestamptz,
  created_at        timestamptz not null default now(),
  constraint seat_invites_user_len check (length(sleeper_user_id) between 1 and 64),
  constraint seat_invites_team_len check (length(team_name) between 1 and 64),
  constraint seat_invites_hash_len check (length(code_hash) between 32 and 128)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seat_invites'::regclass
      and conname = 'seat_invites_league_seat_key'
  ) then
    alter table public.seat_invites
      add constraint seat_invites_league_seat_key
      unique (sleeper_league_id, sleeper_user_id);
  end if;
end $$;

create index if not exists seat_invites_hash_idx on public.seat_invites (code_hash);
create index if not exists seat_invites_league_idx on public.seat_invites (sleeper_league_id);

alter table public.seat_invites enable row level security;

-- Commissioners see invites for leagues they created.
drop policy if exists seat_invites_select_creator on public.seat_invites;
create policy seat_invites_select_creator
  on public.seat_invites for select to authenticated
  using (
    created_by = auth.uid()
    or sleeper_league_id in (
      select l.sleeper_league_id from public.leagues l where l.created_by = auth.uid()
    )
  );

-- Claimed invite readable by the claimer (their own row).
drop policy if exists seat_invites_select_claimer on public.seat_invites;
create policy seat_invites_select_claimer
  on public.seat_invites for select to authenticated
  using (claimed_by = auth.uid());

-- Writes go through the Edge Function (service role). No direct client insert.
revoke insert, update, delete, truncate on table public.seat_invites from anon, authenticated;
grant select on table public.seat_invites to authenticated;
