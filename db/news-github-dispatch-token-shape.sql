-- Safe checks: does NOT print the token. Paste results into chat.

select
  (def like '%PASTE_NEW_PAT_HERE%') as still_placeholder,
  (def like '%Bearer ghp_%') as has_bearer_ghp,
  (def like '%Bearer github_pat_%') as has_bearer_github_pat,
  (def like '%token ghp_%') as has_token_ghp,
  (def like '%token github_pat_%') as has_token_github_pat,
  (def ~ 'Authorization.*,\s*''Bearer [^'']+''') as auth_line_ok_shape
from (
  select pg_get_functiondef('public.dispatch_news_refresh()'::regprocedure) as def
) s;
