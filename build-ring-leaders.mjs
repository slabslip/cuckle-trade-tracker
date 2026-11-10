#!/usr/bin/env node
/**
 * Ring leaders book for League Data.
 *
 *   node build-ring-leaders.mjs [league_id]
 *
 * For each title in titles.json, load the championship-week matchup and credit
 * every player on the champ seat's full roster with a ring.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  CUCKLE_LEAGUE_ID,
  DATA,
  LEAGUE_ID,
  isSleeperLeagueId,
  leagueRawDir,
  readJson,
  readUi,
  setLeagueId,
  sleeperGet,
  writeUi,
} from "./lib.mjs";
import {
  RING_LEADERS_TOP_N,
  buildRingLeadersBook,
} from "./lib/ring-leaders.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID || CUCKLE_LEAGUE_ID);

function loadRaw(name, fallback) {
  const p = `${leagueRawDir()}/${name}`;
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf8"));
}

function playerName(players, pid) {
  const p = players && players[String(pid)];
  if (!p) return String(pid);
  return p.full_name
    || [p.first_name, p.last_name].filter(Boolean).join(" ")
    || p.name
    || String(pid);
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

const titlesBook = readUi("titles.json", null);
const titles = (titlesBook && Array.isArray(titlesBook.titles)) ? titlesBook.titles : [];
if (!titles.length) {
  console.error("missing titles.json — run title-path first");
  process.exit(1);
}

const leagues = loadRaw("leagues.json", []) || [];
const leagueBySeason = new Map();
for (const lg of leagues) {
  if (!lg || lg.season == null || !lg.league_id) continue;
  if (lg.provider === "espn") continue;
  const lid = String(lg.league_id);
  if (!isSleeperLeagueId(lid)) continue;
  leagueBySeason.set(String(lg.season), lid);
}

const playersNfl = readJson("players.nfl.json", {}) || {};
const credits = [];
const seasonsOk = [];
const seasonsFallback = [];

for (const t of titles) {
  if (!t || t.season == null || t.roster_id == null) continue;
  const season = String(t.season);
  const team = String(t.name || "—");
  const rid = Number(t.roster_id);
  const week = t.final && t.final.week != null
    ? Number(t.final.week)
    : null;
  const leagueId = leagueBySeason.get(season);
  let credited = false;

  if (leagueId && Number.isFinite(week) && week > 0) {
    try {
      const rows = await matchupsFor(leagueId, week);
      const row = (rows || []).find((m) => Number(m.roster_id) === rid);
      const roster = (row && Array.isArray(row.players) ? row.players : [])
        .map((id) => String(id))
        .filter((id) => id && id !== "0");
      const starters = new Set(
        (row && Array.isArray(row.starters) ? row.starters : [])
          .map((id) => String(id))
          .filter((id) => id && id !== "0"),
      );
      if (roster.length) {
        for (const pid of roster) {
          credits.push({
            player_id: pid,
            player: playerName(playersNfl, pid),
            season,
            team,
            user_id: t.user_id,
            roster_id: rid,
            week,
            started: starters.has(pid),
          });
        }
        credited = true;
        seasonsOk.push({ season, team, week, n: roster.length, source: "matchup_players" });
      }
    } catch (err) {
      console.warn(`ring-leaders ${season}: matchup fetch failed —`, err && err.message ? err.message : err);
    }
  }

  if (!credited) {
    // Fallback: title-week starters already on the titles book.
    const starters = (t.title_lineup && Array.isArray(t.title_lineup.starters))
      ? t.title_lineup.starters : [];
    for (const s of starters) {
      if (!s || s.player_id == null) continue;
      credits.push({
        player_id: String(s.player_id),
        player: s.player || playerName(playersNfl, s.player_id),
        season,
        team,
        user_id: t.user_id,
        roster_id: rid,
        week,
        started: true,
      });
    }
    if (starters.length) {
      seasonsFallback.push({ season, team, week, n: starters.length, source: "title_lineup_starters" });
    }
  }
}

const book = buildRingLeadersBook({
  credits,
  topN: RING_LEADERS_TOP_N,
  leagueId: LEAGUE_ID,
  nTitles: titles.length,
  asOf: new Date().toISOString().slice(0, 10),
});
writeUi("ring-leaders.json", book);

console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n_titles: book.n_titles,
  n_players: book.n_players,
  top_n: book.top_n,
  seasons_ok: seasonsOk,
  seasons_fallback: seasonsFallback,
  top: (book.players || []).slice(0, 5).map((p) => ({
    rank: p.rank,
    player: p.player,
    rings: p.rings,
    teams: p.teams,
  })),
  out: "ui/ring-leaders.json",
}, null, 2));
