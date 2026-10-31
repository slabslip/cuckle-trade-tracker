/**
 * Best Ball Hype book: season-to-date W/L if every week used the optimal
 * lineup from the full roster (players_points), not the set starters.
 */
import {
  applyResult,
  emptyRecord,
  optimalLineupFromPoints,
  recordLabel,
  weekResultsFromScores,
} from "./best-ball-lineup.mjs";

function posMapFromPlayers(players) {
  const by = Object.create(null);
  const src = players && typeof players === "object" ? players : {};
  for (const [id, row] of Object.entries(src)) {
    if (!row || typeof row !== "object") continue;
    const pos = row.position || row.fantasy_positions?.[0] || row.pos;
    if (pos) by[String(id)] = String(pos).toUpperCase();
  }
  return by;
}

/**
 * @param {object} opts
 * @param {Array<{week:number, rows:object[]}>} opts.weeks — scored matchup weeks
 * @param {string[]} opts.rosterPositions
 * @param {object} opts.players — Sleeper /players/nfl dict
 * @param {Record<string|number, string>} opts.ownerByRoster
 * @param {Record<string, string>} opts.nameByUser
 * @param {number|string} opts.season
 * @param {number} opts.week — last scored week
 * @param {string} [opts.leagueId]
 * @param {string} [opts.asOf]
 */
export function buildBestBallHypeBook(opts) {
  const rosterPositions = opts.rosterPositions || [];
  const posById = posMapFromPlayers(opts.players);
  const ownerByRoster = opts.ownerByRoster || {};
  const nameByUser = opts.nameByUser || {};
  const byRid = Object.create(null);

  function seat(rid) {
    const key = String(rid);
    if (!byRid[key]) {
      const uid = ownerByRoster[rid] || ownerByRoster[key] || null;
      byRid[key] = {
        roster_id: Number(rid),
        user_id: uid != null ? String(uid) : null,
        name: (uid && nameByUser[String(uid)]) || `roster ${rid}`,
        best_ball: emptyRecord(),
        actual: emptyRecord(),
        weeks: [],
        bench_left_total: 0,
      };
    }
    return byRid[key];
  }

  for (const pack of opts.weeks || []) {
    const week = Number(pack.week) || 0;
    const rows = pack.rows || [];
    if (!week || rows.length < 2) continue;

    const bbScore = Object.create(null);
    const actualScore = Object.create(null);
    const leftBy = Object.create(null);

    for (const row of rows) {
      const rid = Number(row.roster_id);
      if (!Number.isFinite(rid)) continue;
      const actual = Number(row.points);
      if (!Number.isFinite(actual) || actual <= 0) continue;
      const opt = optimalLineupFromPoints(row.players_points || {}, posById, rosterPositions);
      // Never credit below the set lineup (scoring quirks / missing pos map).
      const bb = Math.max(opt.points, actual);
      bbScore[rid] = bb;
      actualScore[rid] = actual;
      leftBy[rid] = Math.max(0, Math.round((bb - actual) * 100) / 100);
      seat(rid);
    }

    // Need a full slate of scored teams before counting the week.
    if (Object.keys(bbScore).length < 8) continue;

    const bbRes = weekResultsFromScores(rows, (r) => bbScore[Number(r.roster_id)]);
    const actRes = weekResultsFromScores(rows, (r) => actualScore[Number(r.roster_id)]);

    for (const [rid, res] of bbRes.entries()) {
      if (bbScore[rid] == null) continue;
      const s = seat(rid);
      applyResult(s.best_ball, res.result, res.score, res.opp);
      const act = actRes.get(rid);
      if (act) applyResult(s.actual, act.result, act.score, act.opp);
      const left = leftBy[rid] || 0;
      s.bench_left_total = Math.round((s.bench_left_total + left) * 100) / 100;
      s.weeks.push({
        week,
        result: res.result,
        bb: res.score,
        actual: actualScore[rid],
        left,
        opp_roster_id: res.opp_roster_id,
        opp_bb: res.opp,
      });
    }
  }

  const seats = Object.values(byRid).map((s) => {
    const bb = s.best_ball;
    const act = s.actual;
    const deltaWins = (bb.wins || 0) - (act.wins || 0);
    const avgLeft = bb.weeks
      ? Math.round((s.bench_left_total / bb.weeks) * 10) / 10
      : 0;
    return {
      user_id: s.user_id,
      name: s.name,
      roster_id: s.roster_id,
      record: recordLabel(bb),
      wins: bb.wins,
      losses: bb.losses,
      ties: bb.ties,
      pf: bb.pf,
      pa: bb.pa,
      actual_record: recordLabel(act),
      actual_wins: act.wins,
      actual_losses: act.losses,
      actual_ties: act.ties,
      actual_pf: act.pf,
      delta_wins: deltaWins,
      avg_left_on_bench: avgLeft,
      bench_left_total: s.bench_left_total,
      weeks: s.weeks,
    };
  });

  seats.sort((a, b) =>
    (b.wins - a.wins)
    || (a.losses - b.losses)
    || (b.pf - a.pf)
    || String(a.name).localeCompare(String(b.name)));

  seats.forEach((s, i) => { s.rank = i + 1; });

  return {
    v: 1,
    as_of: opts.asOf || new Date().toISOString().slice(0, 10),
    league_id: opts.leagueId != null ? String(opts.leagueId) : null,
    season: Number(opts.season) || null,
    week: Number(opts.week) || null,
    n: seats.length,
    rule: {
      note: "Best Ball Hype: each week’s score is the optimal starter lineup from the full roster’s players_points (set lineup ignored). Record from those H2H scores.",
      starter_slots: (opts.rosterPositions || []).filter((p) => p && !["BN", "IR", "TAXI", "RESERVE", "OE"].includes(p)),
    },
    seats,
  };
}
