-- Call the dispatch-news Edge Function when a share lands.
-- PAT stays in Edge secrets (GITHUB_PAT). This only uses the public anon key
-- to invoke your own function — same call we already verified returns GitHub 204.
--
-- Run this whole file in the SQL editor (no edits needed).

create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_news_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://gtqyvnkkjiksmmtmzubw.supabase.co/functions/v1/dispatch-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0cXl2bmtramlrc21tdG16dWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMjk2MzMsImV4cCI6MjEwMzYwNTYzM30.cyEU9bWTkRWTJxlwwPKEgXNT9WJukSluNcsj56WZib8',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0cXl2bmtramlrc21tdG16dWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMjk2MzMsImV4cCI6MjEwMzYwNTYzM30.cyEU9bWTkRWTJxlwwPKEgXNT9WJukSluNcsj56WZib8'
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', jsonb_build_object('id', NEW.id)
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
