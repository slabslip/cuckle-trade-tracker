#!/usr/bin/env node
/**
 * In-season projected finish book for Cuckle (and any live Sleeper league).
 * Writes data/ui/projected-finish.json — feeds Draft picks Early/Mid/Late +
 * the Projected finish League Data door.
 *
 *   node build-projected-finish.mjs [league_id]
 */
import {
  LEAGUE_ID,
  readJson,
  readUi,
  setLeagueId,
  sleeperGet,
  writeUi,
} from "./lib.mjs";
import {
  projectFinishBook,
  scoreFormLeague,
  scoreHeatLeague,
  scoreTrendLeague,
  summarizeFormByRoster,
  summarizeHeatByRoster,
  summarizeScoringTrend,
} from "./lib/projected-finish.mjs";
import {
  DEFAULT_MC_SIMS,
  attachMonteCarloToBook,
} from "./lib/projected-finish-mc.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function nameMap() {
  const aliases = readJson("aliases.overrides.json", {}) || {};
  const members = readUi("members.json", []) || [];
  const map = { ...aliases };
  for (const m of members) {
    if (m && m.user_id && m.name) map[String(m.user_id)] = m.name;
  }
  return map;
}

function arcByUser() {
  const book = readUi("season-arcs.json", null);
  const map = Object.create(null);
  for (const s of (book && book.seats) || []) {
    if (!s || s.user_id == null) continue;
    map[String(s.user_id)] = {
      avg_climb: Number(s.avg_climb) || 0,
      slow_burn_rate: Number(s.slow_burn_rate) || 0,
      fast_fade_rate: Number(s.fast_fade_rate) || 0,
      n: Number(s.n) || 0,
    };
  }
  return map;
}

async function remainingPairs(leagueId, lastScored, playoffStart) {
  const pairs = [];
  const weeks = [];
  const start = (Number(lastScored) || 0) + 1;
  const end = (Number(playoffStart) || 15) - 1;
  for (let w = start; w <= end; w++) {
    const rows = (await sleeperGet(`/league/${leagueId}/matchups/${w}`)) || [];
    const by = new Map();
    for (const row of rows) {
      if (row.matchup_id == null) continue;
      if (!by.has(row.matchup_id)) by.set(row.matchup_id, []);
      by.get(row.matchup_id).push(Number(row.roster_id));
    }
    let weekPairs = 0;
    for (const group of by.values()) {
      if (group.length < 2) continue;
      pairs.push([group[0], group[1]]);
      weekPairs += 1;
    }
    if (weekPairs) weeks.push(w);
  }
  return { pairs, weeks };
}

function ptsKeyFromLeague(live) {
  const rec = live && live.scoring_settings && Number(live.scoring_settings.rec);
  if (rec === 1) return "pts_ppr";
  if (rec === 0.5) return "pts_half_ppr";
  return "pts_std";
}

async function fetchWeekProjections(season, week, ptsKey) {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const qs = positions.map((p) => "position[]=" + p).join("&");
  const url = "https://api.sleeper.app/projections/nfl/" + season + "/" + week
    + "?season_type=regular&" + qs;
  const projs = await fetch(url).then((r) => (r.ok ? r.json() : []));
  const projBy = Object.create(null);
  for (const p of projs || []) {
    const st = p.stats || {};
    projBy[p.player_id] = Number(st[ptsKey] || st.pts_ppr || st.pts_std || 0);
  }
  return projBy;
}

/**
 * Starter actual vs Sleeper weekly projection for each scored week.
 * Feeds form into remaining P(win) so persistent over/under-performers move.
 */
async function scoredFormByRoster(leagueId, season, lastScored, ptsKey) {
  const end = Number(lastScored) || 0;
  if (end < 1) return {};
  const weekDeltas = Object.create(null);
  for (let w = 1; w <= end; w++) {
    const [rows, projBy] = await Promise.all([
      sleeperGet(`/league/${leagueId}/matchups/${w}`),
      fetchWeekProjections(season, w, ptsKey),
    ]);
    for (const row of rows || []) {
      const rid = Number(row.roster_id);
      if (!Number.isFinite(rid)) continue;
      const actual = Number(row.points);
      if (!Number.isFinite(actual) || actual <= 0) continue;
      const starters = row.starters || [];
      let proj = 0;
      for (const id of starters) proj += Number(projBy[id]) || 0;
      if (proj < 30) continue;
      const key = String(rid);
      if (!weekDeltas[key]) weekDeltas[key] = [];
      weekDeltas[key].push({
        week: w,
        actual: Math.round(actual * 10) / 10,
        proj: Math.round(proj * 10) / 10,
        delta: Math.round((actual - proj) * 10) / 10,
      });
    }
  }
  return scoreFormLeague(summarizeFormByRoster(weekDeltas));
}

