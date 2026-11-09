#!/usr/bin/env node
/**
 * Persist week-by-week starter ids from Sleeper matchups.
 *
 *   node build-player-starts.mjs [league_id]
 *
 * Writes raw/player_starts.json for Pipeline belief / use scoring.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  isSleeperLeagueId,
  leagueRawDir,
  setLeagueId,
  sleeperGet,
  writeJson,
  LEAGUE_ID,
} from "./lib.mjs";
import { PLAYER_STARTS_V, aggregateStartsByPlayer } from "./lib/player-starts.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function loadRaw(name, fallback) {
  const p = `${leagueRawDir()}/${name}`;
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf8"));
}

async function matchupsFor(leagueId, week) {
  let lastErr = null;
  for (let i = 0; i < 4; i++) {
    try {
      const rows = await sleeperGet(`/league/${leagueId}/matchups/${week}`);
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr || new Error(`matchups ${leagueId} w${week}`);
}

const leagues = loadRaw("leagues.json", []);
const seats = loadRaw("seats.json", []);
const ownerBy = {};
for (const s of seats) {
  if (!s || s.league_id == null || s.roster_id == null || !s.owner_id) continue;
  ownerBy[`${s.league_id}:${s.roster_id}`] = String(s.owner_id);
}

const rows = [];
const seasons = [];
for (const lg of leagues) {
  const leagueId = String(lg.league_id);
  if (lg.provider === "espn" || !isSleeperLeagueId(leagueId)) continue;
  const season = String(lg.season);
  const meta = await sleeperGet(`/league/${leagueId}`);
  const pws = Number(meta && meta.settings && meta.settings.playoff_week_start);
  if (!Number.isFinite(pws) || pws < 2) {
    throw new Error(`league ${leagueId} (${season}) missing playoff_week_start`);
  }
  const state = await sleeperGet(`/state/nfl`);
  const liveSeason = state && String(state.season);
  const liveWeek = Number(state && state.week);
  let last = 18;
  if (liveSeason && season === liveSeason && Number.isFinite(liveWeek)) {
    last = Math.max(0, liveWeek - 1);
  }
  let weeksKept = 0;
  for (let week = 1; week <= last; week++) {
    const matchups = await matchupsFor(leagueId, week);
    let scoredTeams = 0;
    const weekRows = [];
    for (const m of matchups) {
      const pts = Number(m && m.points);
      if (!Number.isFinite(pts) || pts <= 0) continue;
      scoredTeams += 1;
      const rid = m.roster_id;
      const uid = ownerBy[`${leagueId}:${rid}`] || null;
      if (!uid) continue;
      const starters = Array.isArray(m.starters) ? m.starters : [];
      for (const raw of starters) {
        const pid = String(raw || "");
        if (!pid || pid === "0") continue;
        weekRows.push({
          season,
          league_id: leagueId,
          week,
          roster_id: rid,
          user_id: uid,
          player_id: pid,
          phase: week < pws ? "regular" : "playoff",
        });
      }
    }
    // Partial / in-progress slates are not a week.
    if (scoredTeams < 8) continue;
    rows.push(...weekRows);
    weeksKept += 1;
  }
  seasons.push({
    season,
    league_id: leagueId,
    playoff_week_start: pws,
    weeks: weeksKept,
  });
}

const byPlayer = aggregateStartsByPlayer(rows);
// Persist aggregates only — full week rows are ~4MB and rebuildable from Sleeper.
const book = {
  v: PLAYER_STARTS_V,
  as_of: new Date().toISOString().slice(0, 10),
  league_id: String(LEAGUE_ID || ""),
  n_rows: rows.length,
  n_players: Object.keys(byPlayer).length,
  seasons,
  by_player: byPlayer,
};

writeJson("player_starts.json", book);
console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n_rows: book.n_rows,
  n_players: book.n_players,
  seasons: seasons.map((s) => `${s.season}:${s.weeks}w`),
  out: "raw/player_starts.json",
}));
