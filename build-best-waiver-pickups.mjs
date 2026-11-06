#!/usr/bin/env node
/**
 * Best waiver pickups book for League Data.
 *
 *   node build-best-waiver-pickups.mjs [league_id]
 */
import { existsSync, readFileSync } from "node:fs";
import {
  DATA,
  detectLeagueFormat,
  leagueRawDir,
  readJson,
  setLeagueId,
  writeUi,
  LEAGUE_ID,
} from "./lib.mjs";
import { buildBestWaiverPickupsBook } from "./lib/best-waiver-pickups.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function playerName(players, pid) {
  const p = players && players[String(pid)];
  if (!p) return String(pid);
  return [p.first_name, p.last_name].filter(Boolean).join(" ")
    || p.full_name
    || String(pid);
}

const format = detectLeagueFormat(readJson("leagues.json", []) || []);
const curveName = format.format_key === "1qb" ? "value_curve_1qb.json" : "value_curve.json";
const curve = readJson(curveName, null) || readJson("value_curve.json", []) || [];

const moves = readJson("moves.json", []) || [];
const draftPicks = readJson("draft_picks.json", []) || [];
const seats = readJson("seats.json", []) || [];
const members = readJson("members.json", []) || [];
const standings = readJson("sleeper_season_standings.json", []) || [];
const players = (() => {
  const path = `${DATA}/players.nfl.json`;
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
})();

const nameByUser = new Map();
for (const block of standings) {
  for (const row of block.rows || []) {
    if (row?.user_id && row.name) nameByUser.set(String(row.user_id), String(row.name));
  }
}
{
  const uiPath = `${leagueRawDir()}/../ui/members.json`;
  if (existsSync(uiPath)) {
    try {
      for (const m of JSON.parse(readFileSync(uiPath, "utf8")) || []) {
        if (m?.user_id && m.name) nameByUser.set(String(m.user_id), String(m.name));
      }
    } catch (_) { /* keep standings */ }
  }
}
for (const m of members) {
  if (!m?.user_id) continue;
  const uid = String(m.user_id);
  if (nameByUser.has(uid)) continue;
  const nm = m.name || m.canonical_name || m.display_name;
  if (nm) nameByUser.set(uid, String(nm));
}

const seatBy = new Map();
for (const s of seats) {
  if (!s || s.roster_id == null || !s.owner_id) continue;
  const uid = String(s.owner_id);
  const name = nameByUser.get(uid) || uid;
  const season = String(s.season || "");
  const row = { user_id: uid, name };
  if (season) seatBy.set(`${season}:${Number(s.roster_id)}`, row);
  seatBy.set(`*:${Number(s.roster_id)}`, row);
}
for (const block of standings) {
  const season = String(block.season || "");
  for (const row of block.rows || []) {
    if (!row || row.roster_id == null || !row.user_id) continue;
    const uid = String(row.user_id);
    const name = String(row.name || nameByUser.get(uid) || uid);
    if (season) seatBy.set(`${season}:${Number(row.roster_id)}`, { user_id: uid, name });
  }
}

const nameById = new Map();
for (const pid of Object.keys(players || {})) {
  nameById.set(String(pid), playerName(players, pid));
}

const book = buildBestWaiverPickupsBook({
  leagueId: LEAGUE_ID,
  formatKey: format.format_key || "2qb",
  curveName,
  curve,
  moves,
  draftPicks,
  nameById,
  seatBy,
});

writeUi("best-waiver-pickups.json", book);
console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n_pickups: book.n_pickups,
  n_scored: book.n_scored,
  to_today: book.to_today.slice(0, 3).map((r) => `${r.player}+${r.delta}`),
  to_peak: book.to_peak.slice(0, 3).map((r) => `${r.player}+${r.delta}`),
  out: "ui/best-waiver-pickups.json",
}));
