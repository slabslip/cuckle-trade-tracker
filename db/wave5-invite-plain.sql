-- ============================================================================
-- Wave 5 — recall plaintext invite codes for unclaimed seats
-- ============================================================================
-- Idempotent. Run after db/wave2-vote-identity.sql.
--
-- Commissioners need CF- codes visible every time they open the invite console.
-- Hashes alone cannot be reversed, so we keep code_plain only while unclaimed
-- and clear it on redeem (claim_commissioner_seat calls redeem_seat_invite).
-- ============================================================================

alter table public.seat_invites
  add column if not exists code_plain text;

comment on column public.seat_invites.code_plain is
  'Plaintext CF- code for commissioner DM console; null once claimed.';

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
