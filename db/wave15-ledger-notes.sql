-- ============================================================================
-- wave15 — Ledger notes (one-sided drafts) + Finish/Send
-- ============================================================================
-- Paste into Supabase SQL Editor AFTER wave12 + wave13. Idempotent.
-- Companion: docs/LEDGER_NOTE_SDD.md
--
-- A note is filer-only (needs_review, side_b null, both locks false).
-- Send (app PATCH) sets side_b + status proposed + locks the filer.
-- ============================================================================

alter table public.ledger_bets
  alter column side_b drop not null;

alter table public.ledger_bets
  drop constraint if exists ledger_bets_distinct_sides;

alter table public.ledger_bets
  drop constraint if exists ledger_bets_sides_ok;

alter table public.ledger_bets
  add constraint ledger_bets_sides_ok check (
    side_b is null or side_a <> side_b
  );

alter table public.ledger_bets
  add column if not exists terms_json jsonb not null default '{}'::jsonb;

comment on column public.ledger_bets.terms_json is
  'Finish slip money: you_put_cents, you_win_cents, they_put_cents, they_win_cents.';

alter table public.ledger_bet_events
  drop constraint if exists ledger_bet_events_kind_check;

alter table public.ledger_bet_events
  add constraint ledger_bet_events_kind_check
  check (kind in (
    'created','accepted','declined','edited','settled','note','canceled','expired','sent'
  ));

alter table public.app_profiles
  add column if not exists phone_e164 text;

comment on column public.app_profiles.phone_e164 is
  'Optional E.164. SMS only when someone Sends a slip to this seat (v1.3).';

create or replace function public.ledger_bets_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seat text;
begin
  if tg_op = 'INSERT' then
    if new.side_b is not null and new.side_a = new.side_b then
      raise exception 'ledger sides must differ';
    end if;
    -- Draft notes: no auto-lock, never promote to open.
    if new.status = 'needs_review' then
      new.side_a_lock := false;
      new.side_b_lock := false;
      return new;
    end if;
    if new.proposer = new.side_a then
      new.side_a_lock := true;
    elsif new.side_b is not null and new.proposer = new.side_b then
      new.side_b_lock := true;
    end if;
    if new.side_a_lock and new.side_b_lock and new.status = 'proposed' then
      new.status := 'open';
    end if;
    return new;
  end if;

  select m.sleeper_user_id into seat
    from public.league_memberships m
   where m.sleeper_league_id = new.sleeper_league_id
     and m.auth_user_id = auth.uid()
   limit 1;

  if seat is null and auth.role() = 'authenticated' then
    raise exception 'no membership for ledger write';
  end if;

  if new.side_b is not null and new.side_a = new.side_b then
    raise exception 'ledger sides must differ';
  end if;

  if new.status = 'proposed' and new.deadline_at is not null and new.deadline_at < now() then
    new.status := 'expired';
  end if;

  if new.status = 'proposed' and new.side_a_lock and new.side_b_lock then
    new.status := 'open';
  end if;

  return new;
end;
$$;

drop trigger if exists ledger_bets_guard_write on public.ledger_bets;
create trigger ledger_bets_guard_write
  before insert or update on public.ledger_bets
  for each row execute function public.ledger_bets_guard_write();

-- Drafts are filer-only even if visibility is flipped. After Send, wave13 rules apply.
drop policy if exists ledger_bets_select_member on public.ledger_bets;
create policy ledger_bets_select_member on public.ledger_bets
  for select to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_bets.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and (
           (
             ledger_bets.status = 'needs_review'
             and m.sleeper_user_id = ledger_bets.proposer
           )
           or (
             ledger_bets.status is distinct from 'needs_review'
             and (
               ledger_bets.visibility = 'public'
               or m.sleeper_user_id in (ledger_bets.side_a, ledger_bets.side_b)
             )
           )
         )
    )
  );

drop policy if exists ledger_events_select_member on public.ledger_bet_events;
create policy ledger_events_select_member on public.ledger_bet_events
  for select to authenticated
  using (
    exists (
      select 1
        from public.ledger_bets b
        join public.league_memberships m
          on m.sleeper_league_id = b.sleeper_league_id
         and m.auth_user_id = auth.uid()
       where b.id = ledger_bet_events.bet_id
         and (
           (b.status = 'needs_review' and m.sleeper_user_id = b.proposer)
           or (
             b.status is distinct from 'needs_review'
             and (
               b.visibility = 'public'
               or m.sleeper_user_id in (b.side_a, b.side_b)
             )
           )
         )
    )
  );
