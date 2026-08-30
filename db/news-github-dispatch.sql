-- Ping GitHub Actions whenever a news share lands (or is soft-deleted).
-- One-time setup. Requires a GitHub fine-grained PAT with Contents: Read and write
-- on slabslip/cuckle-trade-tracker. Never commit the PAT.
--
-- 1. Replace BOTH copies of ghp_REPLACE_ME below with your PAT.
-- 2. Run this whole file in the Supabase SQL editor.
-- 3. Share a tweet (or wait for the agent test insert). Actions → news-refresh should start.

create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_news_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://api.github.com/repos/slabslip/cuckle-trade-tracker/dispatches',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'cuckle-news-dispatch',
      'Authorization', 'Bearer ghp_REPLACE_ME'
    ),
    body := jsonb_build_object(
      'event_type', 'news-submission',
      'client_payload', jsonb_build_object(
        'id', NEW.id,
        'op', TG_OP
      )
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
end;
$$;

drop trigger if exists news_submissions_dispatch on public.news_submissions;
create trigger news_submissions_dispatch
  after insert or update of deleted_at on public.news_submissions
  for each row
  execute function public.dispatch_news_refresh();

-- Sanity: the function body must not still say REPLACE_ME after you edit it.
do $$
begin
  if pg_get_functiondef('public.dispatch_news_refresh()'::regprocedure)
       like '%ghp_REPLACE_ME%' then
    raise exception 'Replace ghp_REPLACE_ME with your GitHub PAT before running this file.';
  end if;
end $$;
