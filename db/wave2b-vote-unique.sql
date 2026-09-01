-- ============================================================================
-- Wave 2b — league-scoped vote uniqueness (run after db/wave2-vote-identity.sql)
-- ============================================================================
-- Idempotent.
--
-- Plan: uniqueness is (sleeper_league_id, transaction_id, voter), not a global
-- (transaction_id, voter) pair — so two leagues can never collide on the same
-- Sleeper transaction id + seat (unlikely, but the product model is per-league).
-- Client upserts with on_conflict=sleeper_league_id,transaction_id,voter.
-- ============================================================================

do $$
declare
  cname text;
begin
  -- Drop the old global unique if present (name varies by how schema was applied).
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.trade_votes'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) in (
        'UNIQUE (transaction_id, voter)',
        'UNIQUE (voter, transaction_id)'
      )
  loop
    execute format('alter table public.trade_votes drop constraint %I', cname);
  end loop;
end $$;

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
  raise warning 'trade_votes_league_tx_voter_uq skipped: %', sqlerrm;
end $$;
