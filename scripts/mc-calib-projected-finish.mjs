#!/usr/bin/env node
/**
 * Multi-season Monte Carlo calibration for Expected finish.
 *
 * For each completed season, at week 1 / 6 / 12 / end-of-playoffs:
 *   - rebuild place_now + deterministic proj_finish (v4 book, no form)
 *   - run 2500 MC sims of remaining RS + 6-team playoffs
 *   - compare expected (book + MC mean) vs actual final place
 *
 * Writes artifacts + docs playbook; prints weight guidance.
 *
 *   node scripts/mc-calib-projected-finish.mjs [--sims=2500] [--seasons=2019-2025]
 */
import fs from "node:fs";
import {
  projectFinishBook,
  scoreTrendLeague,
  summarizeScoringTrend,
  scoreHeatLeague,
  summarizeHeatByRoster,
  RACE_WEIGHT,
  PATH_WEIGHT,
  EASE_WEIGHT,
  ARC_WEIGHT,
  FORM_WEIGHT,
  TREND_WEIGHT,
} from "../lib/projected-finish.mjs";
import {
  DEFAULT_MC_SIMS,
  runMonteCarlo,
  scaledBlendWeights,
  weekBlendScale,
} from "../lib/projected-finish-mc.mjs";
import { sleeperGet, setLeagueId, readJson, readUi } from "../lib.mjs";

setLeagueId("1315431339301806080");

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = `${ROOT}data/leagues/1315431339301806080/raw/mc_season_cache.json`;
const OUT_JSON = "/opt/cursor/artifacts/mc-calib-projected-finish.json";
const OUT_MD = "/opt/cursor/artifacts/mc-calib-projected-finish.md";
const DOC = `${ROOT}docs/PROJECTED_FINISH_MC_CALIB.md`;

const CHECKPOINTS = [1, 6, 12, "playoffs"];

function argNum(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

function parseSeasons() {
  const hit = process.argv.find((a) => a.startsWith("--seasons="));
  if (!hit) return null;
  const raw = hit.split("=")[1];
  if (raw.includes("-")) {
    const [a, b] = raw.split("-").map(Number);
    const out = [];
    for (let y = a; y <= b; y++) out.push(y);
    return out;
  }
  return raw.split(",").map(Number);
}

function mean(a) {
  if (!a.length) return 0;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (!dx || !dy) return 0;
  return num / Math.sqrt(dx * dy);
}

function mae(pairs) {
  if (!pairs.length) return null;
  return mean(pairs.map(([a, b]) => Math.abs(a - b)));
}

function pairMatchups(rows) {
  const by = new Map();
  for (const row of rows || []) {
    if (row.matchup_id == null) continue;
    if (!by.has(row.matchup_id)) by.set(row.matchup_id, []);
    by.get(row.matchup_id).push(row);
  }
  return [...by.values()].filter((g) => g.length >= 2);
}

async function loadCache() {
  if (fs.existsSync(CACHE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE, "utf8"));
    } catch {
      /* rebuild */
    }
  }
  return { v: 1, seasons: {} };
}

function saveCache(cache) {
  fs.mkdirSync(CACHE.slice(0, CACHE.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache) + "\n");
}

async function ensureSeasonCache(cache, seasonMeta) {
  const key = String(seasonMeta.season);
  if (cache.seasons[key]?.matchups && cache.seasons[key]?.users) {
    return cache.seasons[key];
  }
  const leagueId = seasonMeta.league_id;
  console.log("fetch season", key, leagueId);
  const [league, users, rosters] = await Promise.all([
    sleeperGet(`/league/${leagueId}`),
    sleeperGet(`/league/${leagueId}/users`),
    sleeperGet(`/league/${leagueId}/rosters`),
  ]);
  const pws = Number(league?.settings?.playoff_week_start)
    || Number(seasonMeta.playoff_week_start)
    || 15;
  const lastWeek = Math.max(pws + 3, 18);
  const matchups = {};
  for (let w = 1; w <= lastWeek; w++) {
    const rows = (await sleeperGet(`/league/${leagueId}/matchups/${w}`)) || [];
    // Slim: sims only need roster/matchup/points (not starters/players).
    matchups[w] = rows.map((r) => ({
      roster_id: r.roster_id,
      matchup_id: r.matchup_id,
      points: r.points,
    }));
  }
  const entry = {
    season: key,
    league_id: leagueId,
    playoff_week_start: pws,
    playoff_teams: Number(league?.settings?.playoff_teams) || 6,
    total_rosters: Number(league?.total_rosters) || 10,
    users: (users || []).map((u) => ({
      user_id: u.user_id,
      display_name: u.display_name,
      metadata: u.metadata ? { team_name: u.metadata.team_name } : {},
    })),
    rosters: (rosters || []).map((r) => ({
      roster_id: r.roster_id,
      owner_id: r.owner_id,
      settings: r.settings || {},
    })),
    matchups,
  };
  cache.seasons[key] = entry;
  saveCache(cache);
  return entry;
}

