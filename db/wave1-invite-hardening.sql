-- ============================================================================
-- Wave 1 — invite hardening (run after db/commissioner-invites.sql)
-- ============================================================================
-- Idempotent.
--
-- 1. Atomic redeem RPC (membership + claim stamp in one transaction)
-- 2. Claim-seat RPC for the commissioner (consumes their seat invite)
-- 3. Tighten leagues + league_memberships: no client writes (Edge/service only)
-- ============================================================================


-- --------------------------------------------------------------------------
-- 1. Atomic redeem by invite code hash
-- --------------------------------------------------------------------------
create or replace function public.redeem_seat_invite(
  p_code_hash text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.seat_invites%rowtype;
  mem public.league_memberships%rowtype;
  lg public.leagues%rowtype;
begin
  if p_code_hash is null or length(p_code_hash) < 32 then
    raise exception 'invalid code hash' using errcode = '22023';
  end if;
  if p_auth_user_id is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  select * into inv
  from public.seat_invites
  where code_hash = p_code_hash
  for update;

  if not found then
    raise exception 'unknown invite' using errcode = 'P0002';
  end if;

  if inv.claimed_by is not null and inv.claimed_by <> p_auth_user_id then
    raise exception 'invite already used' using errcode = '23505';
  end if;

  begin
    insert into public.league_memberships (
      auth_user_id, sleeper_league_id, sleeper_user_id, team_name
    ) values (
      p_auth_user_id, inv.sleeper_league_id, inv.sleeper_user_id, inv.team_name
    )
    on conflict (auth_user_id, sleeper_league_id) do update
      set sleeper_user_id = excluded.sleeper_user_id,
          team_name = excluded.team_name
    returning * into mem;
  exception when unique_violation then
    raise exception 'seat already claimed' using errcode = '23505';
  end;

  update public.seat_invites
     set claimed_by = p_auth_user_id,
         claimed_at = coalesce(claimed_at, now())
   where id = inv.id;

  select * into lg from public.leagues where sleeper_league_id = inv.sleeper_league_id;

  return jsonb_build_object(
    'membership', to_jsonb(mem),
    'league', jsonb_build_object(
      'sleeper_league_id', inv.sleeper_league_id,
      'name', coalesce(lg.name, inv.sleeper_league_id),
      'status', coalesce(lg.status, 'pending_sync'),
      'season', lg.season,
      'team_name', inv.team_name,
      'sleeper_user_id', inv.sleeper_user_id
    )
  );
end $$;

revoke all on function public.redeem_seat_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_seat_invite(text, uuid) to service_role;


-- --------------------------------------------------------------------------
-- 2. Commissioner claim-seat (consume unclaimed invite for a seat they own)
-- --------------------------------------------------------------------------
create or replace function public.claim_commissioner_seat(
  p_sleeper_league_id text,
  p_sleeper_user_id text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.seat_invites%rowtype;
  lg public.leagues%rowtype;
begin
  select * into lg
  from public.leagues
  where sleeper_league_id = p_sleeper_league_id
  for update;

  if not found then
    raise exception 'unknown league' using errcode = 'P0002';
  end if;

  if lg.created_by is distinct from p_auth_user_id then
    raise exception 'not commissioner' using errcode = '42501';
  end if;

  select * into inv
  from public.seat_invites
  where sleeper_league_id = p_sleeper_league_id
    and sleeper_user_id = p_sleeper_user_id
  for update;

  if not found then
    raise exception 'unknown seat' using errcode = 'P0002';
  end if;

  if inv.claimed_by is not null and inv.claimed_by <> p_auth_user_id then
    raise exception 'seat already claimed' using errcode = '23505';
  end if;

  -- Reuse redeem path via hash so membership + claim stay identical.
  return public.redeem_seat_invite(inv.code_hash, p_auth_user_id);
end $$;

revoke all on function public.claim_commissioner_seat(text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_commissioner_seat(text, text, uuid) to service_role;


-- --------------------------------------------------------------------------
-- 3. Tighten leagues + memberships — Edge Function (service role) only writes
-- --------------------------------------------------------------------------
drop policy if exists leagues_insert_authenticated on public.leagues;
drop policy if exists leagues_update_authenticated on public.leagues;

revoke insert, update, delete, truncate on table public.leagues from anon, authenticated;
grant select on table public.leagues to anon, authenticated;

drop policy if exists league_memberships_insert_own on public.league_memberships;

revoke insert, update, delete, truncate on table public.league_memberships from anon, authenticated;
-- Members may leave a league they joined.
grant select, delete on table public.league_memberships to authenticated;

drop policy if exists league_memberships_delete_own on public.league_memberships;
create policy league_memberships_delete_own
  on public.league_memberships for delete to authenticated
  using (auth_user_id = auth.uid());

-- Keep select-own.
drop policy if exists league_memberships_select_own on public.league_memberships;
create policy league_memberships_select_own
  on public.league_memberships for select to authenticated
  using (auth_user_id = auth.uid());
