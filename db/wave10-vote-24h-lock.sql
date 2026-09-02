-- wave10: one ballot per claimed seat per trade; change only within 24h of first cast.
-- Run in Supabase SQL editor after wave9.
--
-- Rules:
--   * Unique (sleeper_league_id, transaction_id, voter) already enforces one row.
--   * created_at is the initial cast time and stays pinned on normal updates.
--   * After created_at + 24 hours, choice cannot change (including clear → __none__).
--   * Clearing a real vote to __none__ is rejected (change sides instead).
--   * Resurrecting __none__ → a real choice starts a new 24h window (fresh created_at).

create or replace function public.trade_votes_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- New initial cast after a cleared sentinel: start a fresh edit window.
  if old.choice = '__none__'
     and new.choice is distinct from old.choice
     and new.choice is distinct from '__none__' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- Pin first-cast time; stamp updated_at.
  new.updated_at := now();
  new.created_at := old.created_at;

  -- No-op updates are fine.
  if new.choice is not distinct from old.choice then
    return new;
  end if;

  -- One vote: do not clear a real ballot to __none__. Change sides within 24h instead.
  if old.choice is distinct from '__none__' and new.choice = '__none__' then
    raise exception 'vote cannot be cleared; change sides within 24 hours of first cast'
      using errcode = 'check_violation';
  end if;

  -- Locked after 24 hours from initial cast.
  if old.created_at <= (now() - interval '24 hours') then
    raise exception 'vote locked after 24 hours'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- Recreate trigger (same name) so the replacement function is bound.
drop trigger if exists trade_votes_touch_updated_at on public.trade_votes;
create trigger trade_votes_touch_updated_at
  before update on public.trade_votes
  for each row execute function public.trade_votes_touch_updated_at();

comment on function public.trade_votes_touch_updated_at() is
  'Pins created_at, locks choice changes after 24h, rejects clear-to-__none__, resets window when resurrecting __none__.';