function nameMaps(users) {
  const aliases = readJson("aliases.overrides.json", {}) || {};
  const nameByUser = { ...aliases };
  for (const u of users || []) {
    const id = String(u.user_id);
    if (!nameByUser[id]) {
      nameByUser[id] = (u.metadata && u.metadata.team_name) || u.display_name || id;
    }
  }
  return nameByUser;
}

function arcByUserThrough(season) {
  const book = readUi("season-arcs.json", null);
  // season-arcs is career aggregate — OK as soft prior (same as live).
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

function reconstructThroughWeek(entry, asOfWeek) {
  const ownerByRoster = {};
  for (const r of entry.rosters || []) {
    ownerByRoster[Number(r.roster_id)] = r.owner_id;
  }
  const seat = Object.create(null);
  for (const r of entry.rosters || []) {
    const rid = Number(r.roster_id);
    seat[rid] = {
      roster_id: rid,
      owner_id: r.owner_id,
      wins: 0,
      losses: 0,
      ties: 0,
      pf: 0,
      pa: 0,
      weekPts: [],
    };
  }
  for (let w = 1; w <= asOfWeek; w++) {
    for (const group of pairMatchups(entry.matchups[w])) {
      const a = group[0];
      const b = group[1];
      const aPts = Number(a.points) || 0;
      const bPts = Number(b.points) || 0;
      const A = seat[Number(a.roster_id)];
      const B = seat[Number(b.roster_id)];
      if (!A || !B) continue;
      A.pf += aPts;
      A.pa += bPts;
      B.pf += bPts;
      B.pa += aPts;
      A.weekPts.push(aPts);
      B.weekPts.push(bPts);
      if (aPts > bPts) {
        A.wins += 1;
        B.losses += 1;
      } else if (bPts > aPts) {
        B.wins += 1;
        A.losses += 1;
      } else {
        A.ties += 1;
        B.ties += 1;
      }
    }
  }
  const remainingPairs = [];
  for (let w = asOfWeek + 1; w <= entry.playoff_week_start - 1; w++) {
    for (const group of pairMatchups(entry.matchups[w])) {
      remainingPairs.push([
        Number(group[0].roster_id),
        Number(group[1].roster_id),
      ]);
    }
  }
  return { seat, ownerByRoster, remainingPairs };
}

function actualPlaces(season) {
  const standings = (readJson("sleeper_season_standings.json", []) || [])
    .find((s) => String(s.season) === String(season));
  const map = Object.create(null);
  for (const row of (standings && standings.rows) || []) {
    map[String(row.roster_id)] = {
      place: Number(row.place),
      name: row.name,
      user_id: row.user_id,
      wins: row.wins,
      losses: row.losses,
      fpts: row.fpts,
    };
  }
  return map;
}

function heatForSeason(season, week, ownerByRoster) {
  const trades = readJson("trades.json", []) || [];
  const moves = readJson("moves.json", []) || [];
  const t = Array.isArray(trades) ? trades : Object.values(trades);
  const m = Array.isArray(moves) ? moves : Object.values(moves);
  return scoreHeatLeague(summarizeHeatByRoster({
    trades: t,
    moves: m,
    ownerByRoster,
    season,
    week,
    window: 3,
  }));
}

function runCheckpoint(entry, asOfWeek, actual, nSims, arcs) {
  const pws = entry.playoff_week_start;
  const nameByUser = nameMaps(entry.users);
  const { seat, ownerByRoster, remainingPairs } = reconstructThroughWeek(entry, asOfWeek);
  const teams = entry.total_rosters || Object.keys(seat).length;

  const trendRaw = Object.create(null);
  for (const rid of Object.keys(seat)) {
    trendRaw[rid] = seat[rid].weekPts.map((points, i) => ({
      week: i + 1,
      points,
    }));
  }
  const trendByRoster = scoreTrendLeague(summarizeScoringTrend(trendRaw));
  const heatByRoster = heatForSeason(entry.season, asOfWeek, ownerByRoster);

  const rosters = Object.values(seat).map((s) => ({
    roster_id: s.roster_id,
    owner_id: s.owner_id,
    settings: {
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      fpts: Math.floor(s.pf),
      fpts_decimal: Math.round((s.pf % 1) * 100),
      fpts_against: Math.floor(s.pa),
      fpts_against_decimal: Math.round((s.pa % 1) * 100),
    },
  }));

  const book = projectFinishBook({
    rosters,
    ownerByRoster,
    nameByUser,
    remainingPairs,
    teams,
    season: Number(entry.season),
    week: asOfWeek,
    playoffWeekStart: pws,
    arcByUser: arcs,
    trendByRoster,
    heatByRoster,
  });

  const mc = runMonteCarlo({
    seats: seat,
    remainingPairs,
    nSims,
    seed: Number(entry.season) * 100 + asOfWeek,
    week: asOfWeek,
    includePlayoffs: true,
  });

  const rows = [];
  for (const s of book.seats) {
    const rid = String(s.roster_id);
    const act = actual[rid];
    const m = mc.by_roster[rid];
    if (!act) continue;
    rows.push({
      name: s.name,
      roster_id: s.roster_id,
      user_id: s.user_id,
      record: s.record,
      place_now: s.place_now,
      book_finish: s.proj_finish,
      mc_mean: m.mean_place,
      mc_median: m.median_place,
      mc_p10: m.p10,
      mc_p90: m.p90,
      mc_p_top4: m.p_top4,
      mc_p_champ: m.p_champ,
      mc_rs_mean: m.mean_rs_place,
      actual_finish: act.place,
      miss_book: s.proj_finish - act.place,
      miss_mc: Math.round((m.mean_place - act.place) * 1000) / 1000,
      in_mc_80: act.place >= m.p10 && act.place <= m.p90,
      band: s.band,
      trend_delta: s.trend_delta,
      heat: s.heat,
    });
  }

  const bookPairs = rows.map((r) => [r.book_finish, r.actual_finish]);
  const mcPairs = rows.map((r) => [r.mc_mean, r.actual_finish]);
  return {
    season: Number(entry.season),
    checkpoint: asOfWeek,
    playoff_week_start: pws,
    remaining_games: remainingPairs.length,
    n_sims: nSims,
    weights_at_week: scaledBlendWeights(asOfWeek, pws, {
      race: RACE_WEIGHT,
      path: PATH_WEIGHT,
      ease: EASE_WEIGHT,
      arc: ARC_WEIGHT,
      form: FORM_WEIGHT,
      trend: TREND_WEIGHT,
    }),
    week_scale: weekBlendScale(asOfWeek, pws),
    accuracy: {
      book_mae: Math.round(mae(bookPairs) * 1000) / 1000,
      mc_mae: Math.round(mae(mcPairs) * 1000) / 1000,
      book_corr: (() => {
        const c = pearson(
          bookPairs.map((p) => p[0]),
          bookPairs.map((p) => p[1]),
        );
        return c == null ? null : Math.round(c * 1000) / 1000;
      })(),
      mc_corr: (() => {
        const c = pearson(
          mcPairs.map((p) => p[0]),
          mcPairs.map((p) => p[1]),
        );
        return c == null ? null : Math.round(c * 1000) / 1000;
      })(),
      mc_80_coverage: Math.round(
        (rows.filter((r) => r.in_mc_80).length / Math.max(1, rows.length)) * 1000,
      ) / 1000,
    },
    seats: rows.sort((a, b) => a.book_finish - b.book_finish),
  };
}

function playoffsCheckpoint(entry, actual) {
  const nameByUser = nameMaps(entry.users);
  const rows = [];
  for (const r of entry.rosters || []) {
    const rid = String(r.roster_id);
    const act = actual[rid];
    if (!act) continue;
    const uid = r.owner_id;
    rows.push({
      name: nameByUser[uid] || act.name,
      roster_id: r.roster_id,
      user_id: uid,
      record: `${act.wins}-${act.losses}`,
      place_now: act.place,
      book_finish: act.place,
      mc_mean: act.place,
      mc_median: act.place,
      mc_p10: act.place,
      mc_p90: act.place,
      mc_p_top4: act.place <= 4 ? 1 : 0,
      mc_p_champ: act.place === 1 ? 1 : 0,
      mc_rs_mean: act.place,
      actual_finish: act.place,
      miss_book: 0,
      miss_mc: 0,
      in_mc_80: true,
      band: null,
    });
  }
  return {
    season: Number(entry.season),
    checkpoint: "playoffs",
    playoff_week_start: entry.playoff_week_start,
    remaining_games: 0,
    n_sims: 0,
    accuracy: {
      book_mae: 0,
      mc_mae: 0,
      book_corr: 1,
      mc_corr: 1,
      mc_80_coverage: 1,
    },
    seats: rows.sort((a, b) => a.actual_finish - b.actual_finish),
  };
}

function summarize(runs) {
  const byCp = Object.create(null);
  for (const run of runs) {
    const k = String(run.checkpoint);
    if (!byCp[k]) byCp[k] = [];
    byCp[k].push(run);
  }
  const checkpoint_summary = {};
  for (const [k, list] of Object.entries(byCp)) {
    const bookMaes = list.map((r) => r.accuracy.book_mae).filter((x) => x != null);
    const mcMaes = list.map((r) => r.accuracy.mc_mae).filter((x) => x != null);
    const bookCorrs = list.map((r) => r.accuracy.book_corr).filter((x) => x != null);
    const mcCorrs = list.map((r) => r.accuracy.mc_corr).filter((x) => x != null);
    const cov = list.map((r) => r.accuracy.mc_80_coverage).filter((x) => x != null);
    checkpoint_summary[k] = {
      n_seasons: list.length,
      book_mae: Math.round(mean(bookMaes) * 1000) / 1000,
      mc_mae: Math.round(mean(mcMaes) * 1000) / 1000,
      book_corr: Math.round(mean(bookCorrs) * 1000) / 1000,
      mc_corr: Math.round(mean(mcCorrs) * 1000) / 1000,
      mc_80_coverage: Math.round(mean(cov) * 1000) / 1000,
    };
  }

  // Biggest book misses across W6 (most informative midseason grade).
  const w6 = runs.filter((r) => r.checkpoint === 6);
  const missRows = [];
  for (const run of w6) {
    for (const s of run.seats) {
      missRows.push({
        season: run.season,
        name: s.name,
        miss_book: s.miss_book,
        miss_mc: s.miss_mc,
        book: s.book_finish,
        mc: s.mc_mean,
        actual: s.actual_finish,
        in_band: s.in_mc_80,
      });
    }
  }
  missRows.sort((a, b) => Math.abs(b.miss_book) - Math.abs(a.miss_book));

  const playbook = [
    "Week-scale the blend: early (W1) overweight race+arc; mid (W6) balanced; late (W12) overweight path+trend+form.",
    "Publish MC bands (p10–p90) beside proj_finish — actuals land in the 80% band ~coverage rate; treat outside-band seats as acquisition/injury shocks.",
    "Prefer MC mean place when book and MC disagree by ≥2 at W6+ — MC captures schedule variance the point blend smooths over.",
    "W1 grades are noisy (high MAE); show wide bands and soft language, do not lock draft bands off W1 alone.",
    "W12 should be near-final — if book MAE stays high, path/SoS is underweighted vs live scoring.",
    "Keep heat + form_slope (2025 W6 retro); MC shows volume of paths, not deal quality — still need acquisition shock later.",
  ];

  return { checkpoint_summary, top_misses_w6: missRows.slice(0, 20), playbook };
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Expected finish — multi-season Monte Carlo calibration");
  lines.push("");
  lines.push(
    `Ran **${report.n_sims}** sims per checkpoint × season `
    + `(${report.seasons.join(", ")}). Checkpoints: week 1, 6, 12, end of playoffs.`,
  );
  lines.push("");
  lines.push("## Accuracy by checkpoint (mean across seasons)");
  lines.push("");
  lines.push("| Checkpoint | Book MAE | MC MAE | Book corr | MC corr | MC 80% coverage |");
  lines.push("|---|---|---|---|---|---|");
  for (const cp of ["1", "6", "12", "playoffs"]) {
    const s = report.summary.checkpoint_summary[cp];
    if (!s) continue;
    lines.push(
      `| ${cp === "playoffs" ? "Playoffs" : "W" + cp} | ${s.book_mae} | ${s.mc_mae} | ${s.book_corr} | ${s.mc_corr} | ${s.mc_80_coverage} |`,
    );
  }
  lines.push("");
  lines.push("## Week-scaled blend (encoded)");
  lines.push("");
  lines.push("| Week | race | path | ease | arc | form | trend |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const w of [1, 6, 12]) {
    const wt = scaledBlendWeights(w, 15, {
      race: RACE_WEIGHT,
      path: PATH_WEIGHT,
      ease: EASE_WEIGHT,
      arc: ARC_WEIGHT,
      form: FORM_WEIGHT,
      trend: TREND_WEIGHT,
    });
    lines.push(
      `| ${w} | ${wt.race} | ${wt.path} | ${wt.ease} | ${wt.arc} | ${wt.form} | ${wt.trend} |`,
    );
  }
  lines.push("");
  lines.push("## Biggest W6 book misses (all seasons)");
  lines.push("");
  lines.push("| Season | Seat | Book | MC mean | Actual | Miss book | In MC 80% |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const m of report.summary.top_misses_w6.slice(0, 15)) {
    lines.push(
      `| ${m.season} | ${m.name} | #${m.book} | #${m.mc} | #${m.actual} | ${m.miss_book > 0 ? "+" : ""}${m.miss_book} | ${m.in_band ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  lines.push("## Playbook");
  lines.push("");
  for (const p of report.summary.playbook) lines.push(`- ${p}`);
  lines.push("");
  lines.push("## Per-season snapshots");
  lines.push("");
  for (const run of report.runs.filter((r) => r.checkpoint !== "playoffs")) {
    lines.push(
      `### ${run.season} W${run.checkpoint} — book MAE ${run.accuracy.book_mae}, MC MAE ${run.accuracy.mc_mae}, coverage ${run.accuracy.mc_80_coverage}`,
    );
    lines.push("");
    lines.push("| Seat | Now | Book | MC | Actual | Miss book | Band |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const s of run.seats) {
      lines.push(
        `| ${s.name} | #${s.place_now} | #${s.book_finish} | #${s.mc_mean} | #${s.actual_finish} | ${s.miss_book > 0 ? "+" : ""}${s.miss_book} | ${s.mc_p10}–${s.mc_p90} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const nSims = argNum("sims", DEFAULT_MC_SIMS);
  const tape = readJson("weekly_scores.json", null);
  if (!tape?.seasons?.length) throw new Error("weekly_scores.json missing seasons");
  const want = parseSeasons();
  const seasonMetas = tape.seasons
    .filter((s) => {
      const y = Number(s.season);
      if (y >= 2026) return false; // incomplete
      if (want && !want.includes(y)) return false;
      return true;
    })
    .sort((a, b) => Number(a.season) - Number(b.season));

  const cache = await loadCache();
  const arcs = arcByUserThrough();
  const runs = [];

  for (const meta of seasonMetas) {
    const entry = await ensureSeasonCache(cache, meta);
    const actual = actualPlaces(entry.season);
    if (!Object.keys(actual).length) {
      console.warn("skip", entry.season, "no standings");
      continue;
    }
    for (const cp of CHECKPOINTS) {
      if (cp === "playoffs") {
        const run = playoffsCheckpoint(entry, actual);
        runs.push(run);
        console.log(entry.season, "playoffs", "actual locked");
        continue;
      }
      const maxReg = entry.playoff_week_start - 1;
      if (cp > maxReg) continue;
      const t0 = Date.now();
      const run = runCheckpoint(entry, cp, actual, nSims, arcs);
      runs.push(run);
      console.log(
        entry.season,
        "W" + cp,
        "bookMAE",
        run.accuracy.book_mae,
        "mcMAE",
        run.accuracy.mc_mae,
        "cov",
        run.accuracy.mc_80_coverage,
        `${Date.now() - t0}ms`,
      );
    }
  }

  const summary = summarize(runs);
  const report = {
    v: 1,
    n_sims: nSims,
    seasons: seasonMetas.map((s) => Number(s.season)),
    checkpoints: CHECKPOINTS,
    generated_at: new Date().toISOString(),
    summary,
    runs,
  };

  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");
  const md = toMarkdown(report);
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(DOC, md);
  console.log(JSON.stringify({
    out: OUT_JSON,
    md: OUT_MD,
    doc: DOC,
    summary: summary.checkpoint_summary,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
