/**
 * Best Ball Hype book.
 *
 * Scored weeks: optimal-lineup W/L from that week's roster (trades/waivers in
 * matchup players_points) — the "hype" tape vs set lineup.
 *
 * What the door is for: project who falls into Top 6 (champ) vs Bottom 4
 * (toilet), then play the brackets:
 *   Champ (set lineup): seeds 1–2 bye; 6v3 and 5v4; then semis; then final.
 *   Toilet (best ball): 10v7 and 8v9; winners play 7th/8th; losers 9th/10th
 *   so nobody can purposely lose the sacko race.
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

/** Set-lineup projection: sum Sleeper proj for named starters only. */
export function setLineupProjPoints(starterIds, projByPlayer) {
  const proj = projByPlayer || {};
  let pts = 0;
  for (const raw of starterIds || []) {
    const id = String(raw || "");
    if (!id || id === "0") continue;
    pts += Number(proj[id]) || 0;
  }
  return round2(pts);
}

/** Best-ball projection: optimal starters from the full roster. */
export function bestBallProjPoints(playerIds, projByPlayer, posById, rosterPositions) {
  const map = rosterProjPoints(playerIds, projByPlayer);
  return optimalLineupFromPoints(map, posById, rosterPositions).points;
}

function cloneRec(rec) {
  return {
    wins: rec.wins || 0,
    losses: rec.losses || 0,
    ties: rec.ties || 0,
    pf: rec.pf || 0,
    pa: rec.pa || 0,
    weeks: rec.weeks || 0,
  };
}

function playGame(a, b, week, mode) {
  const aPts = Number(a.pts) || 0;
  const bPts = Number(b.pts) || 0;
  let winner = a;
  let loser = b;
  let resultA = "T";
  let resultB = "T";
  if (aPts > bPts) { winner = a; loser = b; resultA = "W"; resultB = "L"; }
  else if (bPts > aPts) { winner = b; loser = a; resultA = "L"; resultB = "W"; }
  return {
    week,
    mode,
    a: { roster_id: a.roster_id, name: a.name, seed: a.seed, pts: aPts, result: resultA },
    b: { roster_id: b.roster_id, name: b.name, seed: b.seed, pts: bPts, result: resultB },
    winner_roster_id: aPts === bPts ? null : winner.roster_id,
    loser_roster_id: aPts === bPts ? null : loser.roster_id,
  };
}

/**
 * @param {object} opts
 * @param {Array<{week:number, rows:object[]}>} opts.weeks — scored matchup weeks
 * @param {Array<{week:number, rows:object[]}>} [opts.rsFutureWeeks] — remaining regular-season schedule
 * @param {Record<string|number, string[]>} [opts.currentRosters]
 * @param {Record<string|number, string[]>} [opts.currentStarters]
 * @param {Record<string|number, Record<string, number>>} [opts.projectionsByWeek]
 * @param {string[]} opts.rosterPositions
 * @param {object} opts.players
 * @param {Record<string|number, string>} opts.ownerByRoster
 * @param {Record<string, string>} opts.nameByUser
 * @param {number|string} opts.season
 * @param {number} opts.week — last scored week
 * @param {number} [opts.playoffWeekStart]
 * @param {number} [opts.playoffTeams]
 * @param {string} [opts.leagueId]
 * @param {string} [opts.asOf]
 */
