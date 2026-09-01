-- ============================================================================
-- Wave 6 — one seat per account per league on redeem
-- ============================================================================
-- Idempotent. Run after db/wave5-invite-plain.sql.
--
-- Opening another team's invite while already signed in used to overwrite
-- league_memberships and stamp the new seat claimed, while leaving the old
-- seat_invites.claimed_by orphaned. Both seats then showed "Reissue".
--
-- This wave refuses redeem/claim when the auth user already sits a *different*
-- seat in that league. Re-redeeming the same seat remains OK.
-- ============================================================================

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
  existing public.league_memberships%rowtype;
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

  select * into existing
  from public.league_memberships
  where auth_user_id = p_auth_user_id
    and sleeper_league_id = inv.sleeper_league_id
  for update;

  if found
     and existing.sleeper_user_id is distinct from inv.sleeper_user_id then
    raise exception 'already have a seat in this league'
      using errcode = 'P0001';
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
         claimed_at = coalesce(claimed_at, now()),
         code_plain = null
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
