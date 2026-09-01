-- Clean-slate trade votes (run in Supabase SQL editor with service role / dashboard).
-- Anon clients cannot DELETE or TRUNCATE trade_votes by design.
truncate public.trade_votes restart identity;
