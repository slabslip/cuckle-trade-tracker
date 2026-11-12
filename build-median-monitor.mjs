#!/usr/bin/env node
/**
 * Median Monitor book for League Data.
 *
 *   node build-median-monitor.mjs [league_id]
 *
 * Runs this season’s regular-season weeks under Sleeper’s extra game vs league
 * median (H2H + vs-median) → ui/median-monitor.json
 */
import { existsSync, readFileSync } from "node:fs";
import {
  CUCKLE_LEAGUE_ID,
  LEAGUE_ID,
  leagueRawDir,
  setLeagueId,
  sleeperGet,
  writeUi,
} from "./lib.mjs";
import { buildMedianMonitorBook } from "./lib/median-monitor.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID || CUCKLE_LEAGUE_ID);

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

const weekly = loadRaw("weekly_scores.json", null);
if (!weekly || !Array.isArray(weekly.scores) || !weekly.scores.length) {
  console.error("missing weekly_scores.json — run weekly-scores first");
  process.exit(1);
}

const seatsRaw = loadRaw("seats.json", []) || [];
const members = loadRaw("members.json", []) || [];
const standings = loadRaw("sleeper_season_standings.json", []) || [];

const nameByUser = new Map();
const rosterToUser = new Map();

for (const block of standings) {
  for (const row of block.rows || []) {
    if (!row || row.user_id == null) continue;
    const uid = String(row.user_id);
    if (row.name) nameByUser.set(uid, String(row.name));
    if (row.roster_id != null) {
      rosterToUser.set(Number(row.roster_id), uid);
      rosterToUser.set(String(row.roster_id), uid);
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
  if (!nameByUser.has(uid)) {
    const nm = m.name || m.canonical_name || m.display_name;
    if (nm) nameByUser.set(uid, String(nm));
  }
}
for (const s of seatsRaw) {
  if (!s || String(s.league_id) !== String(LEAGUE_ID)) continue;
  const uid = String(s.owner_id || "");
  if (!uid || s.roster_id == null) continue;
  rosterToUser.set(Number(s.roster_id), uid);
  rosterToUser.set(String(s.roster_id), uid);
}

// Prefer the live NFL season when present on the tape; else newest season block.
let season = null;
let playoffStart = null;
let leagueIdForSeason = String(LEAGUE_ID);
try {
  const state = await sleeperGet(`/state/nfl`);
  if (state && state.season != null) season = String(state.season);
} catch (_) { /* fall through */ }

for (const block of weekly.seasons || []) {
  if (!block || block.season == null) continue;
  if (season && String(block.season) !== season) continue;
  if (!season) season = String(block.season);
  if (block.playoff_week_start != null) playoffStart = Number(block.playoff_week_start);
  if (block.league_id) leagueIdForSeason = String(block.league_id);
  if (season && String(block.season) === season) break;
}
if (!season) {
  const seasons = [...new Set((weekly.scores || []).map((s) => String(s.season)))].sort();
  season = seasons[seasons.length - 1] || String(new Date().getFullYear());
}
if (playoffStart == null) playoffStart = 15;

const weeks = [...new Set(
  (weekly.scores || [])
    .filter((s) => s && String(s.season) === season
      && Number(s.week) >= 1
      && Number(s.week) < playoffStart
      && (!s.phase || s.phase === "regular"))
    .map((s) => Number(s.week)),
)].filter((w) => Number.isFinite(w)).sort((a, b) => a - b);

const matchupsByWeek = new Map();
for (const week of weeks) {
  const rows = await matchupsFor(leagueIdForSeason, week);
  matchupsByWeek.set(week, rows);
}

const book = buildMedianMonitorBook({
  weeklyScores: weekly,
  matchupsByWeek,
  nameByUser,
  rosterToUser,
  season,
  playoffWeekStart: playoffStart,
  leagueId: leagueIdForSeason,
});
writeUi("median-monitor.json", book);

console.log(JSON.stringify({
  ok: true,
  v: book.v,
  season: book.season,
  weeks: book.weeks,
  n: book.n,
  top3: (book.seats || []).slice(0, 3).map((s) => ({
    rank: s.rank,
    name: s.name,
    combined: s.combined_record,
    h2h: s.h2h_record,
    median: s.median_record,
    place_h2h: s.place_h2h,
    delta: s.delta_lab,
  })),
}, null, 2));
