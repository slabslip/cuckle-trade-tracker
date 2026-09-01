-- ============================================================================
-- Wave 7 — co-admins (secondary invite/dashboard admins)
-- ============================================================================
-- Idempotent. Run after db/wave6-one-seat-redeem.sql.
--
-- Primary admin remains leagues.created_by (whoever first entered the Sleeper
-- league ID). They may elect co-admins from existing league members. Co-admins
-- can manage invites (list / copy / rotate / reissue) but cannot transfer
-- ownership or elect other co-admins. Transfer commissioner still moves
-- created_by to another member.
-- ============================================================================

create table if not exists public.league_co_admins (
  sleeper_league_id text not null
    references public.leagues (sleeper_league_id) on delete cascade,
  auth_user_id uuid not null
    references auth.users (id) on delete cascade,
  granted_by uuid
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (sleeper_league_id, auth_user_id)
);

create index if not exists league_co_admins_user_idx
  on public.league_co_admins (auth_user_id);

comment on table public.league_co_admins is
  'Secondary admins elected by leagues.created_by; invite console access without ownership.';

alter table public.league_co_admins enable row level security;

drop policy if exists league_co_admins_select on public.league_co_admins;
create policy league_co_admins_select
  on public.league_co_admins for select to authenticated
  using (
    auth_user_id = auth.uid()
    or exists (
      select 1 from public.leagues l
      where l.sleeper_league_id = league_co_admins.sleeper_league_id
        and l.created_by = auth.uid()
    )
  );

-- No direct client writes — Edge (service role) only.
revoke insert, update, delete, truncate on table public.league_co_admins from anon, authenticated;
grant select on table public.league_co_admins to authenticated;