/**
 * Live league-relative scoring trend from the weekly tape (early weeks soft).
 * roster_id keyed for projectFinishBook.
 */
function scoringTrendByRoster(season, lastScored, ownerByRoster) {
  const tape = readJson("weekly_scores.json", null);
  const scores = (tape && tape.scores) || [];
  const end = Number(lastScored) || 0;
  const byRid = Object.create(null);
  for (const row of scores) {
    if (!row || String(row.season) !== String(season)) continue;
    if (row.phase && row.phase !== "regular") continue;
    const w = Number(row.week) || 0;
    if (w < 1 || (end > 0 && w > end)) continue;
    const pts = Number(row.points);
    if (!Number.isFinite(pts) || pts <= 0) continue;
    let rid = Number(row.roster_id);
    if (!Number.isFinite(rid) && row.user_id != null) {
      // Fallback: map user_id → roster_id from live owners.
      for (const [r, uid] of Object.entries(ownerByRoster || {})) {
        if (String(uid) === String(row.user_id)) { rid = Number(r); break; }
      }
    }
    if (!Number.isFinite(rid)) continue;
    const key = String(rid);
    if (!byRid[key]) byRid[key] = [];
    byRid[key].push({ week: w, points: pts });
  }
  return scoreTrendLeague(summarizeScoringTrend(byRid));
}

function fptsOf(settings) {
  const s = settings || {};
  return {
    pf: (s.fpts || 0) + (s.fpts_decimal || 0) / 100,
    pa: (s.fpts_against || 0) + (s.fpts_against_decimal || 0) / 100,
  };
}

function matchupsHavePoints(matchups) {
  return (matchups || []).some((m) => Number(m && m.points) > 0);
}

/**
 * Fold live matchup points into roster W/L + PF/PA when banking an in-flight
 * NFL week (same path as scripts/review-projected-finish-week.mjs).
 */
function applyWeekResults(rosters, matchups) {
  const byRid = Object.fromEntries(
    (rosters || []).map((r) => [Number(r.roster_id), structuredClone(r)]),
  );
  const byM = new Map();
  for (const row of matchups || []) {
    if (row.matchup_id == null) continue;
    if (!byM.has(row.matchup_id)) byM.set(row.matchup_id, []);
    byM.get(row.matchup_id).push(row);
  }
  const livePtsByRid = Object.create(null);
  for (const [, group] of byM) {
    if (group.length < 2) continue;
    const a = group[0];
    const b = group[1];
    const ap = Number(a.points) || 0;
    const bp = Number(b.points) || 0;
    livePtsByRid[Number(a.roster_id)] = ap;
    livePtsByRid[Number(b.roster_id)] = bp;
    const A = byRid[Number(a.roster_id)];
    const B = byRid[Number(b.roster_id)];
    if (!A || !B) continue;
    const as = A.settings || (A.settings = {});
    const bs = B.settings || (B.settings = {});
    const aBase = fptsOf(as);
    const bBase = fptsOf(bs);
    const aPf = Math.round((aBase.pf + ap) * 100) / 100;
    const bPf = Math.round((bBase.pf + bp) * 100) / 100;
    const aPa = Math.round((aBase.pa + bp) * 100) / 100;
    const bPa = Math.round((bBase.pa + ap) * 100) / 100;
    as.fpts = Math.floor(aPf);
    as.fpts_decimal = Math.round((aPf - Math.floor(aPf)) * 100);
    as.fpts_against = Math.floor(aPa);
    as.fpts_against_decimal = Math.round((aPa - Math.floor(aPa)) * 100);
    bs.fpts = Math.floor(bPf);
    bs.fpts_decimal = Math.round((bPf - Math.floor(bPf)) * 100);
    bs.fpts_against = Math.floor(bPa);
    bs.fpts_against_decimal = Math.round((bPa - Math.floor(bPa)) * 100);
    if (ap > bp) {
      as.wins = (as.wins || 0) + 1;
      bs.losses = (bs.losses || 0) + 1;
    } else if (bp > ap) {
      bs.wins = (bs.wins || 0) + 1;
      as.losses = (as.losses || 0) + 1;
    } else {
      as.ties = (as.ties || 0) + 1;
      bs.ties = (bs.ties || 0) + 1;
    }
  }
  return { rosters: Object.values(byRid), livePtsByRid };
}

