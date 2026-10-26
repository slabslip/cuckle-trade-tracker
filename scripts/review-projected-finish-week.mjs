#!/usr/bin/env node
/**
 * Weekly Expected Finish review loop.
 *
 * 1. Confirm race-intent.json (tank / win_now / playoff_hunt)
 * 2. Bank the latest completed-or-live week slate into a what-if book
 * 3. Re-run v6 formula + 2500-sim MC with intents
 * 4. Sanity-check against intents (no Late tankers, win-now not buried without cause)
 * 5. Optionally WRITE_PF=1 to commit the book
 *
 *   WRITE_PF=1 node scripts/review-projected-finish-week.mjs [league_id]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { leagueRawDir, leagueUiDir, setLeagueId, sleeperGet, writeUi } from "../lib.mjs";
import {
  projectFinishBook,
  scoreFormLeague,
  scoreHeatLeague,
  scoreTrendLeague,
  summarizeFormByRoster,
  summarizeHeatByRoster,
  summarizeScoringTrend,
} from "../lib/projected-finish.mjs";
import {
  DEFAULT_MC_SIMS,
  attachMonteCarloToBook,
} from "../lib/projected-finish-mc.mjs";
import { effortForIntent, intentForSeat } from "../lib/race-intent.mjs";

const leagueId = setLeagueId(process.argv[2] || process.env.LEAGUE_ID);
const RAW = leagueRawDir();
const UI = leagueUiDir();

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
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

async function scoredFormByRoster(leagueId, season, lastScored, ptsKey) {
  const end = Number(lastScored) || 0;
  const weekDeltas = Object.create(null);
  for (let w = 1; w <= end; w++) {
    const [rows, projBy] = await Promise.all([
      sleeperGet(`/league/${leagueId}/matchups/${w}`),
      fetchWeekProjections(season, w, ptsKey),
    ]);
    for (const row of rows || []) {
      const rid = Number(row.roster_id);
      const actual = Number(row.points);
      if (!Number.isFinite(rid) || !Number.isFinite(actual) || actual <= 0) continue;
      let proj = 0;
      for (const id of row.starters || []) proj += Number(projBy[id]) || 0;
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

async function remainingPairs(leagueId, lastScored, playoffStart) {
  const pairs = [];
  const weeks = [];
  for (let w = lastScored + 1; w <= playoffStart - 1; w++) {
    const rows = (await sleeperGet(`/league/${leagueId}/matchups/${w}`)) || [];
    const by = new Map();
    for (const row of rows) {
      if (row.matchup_id == null) continue;
      if (!by.has(row.matchup_id)) by.set(row.matchup_id, []);
      by.get(row.matchup_id).push(Number(row.roster_id));
    }
    let n = 0;
    for (const g of by.values()) {
      if (g.length < 2) continue;
      pairs.push([g[0], g[1]]);
      n += 1;
    }
    if (n) weeks.push(w);
  }
  return { pairs, weeks };
}

function fptsOf(settings) {
  const s = settings || {};
  return {
    pf: (s.fpts || 0) + (s.fpts_decimal || 0) / 100,
    pa: (s.fpts_against || 0) + (s.fpts_against_decimal || 0) / 100,
  };
}

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
  const w7ByRid = Object.create(null);
  for (const [, group] of byM) {
    if (group.length < 2) continue;
    const a = group[0];
    const b = group[1];
    const ap = Number(a.points) || 0;
    const bp = Number(b.points) || 0;
    w7ByRid[Number(a.roster_id)] = ap;
    w7ByRid[Number(b.roster_id)] = bp;
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
  return { rosters: Object.values(byRid), w7ByRid };
}

function sanity(book, raceIntent) {
  const fails = [];
  const warns = [];
  for (const s of book.seats || []) {
    const intent = s.race_intent || intentForSeat(raceIntent, s);
    const mc = Number(s.mc_mean);
    if (intent === "tank" && s.band === "Late" && s.proj_finish <= 4) {
      fails.push(`${s.name} tank but Late #${s.proj_finish}`);
    }
    if (intent === "tank" && s.proj_finish <= 3) {
      fails.push(`${s.name} tank in top-3 proj (#${s.proj_finish})`);
    }
    // Hot-form / path must not keep a tanker ahead of honest MC finish ≤6.
    if (intent === "tank" && Number.isFinite(mc) && mc >= 6 && s.proj_finish <= 4) {
      fails.push(`${s.name} tank proj #${s.proj_finish} vs mc~${mc}`);
    }
    if (intent === "win_now" && s.band === "Early" && s.place_now <= 4) {
      warns.push(`${s.name} win_now + top-4 place but Early band (#${s.proj_finish})`);
    }
    // Cold form must not bury a win-now seat MC still puts in the title mix.
    if (intent === "win_now" && Number.isFinite(mc) && mc <= 4 && s.proj_finish >= 7) {
      fails.push(`${s.name} win_now buried at #${s.proj_finish} vs mc~${mc}`);
    }
    if (intent === "playoff_hunt" && s.proj_finish >= 9) {
      warns.push(`${s.name} playoff_hunt near bottom (#${s.proj_finish})`);
    }
    // Book vs MC disagreement after override should be ≤3 places at W6+.
    const bookF = Number(s.book_finish);
    if (Number.isFinite(mc) && Number.isFinite(bookF) && Math.abs(s.proj_finish - mc) > 3.5) {
      warns.push(`${s.name} final #${s.proj_finish} still far from mc~${mc} (book#${bookF})`);
    }
  }
  return { fails, warns };
}

async function main() {
  const live = await sleeperGet(`/league/${leagueId}`);
  const raceIntent = readJson(`${UI}/race-intent.json`, null);
  if (!raceIntent || !raceIntent.by_name) {
    throw new Error("missing ui/race-intent.json — set season intents before review");
  }

  const state = await sleeperGet("/state/nfl");
  const nflWeek = Number(state && state.week) || 0;
  const lastOfficial = Number(live.settings?.last_scored_leg) || 0;
  // Bank the in-flight NFL week when it has matchup points (mid-Sunday review).
  const bankWeek = Math.max(lastOfficial, nflWeek > 0 ? nflWeek : lastOfficial);
  const playoffStart = Number(live.settings?.playoff_week_start) || 15;
  const season = Number(live.season) || live.season;

  const [rosters0, users, matchups] = await Promise.all([
    sleeperGet(`/league/${leagueId}/rosters`),
    sleeperGet(`/league/${leagueId}/users`),
    sleeperGet(`/league/${leagueId}/matchups/${bankWeek}`),
  ]);

  const nameByUser = Object.create(null);
  const aliases = readJson(`${RAW}/aliases.overrides.json`, {}) || {};
  Object.assign(nameByUser, aliases);
  for (const m of readJson(`${UI}/members.json`, []) || []) {
    if (m?.user_id && m.name) nameByUser[String(m.user_id)] = m.name;
  }
  for (const u of users || []) {
    const id = String(u.user_id);
    if (!nameByUser[id]) {
      nameByUser[id] = (u.metadata && u.metadata.team_name) || u.display_name || id;
    }
  }

  let rosters = rosters0;
  let w7ByRid = null;
  if (bankWeek > lastOfficial) {
    const applied = applyWeekResults(rosters0, matchups);
    rosters = applied.rosters;
    w7ByRid = applied.w7ByRid;
  }

  const ownerByRoster = {};
  for (const r of rosters) ownerByRoster[Number(r.roster_id)] = r.owner_id;

  const rem = await remainingPairs(leagueId, bankWeek, playoffStart);
  const formByRoster = await scoredFormByRoster(
    leagueId,
    season,
    bankWeek,
    ptsKeyFromLeague(live),
  );

  const tape = readJson(`${RAW}/weekly_scores.json`, null);
  const byRidPts = Object.create(null);
  for (const row of (tape && tape.scores) || []) {
    if (!row || String(row.season) !== String(season)) continue;
    if (row.phase && row.phase !== "regular") continue;
    const w = Number(row.week) || 0;
    if (w < 1 || w > bankWeek) continue;
    if (w === bankWeek && w7ByRid) continue;
    const rid = Number(row.roster_id);
    if (!Number.isFinite(rid)) continue;
    if (!byRidPts[rid]) byRidPts[rid] = [];
    byRidPts[rid].push({ week: w, points: Number(row.points) || 0 });
  }
  if (w7ByRid) {
    for (const [rid, pts] of Object.entries(w7ByRid)) {
      if (!byRidPts[rid]) byRidPts[rid] = [];
      byRidPts[rid].push({ week: bankWeek, points: Number(pts) || 0 });
    }
  }
  const trendRaw = Object.create(null);
  for (const [rid, rows] of Object.entries(byRidPts)) {
    trendRaw[rid] = rows.sort((a, b) => a.week - b.week);
  }
  const trendByRoster = scoreTrendLeague(summarizeScoringTrend(
    Object.fromEntries(Object.entries(trendRaw).map(([k, rows]) => [k, rows])),
  ));

  const heatByRoster = scoreHeatLeague(summarizeHeatByRoster({
    trades: readJson(`${RAW}/trades.json`, []) || [],
    moves: readJson(`${RAW}/moves.json`, []) || [],
    ownerByRoster,
    season,
    week: bankWeek,
    window: 3,
  }));

  const arcs = readJson(`${UI}/season-arcs.json`, null);
  const arcByUser = Object.create(null);
  for (const s of (arcs && arcs.seats) || []) {
    if (!s?.user_id) continue;
    arcByUser[String(s.user_id)] = {
      avg_climb: Number(s.avg_climb) || 0,
      slow_burn_rate: Number(s.slow_burn_rate) || 0,
      fast_fade_rate: Number(s.fast_fade_rate) || 0,
      n: Number(s.n) || 0,
    };
  }

  const book = projectFinishBook({
    rosters,
    ownerByRoster,
    nameByUser,
    remainingPairs: rem.pairs,
    teams: Number(live.total_rosters) || 10,
    season,
    week: bankWeek,
    playoffWeekStart: playoffStart,
    arcByUser,
    formByRoster,
    trendByRoster,
    heatByRoster,
    raceIntent,
  });

  const mcSeats = Object.create(null);
  const effortByRoster = Object.create(null);
  for (const r of rosters) {
    const rid = Number(r.roster_id);
    const st = r.settings || {};
    const { pf, pa } = fptsOf(st);
    mcSeats[rid] = {
      wins: Number(st.wins) || 0,
      losses: Number(st.losses) || 0,
      ties: Number(st.ties) || 0,
      pf,
      pa,
      weekPts: (byRidPts[rid] || []).sort((a, b) => a.week - b.week).map((x) => x.points),
    };
  }
  for (const s of book.seats) {
    effortByRoster[Number(s.roster_id)] = Number(s.race_effort) || effortForIntent(s.race_intent);
  }

  attachMonteCarloToBook(book, {
    seats: mcSeats,
    remainingPairs: rem.pairs,
    week: bankWeek,
    playoffWeekStart: playoffStart,
    nSims: DEFAULT_MC_SIMS,
    effortByRoster,
  });

  const today = new Date().toISOString().slice(0, 10);
  book.as_of = today;
  book.league_id = String(leagueId);
  book.status = live.status || "in_season";
  book.remaining_weeks = rem.weeks;
  book.remaining_week_count = rem.weeks.length;
  book.remaining_games = rem.pairs.length;
  book.race_intent_as_of = raceIntent.as_of || today;
  book.note = bankWeek > lastOfficial
    ? `W${bankWeek} banked from live Sleeper matchup points + race intent v6 (official last_scored_leg=${lastOfficial}).`
    : `Expected Finish through W${bankWeek} with race intent v6.`;

  const check = sanity(book, raceIntent);
  console.log("week", bankWeek, "official_leg", lastOfficial, "remaining", rem.weeks.length);
  console.log("BOARD");
  for (const s of book.seats) {
    console.log(
      `#${s.proj_finish} place#${s.place_now} ${s.name} ${s.record} ${s.band} intent=${s.race_intent} effort=${s.race_effort} mc~${s.mc_mean} book#${s.book_finish} Δ${s.delta_place}`,
    );
  }
  if (check.warns.length) {
    console.log("WARN");
    for (const w of check.warns) console.log(" -", w);
  }
  if (check.fails.length) {
    console.log("FAIL");
    for (const f of check.fails) console.log(" -", f);
    process.exitCode = 2;
  } else {
    console.log("SANITY ok");
  }

  const artifact = {
    as_of: new Date().toISOString(),
    bankWeek,
    lastOfficial,
    board: book.seats.map((s) => ({
      proj: s.proj_finish,
      place: s.place_now,
      name: s.name,
      record: s.record,
      band: s.band,
      intent: s.race_intent,
      effort: s.race_effort,
      mc_mean: s.mc_mean,
      delta: s.delta_place,
    })),
    fails: check.fails,
    warns: check.warns,
  };
  if (existsSync("/opt/cursor/artifacts")) {
    writeFileSync(
      "/opt/cursor/artifacts/pf-week-review.json",
      JSON.stringify(artifact, null, 2),
    );
  }

  if (process.env.WRITE_PF === "1" && !check.fails.length) {
    writeUi("projected-finish.json", book);
    console.log("wrote projected-finish.json");
  } else if (process.env.WRITE_PF === "1" && check.fails.length) {
    console.error("refusing WRITE_PF — sanity fails");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
