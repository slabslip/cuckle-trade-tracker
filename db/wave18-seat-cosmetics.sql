-- ============================================================================
-- Wave 18 — equipped title + emblem per seat (Titles and Emblems)
-- ============================================================================
-- Idempotent. Run in Supabase SQL Editor after wave11 (same memberships RLS shape).
--
-- Stores the equipped calling-card pair so every client can paint that seat's
-- title banner + emblem on the manager's team home. Barracks still writes
-- localStorage first; this table is the shared copy.
--
-- RLS:
--   SELECT  — anon + authenticated (anyone opening a seat must see the pair)
--   WRITE   — authenticated only for the seat they currently claim in that league
-- ============================================================================

create table if not exists public.seat_cosmetics (
  sleeper_league_id text        not null references public.leagues (sleeper_league_id) on delete cascade,
  sleeper_user_id   text        not null,
  title_id          text        not null default '',
  emblem_id         text        not null default '',
  updated_at        timestamptz not null default now(),
  primary key (sleeper_league_id, sleeper_user_id),
  constraint seat_cosmetics_user_len check (length(sleeper_user_id) between 1 and 64),
  constraint seat_cosmetics_title_len check (length(title_id) <= 64),
  constraint seat_cosmetics_emblem_len check (length(emblem_id) <= 64),
  constraint seat_cosmetics_title_shape check (title_id = '' or title_id ~ '^[a-z0-9_]+$'),
  constraint seat_cosmetics_emblem_shape check (emblem_id = '' or emblem_id ~ '^[a-z0-9_]+$')
);

create index if not exists seat_cosmetics_league_idx
  on public.seat_cosmetics (sleeper_league_id);

alter table public.seat_cosmetics enable row level security;

drop policy if exists seat_cosmetics_select_anon on public.seat_cosmetics;
create policy seat_cosmetics_select_anon
  on public.seat_cosmetics for select to anon
  using (true);

drop policy if exists seat_cosmetics_select_authenticated on public.seat_cosmetics;
create policy seat_cosmetics_select_authenticated
  on public.seat_cosmetics for select to authenticated
  using (true);

drop policy if exists seat_cosmetics_insert_own on public.seat_cosmetics;
create policy seat_cosmetics_insert_own
  on public.seat_cosmetics for insert to authenticated
  with check (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_cosmetics.sleeper_league_id
        and m.sleeper_user_id = seat_cosmetics.sleeper_user_id
    )
  );

drop policy if exists seat_cosmetics_update_own on public.seat_cosmetics;
create policy seat_cosmetics_update_own
  on public.seat_cosmetics for update to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_cosmetics.sleeper_league_id
        and m.sleeper_user_id = seat_cosmetics.sleeper_user_id
    )
  )
  with check (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_cosmetics.sleeper_league_id
        and m.sleeper_user_id = seat_cosmetics.sleeper_user_id
    )
  );

drop policy if exists seat_cosmetics_delete_own on public.seat_cosmetics;
create policy seat_cosmetics_delete_own
  on public.seat_cosmetics for delete to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_cosmetics.sleeper_league_id
        and m.sleeper_user_id = seat_cosmetics.sleeper_user_id
    )
  );

grant select on table public.seat_cosmetics to anon, authenticated;
grant insert, update, delete on table public.seat_cosmetics to authenticated;
revoke truncate on table public.seat_cosmetics from anon, authenticated;
