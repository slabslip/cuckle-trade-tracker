-- ============================================================================
-- Wipe TrumanCooper app login so App Store / TestFlight setup is brand-new.
-- Run in Supabase → SQL Editor (postgres). Does NOT wipe other managers.
-- Sleeper itself is untouched. League rows stay; only this auth user is removed.
-- ============================================================================

begin;

create temporary table wipe_me (id uuid primary key) on commit drop;

insert into wipe_me (id)
select auth_user_id
from public.app_profiles
where username ilike 'TrumanCooper';

-- Also catch a login that never got an app_profiles row (rare).
insert into wipe_me (id)
select u.id
from auth.users u
where lower(coalesce(u.email, '')) like 'trumancooper@%'
   or lower(coalesce(u.raw_user_meta_data->>'username', '')) = 'trumancooper'
on conflict do nothing;

-- Break non-cascade FKs that block auth.users delete.
update public.leagues
set created_by = null
where created_by in (select id from wipe_me);

update public.seat_invites
set created_by = null
where created_by in (select id from wipe_me);

update public.seat_invites
set claimed_by = null
where claimed_by in (select id from wipe_me);

-- wave22 may store the prior account on a reset ticket
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'seat_invites'
      and column_name = 'prior_auth_user_id'
  ) then
    execute 'update public.seat_invites set prior_auth_user_id = null
             where prior_auth_user_id in (select id from wipe_me)';
  end if;
end $$;

delete from public.league_memberships
where auth_user_id in (select id from wipe_me);

-- Cascades app_profiles / seat_profiles where ON DELETE CASCADE is set.
delete from auth.users
where id in (select id from wipe_me);

commit;

-- Expect zero rows:
select 'app_profiles' as t, count(*)::int as n
from public.app_profiles where username ilike 'TrumanCooper'
union all
select 'memberships', count(*)::int
from public.league_memberships m
join public.app_profiles p on p.auth_user_id = m.auth_user_id
where p.username ilike 'TrumanCooper'
union all
select 'auth_email', count(*)::int
from auth.users
where lower(coalesce(email, '')) like 'trumancooper@%';