export function buildBestBallHypeBook(opts) {
  const rosterPositions = opts.rosterPositions || [];
  const posById = posMapFromPlayers(opts.players);
  const ownerByRoster = opts.ownerByRoster || {};
  const nameByUser = opts.nameByUser || {};
  const currentRosters = opts.currentRosters || {};
  const currentStarters = opts.currentStarters || {};
  const projectionsByWeek = opts.projectionsByWeek || {};
  const playoffWeekStart = Number(opts.playoffWeekStart) || 15;
  const playoffTeams = Number(opts.playoffTeams) || 6;
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
        rs_proj: emptyRecord(),
        weeks: [],
        bench_left_total: 0,
      };
    }
    return byRid[key];
  }

  // --- Scored weeks: BB hype tape (week roster) vs set lineup ---
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
      const bb = Math.max(opt.points, actual);
      bbScore[rid] = bb;
      actualScore[rid] = actual;
      leftBy[rid] = Math.max(0, round2(bb - actual));
      seat(rid);
    }

    if (Object.keys(bbScore).length < 8) continue;

    const bbRes = weekResultsFromScores(rows, (r) => bbScore[Number(r.roster_id)]);
    const actRes = weekResultsFromScores(rows, (r) => actualScore[Number(r.roster_id)]);

    for (const [rid, res] of bbRes.entries()) {
      if (bbScore[rid] == null) continue;
      const s = seat(rid);
      applyResult(s.best_ball, res.result, res.score, res.opp);
      const act = actRes.get(rid);
      if (act) {
        applyResult(s.actual, act.result, act.score, act.opp);
        applyResult(s.rs_proj, act.result, act.score, act.opp);
      }
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
      });
    }
  }

  // Seed every known roster even if a week was skipped.
  for (const key of Object.keys(currentRosters)) seat(Number(key));
  for (const key of Object.keys(ownerByRoster)) seat(Number(key));

  // --- Remaining regular season: SET lineup projections (normal scoring) ---
  const rsFuture = [];
  for (const pack of opts.rsFutureWeeks || []) {
    const week = Number(pack.week) || 0;
    const rows = pack.rows || [];
    if (!week || week >= playoffWeekStart || rows.length < 2) continue;
    const projBy = projectionsByWeek[week] || projectionsByWeek[String(week)] || {};
    const score = Object.create(null);

    for (const row of rows) {
      const rid = Number(row.roster_id);
      if (!Number.isFinite(rid)) continue;
      const starters = currentStarters[rid] || currentStarters[String(rid)] || [];
      const pts = setLineupProjPoints(starters, projBy);
      if (!(pts > 0) && !starters.length) continue;
      score[rid] = pts;
      seat(rid);
    }
    if (Object.keys(score).length < 8) continue;

    const res = weekResultsFromScores(rows, (r) => score[Number(r.roster_id)]);
    for (const [rid, r] of res.entries()) {
      if (score[rid] == null) continue;
      applyResult(seat(rid).rs_proj, r.result, r.score, r.opp);
      rsFuture.push({
        week,
        roster_id: rid,
        result: r.result,
        pts: r.score,
        opp_roster_id: r.opp_roster_id,
        opp_pts: r.opp,
        mode: "set_lineup",
      });
    }
  }

  // --- Seed Top 6 / Bottom 4 from projected regular-season standings ---
  const seeded = Object.values(byRid).map((s) => {
    const rs = s.rs_proj;
    return {
      roster_id: s.roster_id,
      user_id: s.user_id,
      name: s.name,
      wins: rs.wins,
      losses: rs.losses,
      ties: rs.ties,
      pf: rs.pf,
      pa: rs.pa,
      record: recordLabel(rs),
    };
  }).sort((a, b) =>
    (b.wins - a.wins)
    || (a.losses - b.losses)
    || (b.pf - a.pf)
    || String(a.name).localeCompare(String(b.name)));

  seeded.forEach((s, i) => { s.seed = i + 1; });
  const bySeed = Object.create(null);
  for (const s of seeded) bySeed[s.seed] = s;

  function teamFromSeed(seed) {
    const s = bySeed[seed];
    if (!s) return null;
    return {
      roster_id: s.roster_id,
      name: s.name,
      seed: s.seed,
      starters: currentStarters[s.roster_id] || currentStarters[String(s.roster_id)] || [],
      roster: currentRosters[s.roster_id] || currentRosters[String(s.roster_id)] || [],
    };
  }

  function scoreTeam(team, week, mode) {
    const projBy = projectionsByWeek[week] || projectionsByWeek[String(week)] || {};
    if (mode === "best_ball") {
      return bestBallProjPoints(team.roster, projBy, posById, rosterPositions);
    }
    return setLineupProjPoints(team.starters, projBy);
  }

  function resolvePair(seedA, seedB, week, mode) {
    const a = teamFromSeed(seedA);
    const b = teamFromSeed(seedB);
    if (!a || !b) return null;
    a.pts = scoreTeam(a, week, mode);
    b.pts = scoreTeam(b, week, mode);
    // Deterministic tie-break: higher seed wins (lower seed number).
    if (a.pts === b.pts) {
      if (a.seed < b.seed) a.pts = round2(a.pts + 0.01);
      else b.pts = round2(b.pts + 0.01);
    }
    return playGame(a, b, week, mode);
  }

  const placeByRid = Object.create(null);
  const pathByRid = Object.create(null);
  function addPath(rid, entry) {
    if (!pathByRid[rid]) pathByRid[rid] = [];
    pathByRid[rid].push(entry);
  }

  // --- Champ bracket (set lineup): 1–2 bye; 6v3, 5v4 ---
  const champWeek1 = playoffWeekStart;
  const champWeek2 = playoffWeekStart + 1;
  const champWeek3 = playoffWeekStart + 2;
  const champRounds = [];

  const r1Games = [];
  const g36 = resolvePair(3, 6, champWeek1, "set_lineup");
  const g45 = resolvePair(4, 5, champWeek1, "set_lineup");
  if (g36) r1Games.push(g36);
  if (g45) r1Games.push(g45);
  for (const seed of [1, 2]) {
    const t = teamFromSeed(seed);
    if (t) {
      r1Games.push({
        week: champWeek1,
        mode: "set_lineup",
        bye: true,
        a: { roster_id: t.roster_id, name: t.name, seed: t.seed, pts: null, result: "BYE" },
        b: null,
        winner_roster_id: t.roster_id,
        loser_roster_id: null,
      });
      addPath(t.roster_id, { week: champWeek1, bracket: "champ", round: "bye", result: "BYE" });
    }
  }
  for (const g of [g36, g45]) {
    if (!g) continue;
    addPath(g.a.roster_id, {
      week: champWeek1, bracket: "champ", round: "qf",
      opp: g.b.name, opp_seed: g.b.seed, pts: g.a.pts, opp_pts: g.b.pts, result: g.a.result, mode: "set_lineup",
    });
    addPath(g.b.roster_id, {
      week: champWeek1, bracket: "champ", round: "qf",
      opp: g.a.name, opp_seed: g.a.seed, pts: g.b.pts, opp_pts: g.a.pts, result: g.b.result, mode: "set_lineup",
    });
  }
  champRounds.push({ week: champWeek1, label: "Quarterfinals", games: r1Games });

  // Semis: 1 vs winner(4v5), 2 vs winner(3v6)
  const w45 = g45 && g45.winner_roster_id;
  const w36 = g36 && g36.winner_roster_id;
  const seedOf = (rid) => seeded.find((s) => s.roster_id === rid)?.seed;
  const semiA = w45 != null ? resolvePair(1, seedOf(w45), champWeek2, "set_lineup") : null;
  const semiB = w36 != null ? resolvePair(2, seedOf(w36), champWeek2, "set_lineup") : null;
  const r2Games = [semiA, semiB].filter(Boolean);
  for (const g of r2Games) {
    addPath(g.a.roster_id, {
      week: champWeek2, bracket: "champ", round: "semi",
      opp: g.b.name, opp_seed: g.b.seed, pts: g.a.pts, opp_pts: g.b.pts, result: g.a.result, mode: "set_lineup",
    });
    addPath(g.b.roster_id, {
      week: champWeek2, bracket: "champ", round: "semi",
      opp: g.a.name, opp_seed: g.a.seed, pts: g.b.pts, opp_pts: g.a.pts, result: g.b.result, mode: "set_lineup",
    });
  }
  champRounds.push({ week: champWeek2, label: "Semifinals", games: r2Games });

  // Final + 3rd place
  const r3Games = [];
  if (semiA && semiB && semiA.winner_roster_id && semiB.winner_roster_id) {
    const final = resolvePair(seedOf(semiA.winner_roster_id), seedOf(semiB.winner_roster_id), champWeek3, "set_lineup");
    if (final) {
      r3Games.push(Object.assign({ label: "Championship" }, final));
      addPath(final.a.roster_id, {
        week: champWeek3, bracket: "champ", round: "final",
        opp: final.b.name, pts: final.a.pts, opp_pts: final.b.pts, result: final.a.result, mode: "set_lineup",
      });
      addPath(final.b.roster_id, {
        week: champWeek3, bracket: "champ", round: "final",
        opp: final.a.name, pts: final.b.pts, opp_pts: final.a.pts, result: final.b.result, mode: "set_lineup",
      });
      if (final.winner_roster_id) placeByRid[final.winner_roster_id] = 1;
      if (final.loser_roster_id) placeByRid[final.loser_roster_id] = 2;
    }
  }
  if (semiA && semiB && semiA.loser_roster_id && semiB.loser_roster_id) {
    const third = resolvePair(seedOf(semiA.loser_roster_id), seedOf(semiB.loser_roster_id), champWeek3, "set_lineup");
    if (third) {
      r3Games.push(Object.assign({ label: "3rd place" }, third));
      addPath(third.a.roster_id, {
        week: champWeek3, bracket: "champ", round: "third",
        opp: third.b.name, pts: third.a.pts, opp_pts: third.b.pts, result: third.a.result, mode: "set_lineup",
      });
      addPath(third.b.roster_id, {
        week: champWeek3, bracket: "champ", round: "third",
        opp: third.a.name, pts: third.b.pts, opp_pts: third.a.pts, result: third.b.result, mode: "set_lineup",
      });
      if (third.winner_roster_id) placeByRid[third.winner_roster_id] = 3;
      if (third.loser_roster_id) placeByRid[third.loser_roster_id] = 4;
    }
  }
  // QF losers are 5th/6th by seed (higher seed = better place)
  for (const g of [g36, g45]) {
    if (!g || !g.loser_roster_id) continue;
    const loser = seeded.find((s) => s.roster_id === g.loser_roster_id);
    if (!loser) continue;
    // Defer 5/6 until both known
  }
  {
    const qfLosers = [g36, g45]
      .filter((g) => g && g.loser_roster_id)
      .map((g) => seeded.find((s) => s.roster_id === g.loser_roster_id))
      .filter(Boolean)
      .sort((a, b) => a.seed - b.seed);
    if (qfLosers[0]) placeByRid[qfLosers[0].roster_id] = 5;
    if (qfLosers[1]) placeByRid[qfLosers[1].roster_id] = 6;
  }
  champRounds.push({ week: champWeek3, label: "Finals", games: r3Games });

  // --- Toilet bowl (best ball): 10v7, 8v9 — can't tank ---
  const toiletWeek1 = playoffWeekStart;
  const toiletWeek2 = playoffWeekStart + 1;
  const toiletRounds = [];
  const t710 = resolvePair(7, 10, toiletWeek1, "best_ball");
  const t89 = resolvePair(8, 9, toiletWeek1, "best_ball");
  const tR1 = [t710, t89].filter(Boolean);
  for (const g of tR1) {
    addPath(g.a.roster_id, {
      week: toiletWeek1, bracket: "toilet", round: "semi",
      opp: g.b.name, opp_seed: g.b.seed, pts: g.a.pts, opp_pts: g.b.pts, result: g.a.result, mode: "best_ball",
    });
    addPath(g.b.roster_id, {
      week: toiletWeek1, bracket: "toilet", round: "semi",
      opp: g.a.name, opp_seed: g.a.seed, pts: g.b.pts, opp_pts: g.a.pts, result: g.b.result, mode: "best_ball",
    });
  }
  toiletRounds.push({ week: toiletWeek1, label: "Toilet semis", games: tR1 });

  const tR2 = [];
  if (t710 && t89 && t710.winner_roster_id && t89.winner_roster_id) {
    const for7 = resolvePair(seedOf(t710.winner_roster_id), seedOf(t89.winner_roster_id), toiletWeek2, "best_ball");
    if (for7) {
      tR2.push(Object.assign({ label: "7th place" }, for7));
      addPath(for7.a.roster_id, {
        week: toiletWeek2, bracket: "toilet", round: "7th",
        opp: for7.b.name, pts: for7.a.pts, opp_pts: for7.b.pts, result: for7.a.result, mode: "best_ball",
      });
      addPath(for7.b.roster_id, {
        week: toiletWeek2, bracket: "toilet", round: "7th",
        opp: for7.a.name, pts: for7.b.pts, opp_pts: for7.a.pts, result: for7.b.result, mode: "best_ball",
      });
      if (for7.winner_roster_id) placeByRid[for7.winner_roster_id] = 7;
      if (for7.loser_roster_id) placeByRid[for7.loser_roster_id] = 8;
    }
  }
  if (t710 && t89 && t710.loser_roster_id && t89.loser_roster_id) {
    const sacko = resolvePair(seedOf(t710.loser_roster_id), seedOf(t89.loser_roster_id), toiletWeek2, "best_ball");
    if (sacko) {
      tR2.push(Object.assign({ label: "Sacko (9th/10th)" }, sacko));
      addPath(sacko.a.roster_id, {
        week: toiletWeek2, bracket: "toilet", round: "sacko",
        opp: sacko.b.name, pts: sacko.a.pts, opp_pts: sacko.b.pts, result: sacko.a.result, mode: "best_ball",
      });
      addPath(sacko.b.roster_id, {
        week: toiletWeek2, bracket: "toilet", round: "sacko",
        opp: sacko.a.name, pts: sacko.b.pts, opp_pts: sacko.a.pts, result: sacko.b.result, mode: "best_ball",
      });
      if (sacko.winner_roster_id) placeByRid[sacko.winner_roster_id] = 9;
      if (sacko.loser_roster_id) placeByRid[sacko.loser_roster_id] = 10;
    }
  }
  toiletRounds.push({ week: toiletWeek2, label: "Toilet finals", games: tR2 });

  const seats = seeded.map((seedRow) => {
    const s = byRid[String(seedRow.roster_id)] || seat(seedRow.roster_id);
    const bb = s.best_ball;
    const act = s.actual;
    const deltaWins = (bb.wins || 0) - (act.wins || 0);
    const avgLeft = bb.weeks
      ? Math.round((s.bench_left_total / bb.weeks) * 10) / 10
      : 0;
    const seed = seedRow.seed;
    const bracket = seed <= playoffTeams ? "champ" : "toilet";
    const place = placeByRid[seedRow.roster_id] || null;
    return {
      user_id: s.user_id,
      name: s.name,
      roster_id: s.roster_id,
      seed,
      bracket,
      place_proj: place,
      rs_record: seedRow.record,
      rs_wins: seedRow.wins,
      rs_losses: seedRow.losses,
      rs_pf: seedRow.pf,
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
      path: pathByRid[seedRow.roster_id] || [],
      roster_n: (currentRosters[s.roster_id] || currentRosters[String(s.roster_id)] || []).length || null,
    };
  });

  // List order: projected final place, then seed.
  seats.sort((a, b) =>
    ((a.place_proj || 99) - (b.place_proj || 99))
    || (a.seed - b.seed)
    || String(a.name).localeCompare(String(b.name)));
  seats.forEach((s, i) => { s.rank = i + 1; });

  return {
    v: 3,
    as_of: opts.asOf || new Date().toISOString().slice(0, 10),
    league_id: opts.leagueId != null ? String(opts.leagueId) : null,
    season: Number(opts.season) || null,
    week: Number(opts.week) || null,
    playoff_week_start: playoffWeekStart,
    playoff_teams: playoffTeams,
    rs_through_week: playoffWeekStart - 1,
    n: seats.length,
    rule: {
      note: "Top 6 make the champ bracket (set lineups; seeds 1–2 bye; 6v3 and 5v4). Bottom 4 play the toilet bowl in best ball (10v7, 8v9) so nobody can purposely lose. Regular-season seeding uses set-lineup projections for remaining weeks.",
      scored_bb: "week roster from Sleeper matchup players_points",
      champ: "set lineup projections",
      toilet: "best ball projections",
      seeding: "projected regular-season standings through week before playoffs",
      starter_slots: (opts.rosterPositions || []).filter((p) => p && !["BN", "IR", "TAXI", "RESERVE", "OE"].includes(p)),
    },
    seeding: seeded,
    champ: { mode: "set_lineup", rounds: champRounds },
    toilet: { mode: "best_ball", rounds: toiletRounds },
    seats,
  };
}
