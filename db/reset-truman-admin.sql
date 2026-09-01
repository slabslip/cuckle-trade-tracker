-- Reset TrumanCooper Auth so Create account can set a real password,
-- then re-attach as commissioner of the existing Cuckle league.
--
-- Run once in Supabase → SQL Editor → New query → Run.
-- Project: gtqyvnkkjiksmmtmzubw
--
-- After this script:
--   1. Private / Incognito window → https://slabslip.github.io/cuckle-trade-tracker/
--   2. Create account (pick username + password YOU choose — e.g. TrumanCooper)
--   3. Create a league → Sleeper ID 1315431339301806080
--   4. Claim this seat → TrumanCooper
--   5. Copy invite links for everyone else

begin;

do $$
declare
  uid uuid := '10ffd1a2-1c23-4d09-b000-c54ba45941d3'; -- trumancooper Auth user
  league text := '1315431339301806080';              -- CuckleChunckle
  seat text := '458342725222133760';                -- TrumanCooper Sleeper seat
begin
  -- Detach commissioner so Create league can claim it under the new Auth user.
  update public.leagues
     set created_by = null
   where sleeper_league_id = league
      or created_by = uid;

  -- Clear every seat_invites FK to this Auth user (created_by AND claimed_by),
  -- then free Truman's seat for a fresh claim.
  update public.seat_invites
     set created_by = null
   where created_by = uid;

  update public.seat_invites
     set claimed_by = null,
         claimed_at = null,
         code_plain = null
   where claimed_by = uid
      or (sleeper_league_id = league and sleeper_user_id = seat);

  -- Memberships / seat_profiles / app_profiles (also cascade from auth.users).
  delete from public.league_memberships where auth_user_id = uid;
  delete from public.seat_profiles where auth_user_id = uid;
  delete from public.app_profiles
   where auth_user_id = uid
      or lower(username) in ('trumancooper', 'truman_cooper');

  -- Wipe Auth user + password. Username is free for Create account again.
  delete from auth.users where id = uid;
end $$;

commit;
