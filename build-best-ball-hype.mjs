#!/usr/bin/env node
/**
 * Best Ball Hype book for League Data.
 *
 * Scored weeks → BB hype tape. Remaining regular season → set-lineup proj for
 * Top 6 / Bottom 4 seeding. Champ bracket → set lineup. Toilet → best ball.
 *
 *   node build-best-ball-hype.mjs [league_id]
 */
import { existsSync, readFileSync } from "node:fs";
import {
  DATA,
  LEAGUE_ID,
  readJson,
  readUi,
  setLeagueId,
  sleeperGet,
  writeUi,
} from "./lib.mjs";
import { buildBestBallHypeBook } from "./lib/best-ball-hype.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function loadPlayers() {
  const path = `${DATA}/players.nfl.json`;
  if (!existsSync(path)) {
    throw new Error("missing data/players.nfl.json — run node ensure-players.mjs first");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function nameMap() {
  const aliases = readJson("aliases.overrides.json", {}) || {};
  const members = readUi("members.json", []) || [];
  const map = { ...aliases };
  for (const m of members) {
    if (m && m.user_id && m.name) map[String(m.user_id)] = m.name;
  }
  return map;
}

function ptsKeyFromLeague(live) {
  const rec = live && live.scoring_settings && Number(live.scoring_settings.rec);
  if (rec === 1) return "pts_ppr";
  if (rec === 0.5) return "pts_half_ppr";
  return "pts_std";
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

async function fetchWeekProjections(season, week, ptsKey) {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const qs = positions.map((p) => "position[]=" + p).join("&");
  const url = "https://api.sleeper.app/projections/nfl/" + season + "/" + week
    + "?season_type=regular&" + qs;
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const projs = await fetch(url).then((r) => (r.ok ? r.json() : []));
      const projBy = Object.create(null);
      for (const p of projs || []) {
        const st = p.stats || {};
        const pts = Number(st[ptsKey] || st.pts_ppr || st.pts_std || 0);
        if (p.player_id != null) projBy[String(p.player_id)] = pts;
      }
      return projBy;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr || new Error(`projections ${season} w${week}`);
}

async function main() {
  const leagueId = LEAGUE_ID;
  const live = await sleeperGet(`/league/${leagueId}`);
  if (!live) throw new Error(`league ${leagueId} missing`);
  const season = Number(live.season) || live.season;
  const lastScored = Number(live.settings?.last_scored_leg) || 0;
  const playoffWeekStart = Number(live.settings?.playoff_week_start) || 15;
  const playoffTeams = Number(live.settings?.playoff_teams) || 6;
  const playoffRounds = Number(live.settings?.playoff_rounds) || 3;
  const rosterPositions = live.roster_positions || [];
  const ptsKey = ptsKeyFromLeague(live);
  if (!lastScored) {
    writeUi("best-ball-hype.json", {
      v: 3,
      as_of: new Date().toISOString().slice(0, 10),
      league_id: String(leagueId),
      season,
      week: 0,
      seats: [],
      note: "No scored weeks yet.",
    });
    console.log("best-ball-hype: no scored weeks");
    return;
  }

  const [rosters, users, players] = await Promise.all([
    sleeperGet(`/league/${leagueId}/rosters`),
    sleeperGet(`/league/${leagueId}/users`),
    Promise.resolve(loadPlayers()),
  ]);

  const nameByUser = nameMap();
  for (const u of users || []) {
    const id = String(u.user_id);
    if (!nameByUser[id]) {
      nameByUser[id] = (u.metadata && u.metadata.team_name) || u.display_name || id;
    }
  }
  const ownerByRoster = {};
  const currentRosters = {};
  const currentStarters = {};
  for (const r of rosters || []) {
    const rid = Number(r.roster_id);
    ownerByRoster[rid] = r.owner_id;
    currentRosters[rid] = (r.players || []).map(String).filter((id) => id && id !== "0");
    currentStarters[rid] = (r.starters || []).map(String).filter((id) => id && id !== "0");
  }

  const weeks = [];
  for (let w = 1; w <= lastScored; w++) {
    weeks.push({ week: w, rows: await matchupsFor(leagueId, w) });
  }

  // Remaining RS + playoff weeks need projections.
  const lastProjWeek = Math.min(playoffWeekStart + Math.max(playoffRounds, 2) - 1, 18);
  const rsFutureWeeks = [];
  const projectionsByWeek = {};
  for (let w = lastScored + 1; w <= lastProjWeek; w++) {
    const rows = await matchupsFor(leagueId, w);
    if (w < playoffWeekStart && rows.length) {
      rsFutureWeeks.push({ week: w, rows });
    }
    projectionsByWeek[w] = await fetchWeekProjections(season, w, ptsKey);
  }

  const book = buildBestBallHypeBook({
    weeks,
    rsFutureWeeks,
    currentRosters,
    currentStarters,
    projectionsByWeek,
    rosterPositions,
    players,
    ownerByRoster,
    nameByUser,
    season,
    week: lastScored,
    playoffWeekStart,
    playoffTeams,
    leagueId,
    asOf: new Date().toISOString().slice(0, 10),
  });

  writeUi("best-ball-hype.json", book);
  const champ = (book.seats || []).filter((s) => s.bracket === "champ")
    .sort((a, b) => (a.place_proj || 99) - (b.place_proj || 99));
  const toilet = (book.seats || []).filter((s) => s.bracket === "toilet")
    .sort((a, b) => (a.place_proj || 99) - (b.place_proj || 99));
  console.log(
    "best-ball-hype",
    book.season,
    "scored w" + book.week,
    "RS→w" + book.rs_through_week,
    "playoffs w" + book.playoff_week_start,
  );
  console.log(
    "  champ:",
    champ.map((s) => "#" + s.place_proj + " " + s.name + " (seed " + s.seed + ")").join(", "),
  );
  console.log(
    "  toilet:",
    toilet.map((s) => "#" + s.place_proj + " " + s.name + " (seed " + s.seed + ")").join(", "),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
