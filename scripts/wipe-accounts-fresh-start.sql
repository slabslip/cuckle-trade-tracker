-- ============================================================================
-- Fresh start: erase every app account and league binding.
-- Run in Supabase → SQL Editor as postgres (dashboard).
-- ============================================================================
-- After this, nobody is signed in. Commissioners re-create leagues (or join by
-- Sleeper ID); managers Continue with Apple (or username) and redeem / claim.
--
-- Companion client bumps (already in generate-page.mjs when this ships):
--   AUTH_KEY  → cuckle.auth.v2   (drops stale JWTs from localStorage)
--   VOTE_KEY  → cuckle.votes.v5  (drops stale ballots so heal cannot re-upload)
--
-- Then: hard-refresh / reinstall TestFlight so devices drop old storage.
-- ============================================================================

begin;

do $$
declare
  t text;
  tables text[] := array[
    'ledger_settle_votes',
    'ledger_bet_events',
    'ledger_bets',
    'ledger_seat_style',
    'trade_votes',
    'seat_cosmetics',
    'seat_avatars',
    'seat_data_dash',
    'seat_trade_block',
    'league_memberships',
    'seat_invites',
    'seat_profiles',
    'app_profiles',
    'leagues'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('truncate table public.%I restart identity cascade', t);
    end if;
  end loop;
end $$;

-- Every Supabase Auth login (username/password + any Apple identities).
delete from auth.users;

commit;

-- Expect zeros:
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.app_profiles) as profiles,
  (select count(*) from public.league_memberships) as memberships,
  (select count(*) from public.seat_invites) as invites,
  (select count(*) from public.leagues) as leagues;
