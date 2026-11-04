#!/usr/bin/env node
/**
 * Head-to-head book for League Data.
 *
 *   node build-head-to-head.mjs [league_id]
 *
 * Fetches Sleeper matchups for each season on the book and aggregates
 * all-time W-L-T + PF/PA between every seat pair.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  isSleeperLeagueId,
  leagueRawDir,
  setLeagueId,
  sleeperGet,
  writeUi,
  LEAGUE_ID,
} from "./lib.mjs";
import {
  buildHeadToHeadBook,
  ingestWeek,
} from "./lib/head-to-head.mjs";

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
    } catch (_) { /* keep standings names */ }
  }
}
for (const m of members) {
  if (!m || !m.user_id) continue;
  const uid = String(m.user_id);
  if (nameByUser.has(uid)) continue;
  const nm = m.name || m.canonical_name || m.display_name;
  if (nm) nameByUser.set(uid, String(nm));
}

const ownerBy = new Map();
for (const s of seatsRaw) {
  if (!s || s.league_id == null || s.roster_id == null || !s.owner_id) continue;
  ownerBy.set(`${s.league_id}:${s.roster_id}`, String(s.owner_id));
}

const pairs = new Map();
const seenUsers = new Map();
let weeksKept = 0;

const state = await sleeperGet(`/state/nfl`);
const liveSeason = state && String(state.season);
const liveWeek = Number(state && state.week);

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
    if (!seenUsers.has(uid)) {
      seenUsers.set(uid, nameByUser.get(uid) || uid);
    }
  }
  // Fall back to standings rows for that season when seats.json is thin.
  const block = standings.find((b) => String(b.season) === season);
  for (const row of (block && block.rows) || []) {
    if (!row || row.user_id == null || row.roster_id == null) continue;
    const uid = String(row.user_id);
    rosterToUser.set(Number(row.roster_id), uid);
    rosterToUser.set(String(row.roster_id), uid);
    if (!seenUsers.has(uid)) {
      seenUsers.set(uid, String(row.name || nameByUser.get(uid) || uid));
    }
  }

  for (let week = 1; week <= last; week++) {
    const rows = await matchupsFor(leagueId, week);
    const scored = (rows || []).filter((m) => Number(m && m.points) > 0);
    // Partial / in-progress slates stay out (same bar as weekly-scores).
    if (scored.length < 8) continue;
    const before = pairs.size;
    ingestWeek(pairs, scored, rosterToUser, season);
    weeksKept += 1;
    if (pairs.size === before && week === 1) {
      // still fine — first week may be all new pairs later
    }
  }
  console.log(`h2h ${season} league=${leagueId} through W${last}`);
}

const seats = [...seenUsers.entries()].map(([user_id, name]) => ({
  user_id,
  name: nameByUser.get(user_id) || name,
}));
for (const [uid, name] of nameByUser) {
  if (!seats.some((s) => s.user_id === uid)) seats.push({ user_id: uid, name });
}

const book = buildHeadToHeadBook({
  leagueId: LEAGUE_ID,
  asOf: new Date().toISOString().slice(0, 10),
  seats,
  pairsMap: pairs,
  rule: {
    scope: "Sleeper matchups across completed weeks, all seasons on the book.",
    note: "Pick two seats. Record is games played head-to-head, regular season and playoffs.",
    weeks: weeksKept,
  },
});

writeUi("head-to-head.json", book);
console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n_seats: book.n_seats,
  n_pairs: book.n_pairs,
  weeks: weeksKept,
  out: "ui/head-to-head.json",
}));
