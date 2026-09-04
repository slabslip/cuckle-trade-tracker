-- ============================================================================
-- wave12 — league bet Ledger (Tip Slip–style slips with accept/lock)
-- ============================================================================
-- Paste into Supabase SQL Editor and Run. Idempotent.
-- Companion: docs/LEDGER_SDD.md + docs/SUPABASE_SETUP.md § Ledger.
--
-- Status machine:
--   proposed → open (both sides locked)
--   proposed → declined | canceled | expired
--   open → settled | canceled (admin void)
-- Accept rule: proposer auto-locks on insert; counterparty Accept/Decline.
-- ============================================================================

create table if not exists public.ledger_bets (
  id uuid primary key default gen_random_uuid(),
  sleeper_league_id text not null,
  title text not null,
  terms text not null default '',
  odds text,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  side_a text not null,
  side_b text not null,
  side_a_claim text,
  side_b_claim text,
  proposer text not null,
  status text not null default 'proposed'
    check (status in ('proposed','open','settled','declined','canceled','expired','needs_review')),
  side_a_lock boolean not null default false,
  side_b_lock boolean not null default false,
  deadline_at timestamptz,
  winner text check (winner is null or winner in ('side_a','side_b','push')),
  source text not null default 'manual'
    check (source in ('shortcut','manual','admin')),
  source_text text,
  raw_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ledger_bets_distinct_sides check (side_a <> side_b)
);

create index if not exists ledger_bets_league_status_idx
  on public.ledger_bets (sleeper_league_id, status, created_at desc);

create index if not exists ledger_bets_league_parties_idx
  on public.ledger_bets (sleeper_league_id, side_a, side_b);

create unique index if not exists ledger_bets_idempotent_idx
  on public.ledger_bets (sleeper_league_id, raw_hash)
  where raw_hash is not null;

create table if not exists public.ledger_bet_events (
  id bigserial primary key,
  bet_id uuid not null references public.ledger_bets(id) on delete cascade,
  actor text,
  kind text not null
    check (kind in ('created','accepted','declined','edited','settled','note','canceled','expired')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ledger_bet_events_bet_idx
  on public.ledger_bet_events (bet_id, created_at desc);

create or replace function public.ledger_bets_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ledger_bets_touch_updated on public.ledger_bets;
create trigger ledger_bets_touch_updated
  before update on public.ledger_bets
  for each row execute function public.ledger_bets_touch_updated();

-- Expire proposed bets past deadline on read path (call from client or cron).
create or replace function public.ledger_expire_proposed(p_league text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.ledger_bets
     set status = 'expired'
   where sleeper_league_id = p_league
     and status = 'proposed'
     and deadline_at is not null
     and deadline_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.ledger_expire_proposed(text) from public;
grant execute on function public.ledger_expire_proposed(text) to authenticated, anon;

-- Force proposer / party locks cannot invent seats: membership check on write.
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
    if new.side_a = new.side_b then
      raise exception 'ledger sides must differ';
    end if;
    -- Proposer auto-lock
    if new.proposer = new.side_a then
      new.side_a_lock := true;
    elsif new.proposer = new.side_b then
      new.side_b_lock := true;
    end if;
    if new.side_a_lock and new.side_b_lock and new.status = 'proposed' then
      new.status := 'open';
    end if;
    return new;
  end if;

  -- UPDATE: authenticated seat from JWT membership
  select m.sleeper_user_id into seat
    from public.league_memberships m
   where m.sleeper_league_id = new.sleeper_league_id
     and m.auth_user_id = auth.uid()
   limit 1;

  if seat is null and auth.role() = 'authenticated' then
    raise exception 'no membership for ledger write';
  end if;

  -- Expire check
  if new.status = 'proposed' and new.deadline_at is not null and new.deadline_at < now() then
    new.status := 'expired';
  end if;

  -- Both locks → open
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

alter table public.ledger_bets enable row level security;
alter table public.ledger_bet_events enable row level security;

-- Members of the league can read all slips in that league.
drop policy if exists ledger_bets_select_member on public.ledger_bets;
create policy ledger_bets_select_member on public.ledger_bets
  for select to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_bets.sleeper_league_id
         and m.auth_user_id = auth.uid()
    )
  );

-- Party can update their own lock / settle while status allows.
drop policy if exists ledger_bets_update_party on public.ledger_bets;
create policy ledger_bets_update_party on public.ledger_bets
  for update to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_bets.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and m.sleeper_user_id in (ledger_bets.side_a, ledger_bets.side_b)
    )
  )
  with check (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_bets.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and m.sleeper_user_id in (ledger_bets.side_a, ledger_bets.side_b)
    )
  );

-- Authenticated insert for in-app manual create (same league membership).
drop policy if exists ledger_bets_insert_member on public.ledger_bets;
create policy ledger_bets_insert_member on public.ledger_bets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_bets.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and m.sleeper_user_id = ledger_bets.proposer
    )
  );

-- Events: members can read; writers insert for own actions.
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
    )
  );

drop policy if exists ledger_events_insert_member on public.ledger_bet_events;
create policy ledger_events_insert_member on public.ledger_bet_events
  for insert to authenticated
  with check (
    exists (
      select 1
        from public.ledger_bets b
        join public.league_memberships m
          on m.sleeper_league_id = b.sleeper_league_id
         and m.auth_user_id = auth.uid()
       where b.id = ledger_bet_events.bet_id
    )
  );

grant select, insert, update on table public.ledger_bets to authenticated;
grant select, insert on table public.ledger_bet_events to authenticated;
grant usage, select on sequence public.ledger_bet_events_id_seq to authenticated;

-- Edge Function ledger-ingest uses service_role (bypasses RLS) after validating
-- LEDGER_INGEST_SECRET. No anon insert on ledger_bets.
revoke insert on table public.ledger_bets from anon;
revoke all on table public.ledger_bets from anon;
grant select on table public.ledger_bets to anon; -- optional public read off; prefer authenticated only
revoke select on table public.ledger_bets from anon;
