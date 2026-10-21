-- Wave 22 — forgot username/password + reclaim seat
--
-- Accounts sign in as {username}@users.cuckle.invalid, so a forgotten login
-- cannot get a real inbox mail unless they saved recover_email.
-- Commissioner Reset login (reissue) stores who had the seat so the new
-- CF- ticket can restore that username or let them pick a new one.

alter table public.seat_invites
  add column if not exists prior_auth_user_id uuid;
alter table public.seat_invites
  add column if not exists prior_username text;

comment on column public.seat_invites.prior_auth_user_id is
  'Last account on this seat, set when Reset login / Reissue mints a new ticket.';
comment on column public.seat_invites.prior_username is
  'Last username on this seat, offered on the Forgot reclaim form.';

alter table public.app_profiles
  add column if not exists recover_email text;

comment on column public.app_profiles.recover_email is
  'Optional real inbox for Forgot → email me a reset. Not the sign-in id.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_profiles'::regclass
      and conname = 'app_profiles_recover_email_shape'
  ) then
    alter table public.app_profiles
      add constraint app_profiles_recover_email_shape
      check (
        recover_email is null
        or recover_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
      );
  end if;
end $$;
