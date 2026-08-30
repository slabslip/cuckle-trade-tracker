-- Diagnose news → GitHub dispatch (safe to paste results back — no token printed).
-- Run in Supabase SQL editor and paste the result tables into chat.

-- 1) Is the trigger on the table?
select tgname, tgenabled::text as enabled
from pg_trigger
where tgrelid = 'public.news_submissions'::regclass
  and not tgisinternal
order by tgname;

-- 2) Recent pg_net HTTP results (401/403 = bad PAT; 204 = GitHub accepted)
select id, status_code, error_msg, created
from net._http_response
order by id desc
limit 10;

-- 3) Does the function still contain the placeholder? (true = you must re-paste the PAT)
select
  (pg_get_functiondef('public.dispatch_news_refresh()'::regprocedure)
    like '%PASTE_NEW_PAT_HERE%') as still_has_placeholder,
  (pg_get_functiondef('public.dispatch_news_refresh()'::regprocedure)
    like '%ghp_REPLACE_ME%') as still_has_old_placeholder;
