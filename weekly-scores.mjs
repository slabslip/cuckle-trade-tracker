#!/usr/bin/env node
/**
 * Written weekly tape from Sleeper matchups. One row per scored team-week.
 * Used by build-cosmetics.mjs to unlock week-score title/emblem bands.
 */
import { existsSync, readFileSync } from "node:fs";
import { leagueRawDir, setLeagueId, sleeperGet, writeJson } from "./lib.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function loadRaw(name, fallback) {
  const p = `${leagueRawDir()}/${name}`;
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf8"));
}

const leagues = loadRaw("leagues.json", []);
const seats = loadRaw("seats.json", []);

const ownerBy = {};
for (const s of seats) {
  if (!s || s.league_id == null || s.roster_id == null || !s.owner_id) continue;
  ownerBy[`${s.league_id}:${s.roster_id}`] = String(s.owner_id);
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

const scores = [];
for (const lg of leagues) {
  const leagueId = String(lg.league_id);
  const season = String(lg.season);
  const state = await sleeperGet(`/state/nfl`);
  const liveSeason = state && String(state.season);
  const liveWeek = Number(state && state.week);
  // Current NFL week is still in flight — only persist completed weeks.
  let last = 18;
  if (liveSeason && season === liveSeason && Number.isFinite(liveWeek)) {
    last = Math.max(0, liveWeek - 1);
  }
  for (let week = 1; week <= last; week++) {
    const rows = await matchupsFor(leagueId, week);
    const kept = [];
    for (const m of rows) {
      const pts = Number(m && m.points);
      if (!Number.isFinite(pts) || pts <= 0) continue;
      const rid = m.roster_id;
      const uid = ownerBy[`${leagueId}:${rid}`] || null;
      if (!uid) continue;
      kept.push({
        season,
        league_id: leagueId,
        week,
        roster_id: rid,
        user_id: uid,
        points: Math.round(pts * 100) / 100,
      });
    }
    // Partial / in-progress slates (4 teams at 4–16 pts) are not a week.
    if (kept.length < 8) continue;
    scores.push(...kept);
  }
}

scores.sort((a, b) => {
  if (a.season !== b.season) return String(a.season).localeCompare(String(b.season));
  if (a.week !== b.week) return a.week - b.week;
  return String(a.user_id).localeCompare(String(b.user_id));
});

const book = {
  v: 1,
  as_of: new Date().toISOString().slice(0, 10),
  n: scores.length,
  scores,
};

writeJson("weekly_scores.json", book);

const byUid = {};
let min = Infinity;
let max = -Infinity;
for (const s of scores) {
  min = Math.min(min, s.points);
  max = Math.max(max, s.points);
  (byUid[s.user_id] || (byUid[s.user_id] = [])).push(s.points);
}
console.log(`weekly_scores.json ${scores.length} team-weeks, min ${min} max ${max}, seats ${Object.keys(byUid).length}`);
