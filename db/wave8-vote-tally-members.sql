-- ============================================================================
-- Wave 8 — vote tallies count current members only + scrub ghost ballots
-- ============================================================================
-- Idempotent. Run after db/wave2-vote-identity.sql (and ideally after a clean
-- scripts/wipe-trade-votes.sql when you want a true zero).
--
-- Why: trade_vote_tallies used to count every row, including:
--   * pre-seat-auth auth.user UUID "voters"
--   * Cloud Agent harness rows (__agent__*)
--   * cleared __none__ rows (already filtered) and seats that were reissued
-- A "wipe" that was never run left the most recent trade at 6 votes while only
-- two managers had actually claimed seats.
--
-- This wave:
--   1. Deletes ballots that are not a current league_memberships seat
--      (plus agent harness junk).
--   2. Rebuilds trade_vote_tallies to join memberships so orphans never show
--      again even if someone inserts them.
-- ============================================================================

-- 1. Scrub ghosts / harness / seats that are no longer claimed
delete from public.trade_votes v
 where v.voter like '\_\_agent\_\_%' escape '\'
    or v.transaction_id like '\_\_agent%' escape '\'
    or v.choice = '__none__'
    or not exists (
         select 1
           from public.league_memberships m
          where m.sleeper_league_id = v.sleeper_league_id
            and m.sleeper_user_id = v.voter
       );

-- 2. Tallies: only current members, never cleared.
-- security_invoker = false: anon/authenticated can read the view without
-- SELECT on league_memberships (RLS only exposes one's own membership rows).
drop view if exists public.trade_vote_tallies;

create view public.trade_vote_tallies
  with (security_invoker = false)
  as
    select
      v.sleeper_league_id,
      v.transaction_id,
      v.choice,
      count(*)::int as votes
    from public.trade_votes v
    inner join public.league_memberships m
      on m.sleeper_league_id = v.sleeper_league_id
     and m.sleeper_user_id = v.voter
    where v.choice <> '__none__'
    group by v.sleeper_league_id, v.transaction_id, v.choice;

grant select on table public.trade_vote_tallies to anon, authenticated;
