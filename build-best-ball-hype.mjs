#!/usr/bin/env node
/**
 * Best Ball Hype book for League Data.
 * Fetches scored Sleeper matchups (with players_points), builds optimal-lineup
 * W/L for the live season, writes data/ui/best-ball-hype.json.
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

async function main() {
  const leagueId = LEAGUE_ID;
  const live = await sleeperGet(`/league/${leagueId}`);
  if (!live) throw new Error(`league ${leagueId} missing`);
  const season = Number(live.season) || live.season;
  const lastScored = Number(live.settings?.last_scored_leg) || 0;
  const rosterPositions = live.roster_positions || [];
  if (!lastScored) {
    writeUi("best-ball-hype.json", {
      v: 1,
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
  for (const r of rosters || []) {
    ownerByRoster[Number(r.roster_id)] = r.owner_id;
  }

  const weeks = [];
  for (let w = 1; w <= lastScored; w++) {
    const rows = await matchupsFor(leagueId, w);
    weeks.push({ week: w, rows });
  }

  const book = buildBestBallHypeBook({
    weeks,
    rosterPositions,
    players,
    ownerByRoster,
    nameByUser,
    season,
    week: lastScored,
    leagueId,
    asOf: new Date().toISOString().slice(0, 10),
  });

  writeUi("best-ball-hype.json", book);
  console.log(
    "best-ball-hype",
    book.season,
    "w" + book.week,
    book.seats.length + " seats",
    "→",
    book.seats.slice(0, 3).map((s) => s.name + " " + s.record).join(", "),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
