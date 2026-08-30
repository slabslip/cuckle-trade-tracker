# Immediate publish: Supabase → GitHub `news-refresh`

`pg_net` reached GitHub but always got **401** (Authorization rejected / not applied).
Use a **Supabase Edge Function** + **Database Webhook** instead. The PAT lives in
Edge Function secrets, not in SQL.

## 1. Create the Edge Function

1. Supabase Dashboard → **Edge Functions** → **Create a new function**
2. Name: `dispatch-news`
3. Paste the code from [`supabase/functions/dispatch-news/index.ts`](../supabase/functions/dispatch-news/index.ts)
4. Deploy

## 2. Add the GitHub PAT secret

1. Edge Functions → **Secrets** (or Project Settings → Edge Functions → Secrets)
2. Add secret:
   - Name: `GITHUB_PAT`
   - Value: your classic PAT (`repo` scope, account **slabslip**)
3. Do not put the PAT in chat or in SQL

## 3. Database Webhook

1. **Database** → **Webhooks** → **Create a new webhook**
2. Name: `news-to-github`
3. Table: `news_submissions`
4. Events: **Insert**, **Update**
5. Type: **Supabase Edge Functions**
6. Edge Function: `dispatch-news`
7. Create / Save

## 4. Test

Share a tweet with the Shortcut, or insert a row. Then check:

- GitHub → **Actions** → **news-refresh** (new run within seconds)
- Public feed updates after Pages (~1 minute)

## Fallback SQL (`pg_net`)

[`db/news-github-dispatch.sql`](../db/news-github-dispatch.sql) is still in the repo but
was getting **401** from GitHub in this project. Prefer the Edge Function path above.
You can drop the old trigger after the webhook works:

```sql
drop trigger if exists news_submissions_dispatch on public.news_submissions;
drop function if exists public.dispatch_news_refresh();
```
