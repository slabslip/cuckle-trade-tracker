-- ============================================================================
-- Wave 20 — per-seat trade block (league-readable, owner-write)
-- ============================================================================
-- Idempotent. Run in Supabase SQL Editor after wave19.
--
-- A short list of pieces a claimed seat will actually deal. Putting someone on
-- the block does not change value. Votes stay out. The calculator still prices.
--
-- RLS:
--   SELECT — any authenticated member of that league (the block is not anon)
--   WRITE — only the owner of that seat
-- ============================================================================

create table if not exists public.seat_trade_block (
  sleeper_league_id text        not null references public.leagues (sleeper_league_id) on delete cascade,
  sleeper_user_id   text        not null,
  asset_ids         text[]      not null default '{}',
  updated_at        timestamptz not null default now(),
  primary key (sleeper_league_id, sleeper_user_id),
  constraint seat_trade_block_user_len check (length(sleeper_user_id) between 1 and 64),
  constraint seat_trade_block_len check (cardinality(asset_ids) between 0 and 8),
  constraint seat_trade_block_unique check (
    cardinality(asset_ids) = (select count(distinct x) from unnest(asset_ids) as x)
  ),
  constraint seat_trade_block_shape check (
    not exists (
      select 1 from unnest(asset_ids) as t
      where t !~ '^[a-z0-9_.:-]+$'
    )
  )
);

create index if not exists seat_trade_block_league_idx
  on public.seat_trade_block (sleeper_league_id, updated_at desc);

alter table public.seat_trade_block enable row level security;

drop policy if exists seat_trade_block_select_league on public.seat_trade_block;
create policy seat_trade_block_select_league
  on public.seat_trade_block for select to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_trade_block.sleeper_league_id
    )
  );

drop policy if exists seat_trade_block_insert_own on public.seat_trade_block;
create policy seat_trade_block_insert_own
  on public.seat_trade_block for insert to authenticated
  with check (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_trade_block.sleeper_league_id
        and m.sleeper_user_id = seat_trade_block.sleeper_user_id
    )
  );

drop policy if exists seat_trade_block_update_own on public.seat_trade_block;
create policy seat_trade_block_update_own
  on public.seat_trade_block for update to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_trade_block.sleeper_league_id
        and m.sleeper_user_id = seat_trade_block.sleeper_user_id
    )
  )
  with check (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_trade_block.sleeper_league_id
        and m.sleeper_user_id = seat_trade_block.sleeper_user_id
    )
  );

drop policy if exists seat_trade_block_delete_own on public.seat_trade_block;
create policy seat_trade_block_delete_own
  on public.seat_trade_block for delete to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = seat_trade_block.sleeper_league_id
        and m.sleeper_user_id = seat_trade_block.sleeper_user_id
    )
  );

grant select, insert, update, delete on table public.seat_trade_block to authenticated;
revoke all on table public.seat_trade_block from anon;
revoke truncate on table public.seat_trade_block from anon, authenticated;
