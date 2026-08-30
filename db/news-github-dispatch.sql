-- Ping GitHub Actions when a news share lands (or is soft-deleted).
--
-- SETUP
-- 1. Create a classic PAT as user slabslip with the `repo` scope
--    (or fine-grained: this repo, Contents: Read and write).
-- 2. In the Authorization line below, replace PASTE_NEW_PAT_HERE with that
--    token. That is the ONLY place to put it. Do not paste the token into chat.
-- 3. Run this whole file in the Supabase SQL editor.
-- 4. Share a tweet → GitHub Actions → news-refresh should start within seconds.

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
      -- ↓↓↓ put the PAT only here ↓↓↓
      'Authorization', 'Bearer PASTE_NEW_PAT_HERE'
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
