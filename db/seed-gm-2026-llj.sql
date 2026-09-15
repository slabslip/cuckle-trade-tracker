-- Seed Gm 2026 LLJ as a ready hosted book (same shape as the Cuckle seed).
-- Idempotent. Does not set created_by — the first commissioner Create claim
-- still goes through join-league.
--
-- Optional: paste in the Supabase SQL editor if you want the row before anyone
-- taps Add this league. The live add path does not require this file.

insert into public.leagues (
  sleeper_league_id, name, season, sport, total_rosters, status, espn_league_id
)
values (
  '1389723418827460608',
  'Gm 2026 LLJ',
  '2026',
  'nfl',
  12,
  'ready',
  '35763180'
)
on conflict (sleeper_league_id) do update
  set name = excluded.name,
      season = excluded.season,
      total_rosters = excluded.total_rosters,
      status = 'ready',
      espn_league_id = excluded.espn_league_id;
