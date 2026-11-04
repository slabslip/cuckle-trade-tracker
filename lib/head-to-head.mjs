/**
 * All-time head-to-head records between two seats.
 * Pair keys are canonical minUid|maxUid; W/L/T are from the lower uid's view
 * in storage, then flipped for the requested orientation.
 */

import {
  applyResult,
  emptyRecord,
  recordLabel,
  weekResultsFromScores,
} from "./best-ball-lineup.mjs";

export const H2H_BOOK_V = 1;

export function pairKey(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

export function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function blankSeason(season) {
  return {
    season: String(season),
    w: 0,
    l: 0,
    t: 0,
    pf: 0,
    pa: 0,
    games: 0,
  };
}

/**
 * Apply one completed game from uidA's perspective vs uidB.
 * @param {Map<string, object>} pairs
 * @param {{ season: string, a: string, b: string, result: 'W'|'L'|'T', pf: number, pa: number }} game
 */
export function addGame(pairs, game) {
  const a = String(game.a || "");
  const b = String(game.b || "");
  if (!a || !b || a === b) return;
  const key = pairKey(a, b);
  let row = pairs.get(key);
  if (!row) {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    row = {
      a: lo,
      b: hi,
      w: 0,
      l: 0,
      t: 0,
      pf: 0,
      pa: 0,
      games: 0,
      by_season: [],
    };
    pairs.set(key, row);
  }
  const fromLo = a === row.a;
  let result = game.result;
  let pf = Number(game.pf) || 0;
  let pa = Number(game.pa) || 0;
  if (!fromLo) {
    if (result === "W") result = "L";
    else if (result === "L") result = "W";
    const swap = pf;
    pf = pa;
    pa = swap;
  }
  const rec = emptyRecord();
  rec.wins = row.w;
  rec.losses = row.l;
  rec.ties = row.t;
  rec.pf = row.pf;
  rec.pa = row.pa;
  rec.weeks = row.games;
  applyResult(rec, result, pf, pa);
  row.w = rec.wins;
  row.l = rec.losses;
  row.t = rec.ties;
  row.pf = rec.pf;
  row.pa = rec.pa;
  row.games = rec.weeks;

  const season = String(game.season || "");
  let seasonRow = row.by_season.find((s) => s.season === season);
  if (!seasonRow) {
    seasonRow = blankSeason(season);
    row.by_season.push(seasonRow);
  }
  const sRec = emptyRecord();
  sRec.wins = seasonRow.w;
  sRec.losses = seasonRow.l;
  sRec.ties = seasonRow.t;
  sRec.pf = seasonRow.pf;
  sRec.pa = seasonRow.pa;
  sRec.weeks = seasonRow.games;
  applyResult(sRec, result, pf, pa);
  seasonRow.w = sRec.wins;
  seasonRow.l = sRec.losses;
  seasonRow.t = sRec.ties;
  seasonRow.pf = sRec.pf;
  seasonRow.pa = sRec.pa;
  seasonRow.games = sRec.weeks;
}

/**
 * Fold Sleeper matchup rows for one week into pair games.
 * @param {Array<object>} rows
 * @param {Map<number|string, string>} rosterToUser — roster_id → user_id
 * @param {string} season
 */
export function ingestWeek(pairs, rows, rosterToUser, season) {
  const results = weekResultsFromScores(rows, (row) => Number(row && row.points) || 0);
  for (const [rosterId, info] of results) {
    const uid = rosterToUser.get(Number(rosterId)) || rosterToUser.get(String(rosterId));
    const oppUid = rosterToUser.get(Number(info.opp_roster_id))
      || rosterToUser.get(String(info.opp_roster_id));
    if (!uid || !oppUid) continue;
    // Emit once per matchup from the lower roster id to avoid double-count.
    if (Number(rosterId) > Number(info.opp_roster_id)) continue;
    addGame(pairs, {
      season: String(season),
      a: String(uid),
      b: String(oppUid),
      result: info.result,
      pf: info.score,
      pa: info.opp,
    });
  }
}

/**
 * Orient a stored pair so W/L/T/PF/PA are from `fromUid`'s perspective.
 */
export function orientPair(pair, fromUid) {
  if (!pair) return null;
  const from = String(fromUid || "");
  const flip = from === String(pair.b);
  if (!flip && from !== String(pair.a)) return null;
  const mapSeason = (s) => ({
    season: s.season,
    w: flip ? s.l : s.w,
    l: flip ? s.w : s.l,
    t: s.t,
    pf: flip ? s.pa : s.pf,
    pa: flip ? s.pf : s.pa,
    games: s.games,
  });
  const seasons = (pair.by_season || []).map(mapSeason)
    .sort((a, b) => String(b.season).localeCompare(String(a.season)));
  return {
    a: from,
    b: flip ? pair.a : pair.b,
    w: flip ? pair.l : pair.w,
    l: flip ? pair.w : pair.l,
    t: pair.t,
    pf: flip ? pair.pa : pair.pf,
    pa: flip ? pair.pf : pair.pa,
    games: pair.games,
    by_season: seasons,
    record: recordLabel({
      wins: flip ? pair.l : pair.w,
      losses: flip ? pair.w : pair.l,
      ties: pair.t,
    }),
  };
}

export function buildHeadToHeadBook({
  leagueId,
  asOf,
  seats,
  pairsMap,
  rule,
}) {
  const seatsOut = (seats || [])
    .filter((s) => s && s.user_id)
    .map((s) => ({
      user_id: String(s.user_id),
      name: String(s.name || s.user_id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)
      || a.user_id.localeCompare(b.user_id));

  const pairs = {};
  for (const [key, row] of pairsMap || []) {
    const bySeason = (row.by_season || [])
      .slice()
      .sort((a, b) => String(b.season).localeCompare(String(a.season)));
    pairs[key] = {
      a: row.a,
      b: row.b,
      w: row.w,
      l: row.l,
      t: row.t,
      pf: money(row.pf),
      pa: money(row.pa),
      games: row.games,
      by_season: bySeason.map((s) => ({
        season: s.season,
        w: s.w,
        l: s.l,
        t: s.t,
        pf: money(s.pf),
        pa: money(s.pa),
        games: s.games,
      })),
    };
  }

  return {
    v: H2H_BOOK_V,
    as_of: asOf || new Date().toISOString().slice(0, 10),
    league_id: String(leagueId || ""),
    n_seats: seatsOut.length,
    n_pairs: Object.keys(pairs).length,
    rule: rule || {
      scope: "Sleeper matchups across completed weeks, all seasons on the book.",
      note: "Pick two seats. Record is games played head-to-head, regular season and playoffs.",
    },
    seats: seatsOut,
    pairs,
  };
}
