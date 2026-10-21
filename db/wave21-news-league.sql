-- Wave 21 — optional sleeper_league_id on news_submissions
-- so each league feed can be built from its own shares.
-- Idempotent. Safe to paste if the column already exists.

alter table public.news_submissions
  add column if not exists sleeper_league_id text;

alter table public.news_submissions drop constraint if exists news_submissions_league_len;
alter table public.news_submissions
  add constraint news_submissions_league_len
  check (sleeper_league_id is null or length(sleeper_league_id) between 6 and 64);

create index if not exists news_submissions_league_idx
  on public.news_submissions (sleeper_league_id, created_at desc)
  where deleted_at is null;
