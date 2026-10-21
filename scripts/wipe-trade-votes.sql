-- ============================================================================
-- Clean-slate trade votes (run in Supabase SQL editor as postgres / dashboard).
-- Anon clients cannot DELETE or TRUNCATE trade_votes by design.
-- ============================================================================
-- Use this when you want EVERY ballot gone (Ducks + Truman + any claimed seat
-- start from zero). After truncate, every manager must vote again.
--
-- Client companion: bump VOTE_KEY in generate-page.mjs (cuckle.votes.vN) so
-- localStorage heal does not re-upload stale device ballots after this wipe.
--
-- Order for a full refresh:
--   1. Run this truncate.
--   2. Run db/wave8-vote-tally-members.sql (or at least wave8b) so tallies
--      only count current league_memberships seats and anon can read the view.
--   3. Deploy the page with the new VOTE_KEY; hard-refresh every device.
-- ============================================================================

truncate public.trade_votes restart identity;

-- Optional verify (expect 0 rows):
-- select count(*) from public.trade_votes;
-- select * from public.trade_vote_tallies limit 5;
