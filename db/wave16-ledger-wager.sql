-- ============================================================================
-- wave16 — dashboard wager handshake (house odds, counters, league settle vote)
-- ============================================================================
-- Paste AFTER wave12 + wave13 + wave15. Idempotent.
-- Companion: docs/LEDGER_SDD.md (New wager / counter / both-accept / clock)
-- ============================================================================

alter table public.ledger_bets
  add column if not exists offer_rev integer not null default 1;

alter table public.ledger_bets
  add column if not exists house_odds integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ledger_bets_house_odds_check'
       and conrelid = 'public.ledger_bets'::regclass
  ) then
    alter table public.ledger_bets
      add constraint ledger_bets_house_odds_check
      check (house_odds is null or (house_odds >= -500 and house_odds <= 500));
  end if;
end $$;

comment on column public.ledger_bets.house_odds is
  'American line from the house (side_a / proposer). 0 is even. Them is the opposite sign.';
comment on column public.ledger_bets.offer_rev is
  'Bumps on each counter so both sides accept the same version.';

alter table public.ledger_bet_events
  drop constraint if exists ledger_bet_events_kind_check;

alter table public.ledger_bet_events
  add constraint ledger_bet_events_kind_check
  check (kind in (
    'created','accepted','declined','edited','settled','note','canceled','expired','sent',
    'countered','claimed','voted'
  ));

create table if not exists public.ledger_settle_votes (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.ledger_bets(id) on delete cascade,
  voter text not null,
  pick text not null check (pick in ('side_a','side_b','push')),
  created_at timestamptz not null default now(),
  unique (bet_id, voter)
);

create index if not exists ledger_settle_votes_bet_idx
  on public.ledger_settle_votes (bet_id, pick);

alter table public.ledger_settle_votes enable row level security;

drop policy if exists ledger_settle_votes_select_member on public.ledger_settle_votes;
create policy ledger_settle_votes_select_member on public.ledger_settle_votes
  for select to authenticated
  using (
    exists (
      select 1
        from public.ledger_bets b
        join public.league_memberships m
          on m.sleeper_league_id = b.sleeper_league_id
         and m.auth_user_id = auth.uid()
       where b.id = ledger_settle_votes.bet_id
    )
  );

-- Any claimed seat may vote once a locked slip is past its clock and the two
-- parties already named different winners.
drop policy if exists ledger_settle_votes_insert_member on public.ledger_settle_votes;
create policy ledger_settle_votes_insert_member on public.ledger_settle_votes
  for insert to authenticated
  with check (
    exists (
      select 1
        from public.ledger_bets b
        join public.league_memberships m
          on m.sleeper_league_id = b.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and m.sleeper_user_id = ledger_settle_votes.voter
       where b.id = ledger_settle_votes.bet_id
         and b.status = 'open'
         and b.deadline_at is not null
         and b.deadline_at < now()
         and b.side_a_claim is not null
         and b.side_b_claim is not null
         and b.side_a_claim is distinct from b.side_b_claim
    )
  );

drop policy if exists ledger_settle_votes_update_own on public.ledger_settle_votes;
create policy ledger_settle_votes_update_own on public.ledger_settle_votes
  for update to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
       where m.auth_user_id = auth.uid()
         and m.sleeper_user_id = ledger_settle_votes.voter
    )
  )
  with check (
    exists (
      select 1 from public.league_memberships m
       where m.auth_user_id = auth.uid()
         and m.sleeper_user_id = ledger_settle_votes.voter
    )
  );

grant select, insert, update on table public.ledger_settle_votes to authenticated;

-- After a vote, if one pick has a strict majority of votes cast, lock the tab.
create or replace function public.ledger_apply_settle_majority()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  winner_pick text;
  n_a integer;
  n_b integer;
  n_p integer;
begin
  select
    count(*) filter (where pick = 'side_a'),
    count(*) filter (where pick = 'side_b'),
    count(*) filter (where pick = 'push')
    into n_a, n_b, n_p
  from public.ledger_settle_votes
  where bet_id = new.bet_id;

  winner_pick := null;
  if n_a > n_b and n_a > n_p then
    winner_pick := 'side_a';
  elsif n_b > n_a and n_b > n_p then
    winner_pick := 'side_b';
  elsif n_p > n_a and n_p > n_b then
    winner_pick := 'push';
  end if;

  if winner_pick is not null then
    update public.ledger_bets
       set status = 'settled',
           winner = winner_pick
     where id = new.bet_id
       and status = 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_settle_votes_majority on public.ledger_settle_votes;
create trigger ledger_settle_votes_majority
  after insert or update on public.ledger_settle_votes
  for each row execute function public.ledger_apply_settle_majority();
