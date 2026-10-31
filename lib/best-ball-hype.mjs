/**
 * Best Ball Hype book: season-to-date W/L if every week used the optimal
 * lineup from that week's roster (matchup players_points — trades/waivers
 * already baked into each scored week). Remaining weeks (incl. playoffs)
 * project from the most recent roster + Sleeper weekly projections.
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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Points map for one seat from current roster + a week's projection table. */
export function rosterProjPoints(playerIds, projByPlayer) {
  const out = Object.create(null);
  const proj = projByPlayer || {};
  for (const raw of playerIds || []) {
    const id = String(raw || "");
    if (!id || id === "0") continue;
    out[id] = Number(proj[id]) || 0;
  }
  return out;
}

/**
 * @param {object} opts
 * @param {Array<{week:number, rows:object[]}>} opts.weeks — scored matchup weeks
 * @param {Array<{week:number, rows:object[]}>} [opts.futureWeeks] — schedule rows
 * @param {Record<string|number, string[]>} [opts.currentRosters] — latest roster player ids
 * @param {Record<string|number, Record<string, number>>} [opts.projectionsByWeek]
 * @param {string[]} opts.rosterPositions
 * @param {object} opts.players — Sleeper /players/nfl dict
 * @param {Record<string|number, string>} opts.ownerByRoster
 * @param {Record<string, string>} opts.nameByUser
 * @param {number|string} opts.season
 * @param {number} opts.week — last scored week
 * @param {number} [opts.projThroughWeek]
 * @param {string} [opts.leagueId]
 * @param {string} [opts.asOf]
 */
export function buildBestBallHypeBook(opts) {
  const rosterPositions = opts.rosterPositions || [];
  const posById = posMapFromPlayers(opts.players);
  const ownerByRoster = opts.ownerByRoster || {};
  const nameByUser = opts.nameByUser || {};
  const currentRosters = opts.currentRosters || {};
  const projectionsByWeek = opts.projectionsByWeek || {};
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
        projected: emptyRecord(),
        weeks: [],
        future_weeks: [],
        bench_left_total: 0,
      };
    }
    return byRid[key];
  }

  // --- Scored weeks: that week's matchup players_points = that week's roster ---
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
      // players_points is the week-specific roster (adds/drops/trades already applied).
      const opt = optimalLineupFromPoints(row.players_points || {}, posById, rosterPositions);
      // Never credit below the set lineup (scoring quirks / missing pos map).
      const bb = Math.max(opt.points, actual);
      bbScore[rid] = bb;
      actualScore[rid] = actual;
      leftBy[rid] = Math.max(0, round2(bb - actual));
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
      applyResult(s.projected, res.result, res.score, res.opp);
      const act = actRes.get(rid);
      if (act) applyResult(s.actual, act.result, act.score, act.opp);
      const left = leftBy[rid] || 0;
      s.bench_left_total = round2(s.bench_left_total + left);
      s.weeks.push({
        week,
        kind: "scored",
        result: res.result,
        bb: res.score,
        actual: actualScore[rid],
        left,
        opp_roster_id: res.opp_roster_id,
        opp_bb: res.opp,
        roster_n: Object.keys((rows.find((r) => Number(r.roster_id) === rid) || {}).players_points || {}).length,
      });
    }
  }

  // --- Future weeks: freeze most-recent roster, score with weekly projections ---
  let projThrough = 0;
  for (const pack of opts.futureWeeks || []) {
    const week = Number(pack.week) || 0;
    const rows = pack.rows || [];
    if (!week || rows.length < 2) continue;
    const projBy = projectionsByWeek[week] || projectionsByWeek[String(week)] || {};
    const bbScore = Object.create(null);

    for (const row of rows) {
      const rid = Number(row.roster_id);
      if (!Number.isFinite(rid)) continue;
      const ids = currentRosters[rid] || currentRosters[String(rid)] || [];
      if (!ids.length) continue;
      const ptsMap = rosterProjPoints(ids, projBy);
      const opt = optimalLineupFromPoints(ptsMap, posById, rosterPositions);
      if (!(opt.points > 0)) continue;
      bbScore[rid] = opt.points;
      seat(rid);
    }

    if (Object.keys(bbScore).length < 8) continue;

    const bbRes = weekResultsFromScores(rows, (r) => bbScore[Number(r.roster_id)]);
    for (const [rid, res] of bbRes.entries()) {
      if (bbScore[rid] == null) continue;
      const s = seat(rid);
      applyResult(s.projected, res.result, res.score, res.opp);
      const rosterN = (currentRosters[rid] || currentRosters[String(rid)] || []).length;
      s.future_weeks.push({
        week,
        kind: "projected",
        result: res.result,
        bb: res.score,
        actual: null,
        left: null,
        opp_roster_id: res.opp_roster_id,
        opp_bb: res.opp,
        roster_n: rosterN,
      });
    }
    if (week > projThrough) projThrough = week;
  }

  const seats = Object.values(byRid).map((s) => {
    const bb = s.best_ball;
    const act = s.actual;
    const proj = s.projected;
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
      future_weeks: s.future_weeks,
      proj_record: recordLabel(proj),
      proj_wins: proj.wins,
      proj_losses: proj.losses,
      proj_ties: proj.ties,
      proj_pf: proj.pf,
      proj_pa: proj.pa,
      roster_n: (currentRosters[s.roster_id] || currentRosters[String(s.roster_id)] || []).length || null,
    };
  });

  seats.sort((a, b) =>
    (b.wins - a.wins)
    || (a.losses - b.losses)
    || (b.pf - a.pf)
    || String(a.name).localeCompare(String(b.name)));

  seats.forEach((s, i) => { s.rank = i + 1; });

  const through = Number(opts.projThroughWeek) || projThrough || null;

  return {
    v: 2,
    as_of: opts.asOf || new Date().toISOString().slice(0, 10),
    league_id: opts.leagueId != null ? String(opts.leagueId) : null,
    season: Number(opts.season) || null,
    week: Number(opts.week) || null,
    proj_through_week: through,
    n: seats.length,
    rule: {
      note: "Best Ball Hype: scored weeks use that week’s roster (matchup players_points after trades/waivers). Remaining weeks through playoffs assume the most recent roster and Sleeper projections; optimal lineup, set lineup ignored.",
      scored: "week roster from Sleeper matchup players_points",
      future: "current roster frozen + weekly projections",
      starter_slots: (opts.rosterPositions || []).filter((p) => p && !["BN", "IR", "TAXI", "RESERVE", "OE"].includes(p)),
    },
    seats,
  };
}
