-- ============================================================================
-- wave17 — NFL clock kinds, win hints, seat style memory
-- ============================================================================
-- Paste AFTER wave16. Idempotent.
-- Companion: docs/LEDGER_SDD.md (clock chips / Due / Live-Settled-Closed / compose agent)
-- ============================================================================

alter table public.ledger_bets
  add column if not exists clock_kind text;

alter table public.ledger_bets
  add column if not exists clock_meta jsonb not null default '{}'::jsonb;

alter table public.ledger_bets
  add column if not exists suggest_pick text;

alter table public.ledger_bets
  add column if not exists suggest_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ledger_bets_clock_kind_check'
       and conrelid = 'public.ledger_bets'::regclass
  ) then
    alter table public.ledger_bets
      add constraint ledger_bets_clock_kind_check
      check (clock_kind is null or clock_kind in (
        'this_week','next_week','regular','season','playoffs','date'
      ));
  end if;
end $$;

comment on column public.ledger_bets.clock_kind is
  'NFL-aware clock: this_week / next_week / regular / season / playoffs / date.';
comment on column public.ledger_bets.clock_meta is
  'Sleeper snapshot at Send: season, week, season_type. Used to re-resolve deadline_at.';
comment on column public.ledger_bets.suggest_pick is
  'Hint only (player name or side). Never writes winner.';
comment on column public.ledger_bets.suggest_note is
  'Chuckle-read sentence shown after the clock. Not official.';

alter table public.ledger_bet_events
  drop constraint if exists ledger_bet_events_kind_check;

alter table public.ledger_bet_events
  add constraint ledger_bet_events_kind_check
  check (kind in (
    'created','accepted','declined','edited','settled','note','canceled','expired','sent',
    'countered','claimed','voted','clock_due','suggested'
  ));

create table if not exists public.ledger_seat_style (
  sleeper_league_id text not null,
  seat text not null,
  them_id text,
  n integer not null default 0,
  stake_p50 integer,
  odds_p50 integer,
  clock_kind text,
  updated_at timestamptz not null default now(),
  primary key (sleeper_league_id, seat)
);

alter table public.ledger_seat_style enable row level security;

drop policy if exists ledger_seat_style_select_own on public.ledger_seat_style;
create policy ledger_seat_style_select_own on public.ledger_seat_style
  for select to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_seat_style.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and m.sleeper_user_id = ledger_seat_style.seat
    )
  );

drop policy if exists ledger_seat_style_upsert_own on public.ledger_seat_style;
create policy ledger_seat_style_upsert_own on public.ledger_seat_style
  for insert to authenticated
  with check (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_seat_style.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and m.sleeper_user_id = ledger_seat_style.seat
    )
  );

drop policy if exists ledger_seat_style_update_own on public.ledger_seat_style;
create policy ledger_seat_style_update_own on public.ledger_seat_style
  for update to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_seat_style.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and m.sleeper_user_id = ledger_seat_style.seat
    )
  )
  with check (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_seat_style.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and m.sleeper_user_id = ledger_seat_style.seat
    )
  );

grant select, insert, update on table public.ledger_seat_style to authenticated;
