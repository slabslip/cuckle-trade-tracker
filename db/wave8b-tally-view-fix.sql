-- Hotfix after an earlier wave8 draft with security_invoker=true broke anon
-- tallies (view joined league_memberships; anon has no SELECT there).
-- Safe to re-run anytime. Prefer db/wave8-vote-tally-members.sql for the full
-- scrub + view rebuild; this file is view-only.

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
