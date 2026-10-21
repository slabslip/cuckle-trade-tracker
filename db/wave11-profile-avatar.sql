-- ============================================================================
-- Wave 11 — custom seat avatars (Settings → Profile)
-- ============================================================================
-- Idempotent. Run in Supabase SQL Editor.
--
-- Stores a small cropped square image (data URL) per league seat so every client
-- can paint the same flair on names, vote marks, and chips. Static SEAT_FLAIR PNGs
-- remain the fallback when a seat has no row here.
--
-- RLS:
--   SELECT  — anon + authenticated (everyone must see who voted)
--   WRITE   — authenticated only for the seat they currently claim in that league
-- ============================================================================

create table if not exists public.seat_avatars (
  sleeper_league_id text        not null references public.leagues (sleeper_league_id) on delete cascade,
  sleeper_user_id   text        not null,
  avatar_data       text        not null,
  updated_at        timestamptz not null default now(),
  primary key (sleeper_league_id, sleeper_user_id),
  constraint seat_avatars_user_len check (length(sleeper_user_id) between 1 and 64),
  constraint seat_avatars_data_len check (length(avatar_data) between 64 and 120000),
  constraint seat_avatars_data_shape check (
    avatar_data ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
  )
);

create index if not exists seat_avatars_league_idx
  on public.seat_avatars (sleeper_league_id);

alter table public.seat_avatars enable row level security;

drop policy if exists seat_avatars_select_anon on public.seat_avatars;
create policy seat_avatars_select_anon
  on public.seat_avatars for select to anon
  using (true);

drop policy if exists seat_avatars_select_authenticated on public.seat_avatars;
create policy seat_avatars_select_authenticated
  on public.seat_avatars for select to authenticated
  using (true);

drop policy if exists seat_avatars_insert_own on public.seat_avatars;
create policy seat_avatars_insert_own
  on public.seat_avatars for insert to authenticated
  with check (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_avatars.sleeper_league_id
        and m.sleeper_user_id = seat_avatars.sleeper_user_id
    )
  );

drop policy if exists seat_avatars_update_own on public.seat_avatars;
create policy seat_avatars_update_own
  on public.seat_avatars for update to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_avatars.sleeper_league_id
        and m.sleeper_user_id = seat_avatars.sleeper_user_id
    )
  )
  with check (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_avatars.sleeper_league_id
        and m.sleeper_user_id = seat_avatars.sleeper_user_id
    )
  );

drop policy if exists seat_avatars_delete_own on public.seat_avatars;
create policy seat_avatars_delete_own
  on public.seat_avatars for delete to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_avatars.sleeper_league_id
        and m.sleeper_user_id = seat_avatars.sleeper_user_id
    )
  );

grant select on table public.seat_avatars to anon, authenticated;
grant insert, update, delete on table public.seat_avatars to authenticated;
revoke truncate on table public.seat_avatars from anon, authenticated;
