-- ============================================================================
-- Wave 2 — per-league vote identity (run after db/wave1-invite-hardening.sql)
-- ============================================================================
-- Idempotent.
--
-- Vote writes resolve voter from league_memberships for sleeper_league_id on the
-- ballot — not a single global seat_profiles row.
--
-- IMPORTANT: drop the force_voter trigger BEFORE backfilling sleeper_league_id.
-- The SQL editor has no auth.uid(), so the Phase 1 trigger would raise
-- "no claimed seat for this session" on UPDATE.
-- ============================================================================


-- --------------------------------------------------------------------------
-- 0. Drop trigger so backfill can run as the SQL editor role
-- --------------------------------------------------------------------------
drop trigger if exists trade_votes_force_voter on public.trade_votes;


-- --------------------------------------------------------------------------
-- 1. Scope trade_votes to a league
-- --------------------------------------------------------------------------
alter table public.trade_votes
  add column if not exists sleeper_league_id text;

-- Existing ballots are CuckleChunckle.
update public.trade_votes
   set sleeper_league_id = '1315431339301806080'
 where sleeper_league_id is null;

do $$
begin
  alter table public.trade_votes
    alter column sleeper_league_id set not null;
exception when others then
  raise warning 'trade_votes.sleeper_league_id not-null skipped: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trade_votes'::regclass
      and conname = 'trade_votes_league_fk'
  ) then
    begin
      alter table public.trade_votes
        add constraint trade_votes_league_fk
        foreign key (sleeper_league_id) references public.leagues (sleeper_league_id);
    exception when others then
      raise warning 'trade_votes_league_fk skipped: %', sqlerrm;
    end;
  end if;
end $$;

create index if not exists trade_votes_league_idx
  on public.trade_votes (sleeper_league_id);


-- --------------------------------------------------------------------------
-- 2. Force voter from membership for that league
-- --------------------------------------------------------------------------
create or replace function public.trade_votes_force_voter()
returns trigger
language plpgsql
as $$
declare
  sid text;
begin
  -- SQL editor / service_role migrations have no JWT — leave the row alone.
  if auth.uid() is null then
    return new;
  end if;

  if new.sleeper_league_id is null or length(new.sleeper_league_id) < 1 then
    raise exception 'trade_votes: sleeper_league_id required';
  end if;

  select m.sleeper_user_id into sid
  from public.league_memberships m
  where m.auth_user_id = auth.uid()
    and m.sleeper_league_id = new.sleeper_league_id;

  if sid is null then
    raise exception 'trade_votes: no membership for this league';
  end if;

  new.voter := sid;
  return new;
end $$;

create trigger trade_votes_force_voter
  before insert or update on public.trade_votes
  for each row execute function public.trade_votes_force_voter();


-- --------------------------------------------------------------------------
-- 3. RLS: membership for the ballot's league
-- --------------------------------------------------------------------------
drop policy if exists trade_votes_auth_insert on public.trade_votes;
create policy trade_votes_auth_insert
  on public.trade_votes
  for insert
  to authenticated
  with check (
    voter = (
      select m.sleeper_user_id
      from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = sleeper_league_id
    )
  );

drop policy if exists trade_votes_auth_update on public.trade_votes;
create policy trade_votes_auth_update
  on public.trade_votes
  for update
  to authenticated
  using (
    voter = (
      select m.sleeper_user_id
      from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = sleeper_league_id
    )
  )
  with check (
    voter = (
      select m.sleeper_user_id
      from public.league_memberships m
      where m.auth_user_id = auth.uid()
        and m.sleeper_league_id = sleeper_league_id
    )
  );


-- --------------------------------------------------------------------------
-- 4. Tallies include league id
-- --------------------------------------------------------------------------
-- Must DROP first: CREATE OR REPLACE cannot rename/reorder view columns
-- (old view led with transaction_id; new one leads with sleeper_league_id).
drop view if exists public.trade_vote_tallies;

create view public.trade_vote_tallies
  with (security_invoker = true)
  as
    select
      sleeper_league_id,
      transaction_id,
      choice,
      count(*)::int as votes
    from public.trade_votes
    where choice <> '__none__'
    group by sleeper_league_id, transaction_id, choice;

grant select on table public.trade_vote_tallies to anon, authenticated;


-- --------------------------------------------------------------------------
-- 5. seat_profiles no longer drives votes (bridge trigger kept for legacy reads)
-- --------------------------------------------------------------------------
-- Membership INSERT still upserts seat_profiles for older clients; vote RLS above
-- does not consult it. Prefer memberships as source of truth.
