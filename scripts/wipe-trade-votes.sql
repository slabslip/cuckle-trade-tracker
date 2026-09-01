-- Clean-slate trade votes (run in Supabase SQL editor as postgres / dashboard).
-- Anon clients cannot DELETE or TRUNCATE trade_votes by design.
--
-- Prefer this when you want EVERY ballot gone (new league season, public launch).
-- After truncate, managers must vote again. For a softer scrub that keeps votes
-- from seats that are currently claimed, run db/wave8-vote-tally-members.sql instead.

truncate public.trade_votes restart identity;

-- Optional: also refresh the membership-scoped tally view if wave8 is not applied yet.
-- (Safe to re-run wave8 after this truncate.)
