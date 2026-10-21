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
  const lastScored = Number(settings.last_scored_leg) || Number(settings.leg) || 0;
  const playoffStart = Number(settings.playoff_week_start) || 15;
  const teams = Number(live.total_rosters) || Number(settings.num_teams) || 10;

  const [rosters, users, rem, formByRoster] = await Promise.all([
    sleeperGet(`/league/${leagueId}/rosters`),
    sleeperGet(`/league/${leagueId}/users`),
    remainingPairs(leagueId, lastScored, playoffStart),
    scoredFormByRoster(
      leagueId,
      Number(live.season) || live.season,
      lastScored,
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

  const season = Number(live.season) || live.season;
  const trendByRoster = scoringTrendByRoster(season, lastScored, ownerByRoster);
  const tradesRaw = readJson("trades.json", []) || [];
  const movesRaw = readJson("moves.json", []) || [];
  const heatByRoster = scoreHeatLeague(summarizeHeatByRoster({
    trades: Array.isArray(tradesRaw) ? tradesRaw : Object.values(tradesRaw),
    moves: Array.isArray(movesRaw) ? movesRaw : Object.values(movesRaw),
    ownerByRoster,
    season,
    week: lastScored,
    window: 3,
  }));

  const book = projectFinishBook({
    rosters: rosters || [],
    ownerByRoster,
    nameByUser,
    remainingPairs: rem.pairs,
    teams,
    season,
    week: lastScored,
    playoffWeekStart: playoffStart,
    arcByUser: arcByUser(),
    formByRoster,
    trendByRoster,
    heatByRoster,
  });

  // Monte Carlo remaining RS + playoffs — blend mean place into proj_finish
  // (multi-season calib: MC MAE beats the point book especially after W6).
  const mcSeats = Object.create(null);
  for (const r of rosters || []) {
    const rid = Number(r.roster_id);
    const st = r.settings || {};
    const pf = (Number(st.fpts) || 0) + (Number(st.fpts_decimal) || 0) / 100;
    const pa = (Number(st.fpts_against) || 0)
      + (Number(st.fpts_against_decimal) || 0) / 100;
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
    for (const row of tape.scores) {
      if (!row || String(row.season) !== String(season)) continue;
      if (row.phase && row.phase !== "regular") continue;
      const w = Number(row.week) || 0;
      if (w < 1 || w > lastScored) continue;
      const rid = Number(row.roster_id);
      if (!mcSeats[rid]) continue;
      if (!mcSeats[rid].weekPts) mcSeats[rid].weekPts = [];
      // Avoid dupes if already filled.
      if (mcSeats[rid].weekPts.length < lastScored) {
        mcSeats[rid].weekPts.push(Number(row.points) || 0);
      }
    }
    // Tape push order may not be week-sorted per roster — rebuild sorted.
    const byRid = Object.create(null);
    for (const row of tape.scores) {
      if (!row || String(row.season) !== String(season)) continue;
      if (row.phase && row.phase !== "regular") continue;
      const w = Number(row.week) || 0;
      if (w < 1 || w > lastScored) continue;
      const rid = Number(row.roster_id);
      if (!mcSeats[rid]) continue;
      if (!byRid[rid]) byRid[rid] = [];
      byRid[rid].push({ week: w, points: Number(row.points) || 0 });
    }
    for (const rid of Object.keys(byRid)) {
      mcSeats[rid].weekPts = byRid[rid]
        .sort((a, b) => a.week - b.week)
        .map((x) => x.points);
    }
  }

  if (lastScored >= 1 && rem.pairs.length) {
    attachMonteCarloToBook(book, {
      seats: mcSeats,
      remainingPairs: rem.pairs,
      week: lastScored,
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

  writeUi("projected-finish.json", book);
  console.log(
    "projected-finish",
    book.season,
    "w" + book.week,
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
