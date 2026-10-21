-- ============================================================================
-- Wave 9 — vote writes must succeed for current claimed seats
-- ============================================================================
-- Idempotent. Run in Supabase SQL Editor after wave2 / wave8.
--
-- Fixes:
--   1. RLS insert/update policies that still key off seat_profiles (phase1) OR
--      used an unqualified sleeper_league_id inside a subquery (resolved to the
--      memberships alias, not the new ballot row).
--   2. Ensure authenticated INSERT/UPDATE grants.
--   3. Ensure the upsert unique target PostgREST needs for
--      on_conflict=sleeper_league_id,transaction_id,voter.
--   4. Sync seat_profiles from league_memberships so any leftover seat_profiles
--      checks cannot drift from the claimed seat.
-- ============================================================================

-- 0. Unique target for client upserts
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trade_votes'::regclass
      and conname = 'trade_votes_league_tx_voter_uq'
  ) then
    alter table public.trade_votes
      add constraint trade_votes_league_tx_voter_uq
      unique (sleeper_league_id, transaction_id, voter);
  end if;
exception when others then
  raise warning 'trade_votes_league_tx_voter_uq: %', sqlerrm;
end $$;

-- 1. Keep seat_profiles aligned with memberships (bridge for older policies)
do $$
begin
  insert into public.seat_profiles (auth_user_id, seat_user_id, seat_name)
  select distinct on (m.auth_user_id)
    m.auth_user_id,
    m.sleeper_user_id,
    coalesce(nullif(m.team_name, ''), m.sleeper_user_id)
  from public.league_memberships m
  order by m.auth_user_id, m.created_at desc nulls last
  on conflict (auth_user_id) do update
    set seat_user_id = excluded.seat_user_id,
        seat_name = excluded.seat_name;
exception when others then
  raise warning 'seat_profiles sync skipped: %', sqlerrm;
end $$;

-- 2. Force voter from membership for the ballot's league
create or replace function public.trade_votes_force_voter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.sleeper_league_id is null or length(new.sleeper_league_id) < 1 then
    raise exception 'trade_votes: sleeper_league_id required';
  end if;

  select m.sleeper_user_id into sid
    from public.league_memberships m
   where m.auth_user_id = auth.uid()
     and m.sleeper_league_id = new.sleeper_league_id
   limit 1;

  if sid is null then
    raise exception 'trade_votes: no membership for this league';
  end if;

  new.voter := sid;
  return new;
end $$;

drop trigger if exists trade_votes_force_voter on public.trade_votes;
create trigger trade_votes_force_voter
  before insert or update on public.trade_votes
  for each row execute function public.trade_votes_force_voter();

-- 3. RLS: membership for THIS ballot's league (qualified column names)
drop policy if exists trade_votes_auth_insert on public.trade_votes;
create policy trade_votes_auth_insert
  on public.trade_votes
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.league_memberships m
       where m.auth_user_id = auth.uid()
         and m.sleeper_league_id = trade_votes.sleeper_league_id
         and m.sleeper_user_id = trade_votes.voter
    )
  );

drop policy if exists trade_votes_auth_update on public.trade_votes;
create policy trade_votes_auth_update
  on public.trade_votes
  for update
  to authenticated
  using (
    exists (
      select 1
        from public.league_memberships m
       where m.auth_user_id = auth.uid()
         and m.sleeper_league_id = trade_votes.sleeper_league_id
         and m.sleeper_user_id = trade_votes.voter
    )
  )
  with check (
    exists (
      select 1
        from public.league_memberships m
       where m.auth_user_id = auth.uid()
         and m.sleeper_league_id = trade_votes.sleeper_league_id
         and m.sleeper_user_id = trade_votes.voter
    )
  );

-- 4. Privileges
grant select on table public.trade_votes to anon, authenticated;
grant insert, update on table public.trade_votes to authenticated;
revoke insert, update, delete, truncate on table public.trade_votes from anon;
revoke delete, truncate on table public.trade_votes from authenticated;