async function main() {
  const leagueId = LEAGUE_ID;
  const live = (await sleeperGet(`/league/${leagueId}`)) || null;
  if (!live) throw new Error(`league ${leagueId} missing`);
  const today = new Date().toISOString().slice(0, 10);
  if (live.status === "complete") {
    writeUi("projected-finish.json", {
      v: 1,
      as_of: today,
      league_id: String(leagueId),
      season: Number(live.season) || null,
      week: null,
      status: "complete",
      seats: [],
      note: "Season complete — use Manager avg finish / year boards.",
    });
    console.log("projected-finish: season complete, empty book");
    return;
  }

  const settings = live.settings || {};
  const lastOfficial = Number(settings.last_scored_leg) || Number(settings.leg) || 0;
  const playoffStart = Number(settings.playoff_week_start) || 15;
  const teams = Number(live.total_rosters) || Number(settings.num_teams) || 10;
  const season = Number(live.season) || live.season;

  // Bank the in-flight NFL week when matchups already have points — same as
  // the weekly review loop. Nightly used to rebuild from last_scored_leg only
  // and wipe a mid-week W7 race-intent board back to W6 (Truman #10 regression).
  const state = await sleeperGet("/state/nfl");
  const nflWeek = Number(state && state.week) || 0;
  let bankWeek = Math.max(lastOfficial, nflWeek > 0 ? nflWeek : lastOfficial);
  let liveMatchups = null;
  if (bankWeek > lastOfficial) {
    liveMatchups = await sleeperGet(`/league/${leagueId}/matchups/${bankWeek}`);
    if (!matchupsHavePoints(liveMatchups)) bankWeek = lastOfficial;
  }

  const [rosters0, users] = await Promise.all([
    sleeperGet(`/league/${leagueId}/rosters`),
    sleeperGet(`/league/${leagueId}/users`),
  ]);

  let rosters = rosters0 || [];
  let livePtsByRid = null;
  if (bankWeek > lastOfficial && liveMatchups) {
    const applied = applyWeekResults(rosters0, liveMatchups);
    rosters = applied.rosters;
    livePtsByRid = applied.livePtsByRid;
  }

  const [rem, formByRoster] = await Promise.all([
    remainingPairs(leagueId, bankWeek, playoffStart),
    scoredFormByRoster(
      leagueId,
      season,
      bankWeek,
      ptsKeyFromLeague(live),
    ),
  ]);

  const ownerByRoster = {};
  for (const r of rosters || []) {
    ownerByRoster[Number(r.roster_id)] = r.owner_id;
  }
  const nameByUser = nameMap();
  // Fill gaps from Sleeper display names when aliases miss.
  for (const u of users || []) {
    const id = String(u.user_id);
    if (!nameByUser[id]) {
      nameByUser[id] = (u.metadata && u.metadata.team_name) || u.display_name || id;
    }
  }

  // Trend: tape through lastOfficial, then fold banked live week points.
  let trendByRoster = scoringTrendByRoster(season, lastOfficial, ownerByRoster);
  if (livePtsByRid) {
    const tape = readJson("weekly_scores.json", null);
    const merged = Object.create(null);
    for (const row of (tape && tape.scores) || []) {
      if (!row || String(row.season) !== String(season)) continue;
      if (row.phase && row.phase !== "regular") continue;
      const w = Number(row.week) || 0;
      if (w < 1 || w > lastOfficial) continue;
      const rid = Number(row.roster_id);
      if (!Number.isFinite(rid)) continue;
      if (!merged[rid]) merged[rid] = [];
      merged[rid].push({ week: w, points: Number(row.points) || 0 });
    }
    for (const [rid, pts] of Object.entries(livePtsByRid)) {
      const r = Number(rid);
      if (!merged[r]) merged[r] = [];
      merged[r].push({ week: bankWeek, points: Number(pts) || 0 });
    }
    trendByRoster = scoreTrendLeague(summarizeScoringTrend(
      Object.fromEntries(Object.entries(merged).map(([k, rows]) => [
        k,
        rows.sort((a, b) => a.week - b.week),
      ])),
    ));
  }

  const tradesRaw = readJson("trades.json", []) || [];
  const movesRaw = readJson("moves.json", []) || [];
  const heatByRoster = scoreHeatLeague(summarizeHeatByRoster({
    trades: Array.isArray(tradesRaw) ? tradesRaw : Object.values(tradesRaw),
    moves: Array.isArray(movesRaw) ? movesRaw : Object.values(movesRaw),
    ownerByRoster,
    season,
    week: bankWeek,
    window: 3,
  }));

  const raceIntent = readUi("race-intent.json", null)
    || readJson("race-intent.json", null);

  const book = projectFinishBook({
    rosters: rosters || [],
    ownerByRoster,
    nameByUser,
    remainingPairs: rem.pairs,
    teams,
    season,
    week: bankWeek,
    playoffWeekStart: playoffStart,
    arcByUser: arcByUser(),
    formByRoster,
    trendByRoster,
    heatByRoster,
    raceIntent,
  });

  // Monte Carlo remaining RS + playoffs — blend mean place into proj_finish
  // (multi-season calib: MC MAE beats the point book especially after W6).
  const mcSeats = Object.create(null);
  for (const r of rosters || []) {
    const rid = Number(r.roster_id);
    const st = r.settings || {};
    const { pf, pa } = fptsOf(st);
    const trend = trendByRoster[String(rid)] || {};
    const weekPts = Array.isArray(trend._week_pts)
      ? trend._week_pts
      : null;
    mcSeats[rid] = {
      wins: Number(st.wins) || 0,
      losses: Number(st.losses) || 0,
      ties: Number(st.ties) || 0,
      pf,
      pa,
      weekPts: weekPts || [],
    };
  }
  // Prefer raw tape points when trend helper did not stash them.
  const tape = readJson("weekly_scores.json", null);
  if (tape && Array.isArray(tape.scores)) {
    const byRid = Object.create(null);
    for (const row of tape.scores) {
      if (!row || String(row.season) !== String(season)) continue;
      if (row.phase && row.phase !== "regular") continue;
      const w = Number(row.week) || 0;
      if (w < 1 || w > lastOfficial) continue;
      const rid = Number(row.roster_id);
      if (!mcSeats[rid]) continue;
      if (!byRid[rid]) byRid[rid] = [];
      byRid[rid].push({ week: w, points: Number(row.points) || 0 });
    }
    if (livePtsByRid) {
      for (const [rid, pts] of Object.entries(livePtsByRid)) {
        const r = Number(rid);
        if (!mcSeats[r]) continue;
        if (!byRid[r]) byRid[r] = [];
        byRid[r].push({ week: bankWeek, points: Number(pts) || 0 });
      }
    }
    for (const rid of Object.keys(byRid)) {
      mcSeats[rid].weekPts = byRid[rid]
        .sort((a, b) => a.week - b.week)
        .map((x) => x.points);
    }
  }

  if (bankWeek >= 1 && rem.pairs.length) {
    attachMonteCarloToBook(book, {
      seats: mcSeats,
      remainingPairs: rem.pairs,
      week: bankWeek,
      playoffWeekStart: playoffStart,
      nSims: DEFAULT_MC_SIMS,
    });
  }

  book.as_of = today;
  book.league_id = String(leagueId);
  book.status = live.status || "in_season";
  book.remaining_weeks = rem.weeks;
  book.remaining_week_count = rem.weeks.length;
  book.remaining_games = rem.pairs.length;
  if (bankWeek > lastOfficial) {
    book.note = `W${bankWeek} banked from live Sleeper matchup points`
      + ` + race intent v6 (official last_scored_leg=${lastOfficial}).`;
  }

  writeUi("projected-finish.json", book);
  console.log(
    "projected-finish",
    book.season,
    "w" + book.week,
    bankWeek > lastOfficial ? `(banked; official ${lastOfficial})` : "",
    book.seats.length + " seats",
    rem.weeks.length + " weeks left",
    "mc",
    book.mc ? book.mc.n_sims + "@blend" + book.mc.blend_weight : "off",
    "→",
    book.seats.slice(0, 3).map((s) => s.name + " #" + s.proj_finish).join(", "),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
