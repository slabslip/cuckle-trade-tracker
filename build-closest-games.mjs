#!/usr/bin/env node
/**
 * Closest Games book for League Data.
 *
 *   node build-closest-games.mjs [league_id]
 *
 * Fetches Sleeper matchups across seasons, ranks by smallest margin,
 * attaches season-arc / standings year impact → ui/closest-games.json
 */
import { existsSync, readFileSync } from "node:fs";
import {
  isSleeperLeagueId,
  leagueRawDir,
  setLeagueId,
  sleeperGet,
  writeUi,
  LEAGUE_ID,
  readUi,
} from "./lib.mjs";
import {
  buildClosestGamesBook,
  gamesFromMatchupRows,
} from "./lib/closest-games.mjs";

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

const leagues = loadRaw("leagues.json", []) || [];
const seatsRaw = loadRaw("seats.json", []) || [];
const members = loadRaw("members.json", []) || [];
const standings = loadRaw("sleeper_season_standings.json", []) || [];
const weekly = loadRaw("weekly_scores.json", null);
const arcsBook = readUi("season-arcs.json", null);

const nameByUser = new Map();
for (const block of standings) {
  for (const row of block.rows || []) {
    if (row && row.user_id && row.name) {
      nameByUser.set(String(row.user_id), String(row.name));
    }
  }
}
{
  const uiPath = `${leagueRawDir()}/../ui/members.json`;
  if (existsSync(uiPath)) {
    try {
      for (const m of JSON.parse(readFileSync(uiPath, "utf8")) || []) {
        if (m && m.user_id && m.name) nameByUser.set(String(m.user_id), String(m.name));
      }
    } catch (_) { /* keep */ }
  }
}
for (const m of members) {
  if (!m || !m.user_id) continue;
  const uid = String(m.user_id);
  if (nameByUser.has(uid)) continue;
  const nm = m.name || m.canonical_name || m.display_name;
  if (nm) nameByUser.set(uid, String(nm));
}

const playoffStartBySeason = new Map();
for (const block of (weekly && weekly.seasons) || []) {
  if (block && block.season != null && block.playoff_week_start != null) {
    playoffStartBySeason.set(String(block.season), Number(block.playoff_week_start) || 14);
  }
}

const state = await sleeperGet(`/state/nfl`);
const liveSeason = state && String(state.season);
const liveWeek = Number(state && state.week);

const allGames = [];
let weeksFetched = 0;

for (const lg of leagues) {
  const leagueId = String(lg.league_id);
  if (lg.provider === "espn" || !isSleeperLeagueId(leagueId)) continue;
  const season = String(lg.season);
  let last = 18;
  if (liveSeason && season === liveSeason && Number.isFinite(liveWeek)) {
    last = Math.max(0, liveWeek - 1);
  }
  const rosterToUser = new Map();
  for (const s of seatsRaw) {
    if (!s || String(s.league_id) !== leagueId) continue;
    const uid = String(s.owner_id || "");
    if (!uid) continue;
    rosterToUser.set(Number(s.roster_id), uid);
    rosterToUser.set(String(s.roster_id), uid);
  }
  const block = standings.find((b) => String(b.season) === season);
  for (const row of (block && block.rows) || []) {
    if (!row || row.user_id == null || row.roster_id == null) continue;
    const uid = String(row.user_id);
    rosterToUser.set(Number(row.roster_id), uid);
    rosterToUser.set(String(row.roster_id), uid);
    if (!nameByUser.has(uid) && row.name) nameByUser.set(uid, String(row.name));
  }
  const playoffStart = playoffStartBySeason.get(season) || 14;
  for (let week = 1; week <= last; week++) {
    const rows = await matchupsFor(leagueId, week);
    weeksFetched += 1;
    const phase = week >= playoffStart ? "playoff" : "regular";
    const games = gamesFromMatchupRows(rows, {
      season,
      week,
      phase,
      rosterToUser,
      nameByUser,
    });
    allGames.push(...games);
  }
}

const asOf = new Date().toISOString().slice(0, 10);
const book = buildClosestGamesBook({
  games: allGames,
  nScanned: allGames.length,
  arcsBook,
  standings,
  leagueId: LEAGUE_ID,
  asOf,
});

writeUi("closest-games.json", book);

console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n_games: book.n_games,
  weeks_fetched: weeksFetched,
  top: (book.games || []).slice(0, 5).map((g) => ({
    rank: g.rank,
    season: g.season,
    week: g.week,
    margin: g.margin,
    a: g.a && g.a.name,
    b: g.b && g.b.name,
    score: g.a && g.b ? `${g.a.points}-${g.b.points}` : null,
  })),
  out: "ui/closest-games.json",
}));
