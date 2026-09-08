-- ============================================================================
-- Wave 19 — per-seat Data dashboard tile order
-- ============================================================================
-- Idempotent. Run in Supabase SQL Editor after wave18.
--
-- Stores the claimed seat's Data board (6–12 report ids from the client catalog).
-- This is a private workspace: other managers must not read your layout.
--
-- RLS:
--   SELECT / WRITE — authenticated only for the seat they currently claim
--   No anon read (unlike seat_cosmetics / seat_avatars)
-- ============================================================================

create table if not exists public.seat_data_dash (
  sleeper_league_id text        not null references public.leagues (sleeper_league_id) on delete cascade,
  sleeper_user_id   text        not null,
  tiles             text[]      not null,
  updated_at        timestamptz not null default now(),
  primary key (sleeper_league_id, sleeper_user_id),
  constraint seat_data_dash_user_len check (length(sleeper_user_id) between 1 and 64),
  constraint seat_data_dash_tiles_len check (cardinality(tiles) between 6 and 12),
  constraint seat_data_dash_tiles_unique check (
    cardinality(tiles) = (select count(distinct x) from unnest(tiles) as x)
  ),
  constraint seat_data_dash_tiles_shape check (
    not exists (
      select 1 from unnest(tiles) as t
      where t !~ '^[a-z0-9_]+$'
    )
  )
);

create index if not exists seat_data_dash_league_idx
  on public.seat_data_dash (sleeper_league_id);

alter table public.seat_data_dash enable row level security;

drop policy if exists seat_data_dash_select_own on public.seat_data_dash;
create policy seat_data_dash_select_own
  on public.seat_data_dash for select to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_data_dash.sleeper_league_id
        and m.sleeper_user_id = seat_data_dash.sleeper_user_id
    )
  );

drop policy if exists seat_data_dash_insert_own on public.seat_data_dash;
create policy seat_data_dash_insert_own
  on public.seat_data_dash for insert to authenticated
  with check (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_data_dash.sleeper_league_id
        and m.sleeper_user_id = seat_data_dash.sleeper_user_id
    )
  );

drop policy if exists seat_data_dash_update_own on public.seat_data_dash;
create policy seat_data_dash_update_own
  on public.seat_data_dash for update to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_data_dash.sleeper_league_id
        and m.sleeper_user_id = seat_data_dash.sleeper_user_id
    )
  )
  with check (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_data_dash.sleeper_league_id
        and m.sleeper_user_id = seat_data_dash.sleeper_user_id
    )
  );

drop policy if exists seat_data_dash_delete_own on public.seat_data_dash;
create policy seat_data_dash_delete_own
  on public.seat_data_dash for delete to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_data_dash.sleeper_league_id
        and m.sleeper_user_id = seat_data_dash.sleeper_user_id
    )
  );

grant select, insert, update, delete on table public.seat_data_dash to authenticated;
revoke all on table public.seat_data_dash from anon;
revoke truncate on table public.seat_data_dash from anon, authenticated;
