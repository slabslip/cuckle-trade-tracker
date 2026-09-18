-- ============================================================================
-- Wave 23 — GM ESPN standings screenshots (Past Champions)
-- ============================================================================
-- Idempotent. Run in Supabase SQL Editor.
--
-- ESPN 35763180 is private. The API stays 401 until original-LM cookies land.
-- This table holds one compressed JPEG data URL per year so the GM dashboard
-- can show final standings screenshots. Hard-locked to the GM Sleeper book.
--
-- RLS:
--   SELECT  — anon + authenticated (every GM manager sees the same tables)
--   WRITE  — authenticated commissioner of this league only
-- ============================================================================

create table if not exists public.league_standings_shots (
  sleeper_league_id text        not null,
  season            text        not null,
  image_data        text        not null,
  updated_at        timestamptz not null default now(),
  primary key (sleeper_league_id, season),
  constraint league_standings_shots_gm
    check (sleeper_league_id = '1389723418827460608'),
  constraint league_standings_shots_season
    check (season ~ '^[0-9]{4}$'),
  constraint league_standings_shots_data_len
    check (length(image_data) between 64 and 1200000),
  constraint league_standings_shots_data_shape
    check (image_data ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
);

alter table public.league_standings_shots enable row level security;

drop policy if exists league_standings_shots_select_anon on public.league_standings_shots;
create policy league_standings_shots_select_anon
  on public.league_standings_shots for select to anon
  using (true);

drop policy if exists league_standings_shots_select_authenticated on public.league_standings_shots;
create policy league_standings_shots_select_authenticated
  on public.league_standings_shots for select to authenticated
  using (true);

drop policy if exists league_standings_shots_write_commish on public.league_standings_shots;
create policy league_standings_shots_write_commish
  on public.league_standings_shots for all to authenticated
  using (
    exists (
      select 1 from public.leagues l
      where l.sleeper_league_id = league_standings_shots.sleeper_league_id
        and l.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.leagues l
      where l.sleeper_league_id = league_standings_shots.sleeper_league_id
        and l.created_by = auth.uid()
    )
  );

grant select on table public.league_standings_shots to anon, authenticated;
grant insert, update, delete on table public.league_standings_shots to authenticated;
revoke truncate on table public.league_standings_shots from anon, authenticated;
