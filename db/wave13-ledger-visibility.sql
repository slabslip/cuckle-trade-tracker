-- ============================================================================
-- wave13 — ledger visibility (public / private) + tightened SELECT RLS
-- ============================================================================
-- Paste into Supabase SQL Editor and Run after wave12-ledger.sql. Idempotent.
-- Companion: docs/LEDGER_SDD.md + docs/SUPABASE_SETUP.md § Ledger.
--
-- Rules:
--   visibility default 'public'
--   private slips: only the two parties (side_a / side_b) can SELECT
--   public slips: any league member can SELECT
--   either party may PATCH visibility (existing party UPDATE policy)
-- ============================================================================

alter table public.ledger_bets
  add column if not exists visibility text not null default 'public';

-- Backfill any nulls (column was just added with default; keep safe for older drafts).
update public.ledger_bets
   set visibility = 'public'
 where visibility is null or visibility = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ledger_bets_visibility_check'
       and conrelid = 'public.ledger_bets'::regclass
  ) then
    alter table public.ledger_bets
      add constraint ledger_bets_visibility_check
      check (visibility in ('public', 'private'));
  end if;
end $$;

create index if not exists ledger_bets_league_visibility_idx
  on public.ledger_bets (sleeper_league_id, visibility, status);

-- Replace league-wide SELECT with: member AND (party OR public).
drop policy if exists ledger_bets_select_member on public.ledger_bets;
create policy ledger_bets_select_member on public.ledger_bets
  for select to authenticated
  using (
    exists (
      select 1 from public.league_memberships m
       where m.sleeper_league_id = ledger_bets.sleeper_league_id
         and m.auth_user_id = auth.uid()
         and (
           ledger_bets.visibility = 'public'
           or m.sleeper_user_id in (ledger_bets.side_a, ledger_bets.side_b)
         )
    )
  );

-- Events follow the same visibility gate via the parent bet.
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
           b.visibility = 'public'
           or m.sleeper_user_id in (b.side_a, b.side_b)
         )
    )
  );
