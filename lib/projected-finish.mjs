/**
 * In-season projected finish → draft slot → Early / Mid / Late.
 *
 * Not career "Manager avg finish". Not bag-window guesswork alone.
 *
 * v4 (late trend): early weeks (1–4) are noisy — NFL starters/rookies unsettled —
 * so form + talent PF discount them. Live league-relative scoring trend toward
 * the playoffs joins career arcs + actual-vs-proj form in the blend.
 */
import { pickTier } from "../lib.mjs";
import { scaledBlendWeights } from "./projected-finish-mc.mjs";

/** Bill James–style pythagorean exponent for fantasy PF/PA. */
export const PYTHAG_EXP = 1.8;

/** Weeks 1..EARLY_WEEK_CUTOFF are downweighted (unknown starters / rookies). */
export const EARLY_WEEK_CUTOFF = 4;

/**
 * Score blend (v4).
 * - race: standings + late-weighted talent PF (not raw season PF alone)
 * - path: expected remaining wins (SoS + form + trend inside P(win))
 * - ease: remaining schedule easier than league mean
 * - arc: historical late-season climb (avg_climb from season arcs)
 * - form: outscore / underscore vs weekly starter projections (early weeks soft)
 * - trend: live league-relative PPW rising/falling into the playoffs
 */
export const RACE_WEIGHT = 0.28;
export const PATH_WEIGHT = 0.28;
export const EASE_WEIGHT = 0.10;
export const ARC_WEIGHT = 0.10;
export const FORM_WEIGHT = 0.12;
export const TREND_WEIGHT = 0.12;

/** @deprecated kept for older callers / SDD footnotes — maps to PATH_WEIGHT. */
export const SOS_WEIGHT = PATH_WEIGHT;
/** Bag blend retired in v2; arcs replace the soft prior. */
export const BAG_WEIGHT = 0;

/**
 * How hard form/trend z pushes pythag before matchup odds.
 * Combined signal ≈ ±1 moves win rate ~±FORM_LEAN (capped ±0.20 absolute).
 */
export const FORM_LEAN = 0.15;

/** Weight for one scored week in form / talent PF (early weeks soft). */
export function weekFormWeight(week) {
  const w = Number(week) || 1;
  if (w <= 2) return 0.2;
  if (w <= EARLY_WEEK_CUTOFF) return 0.4;
  if (w <= 7) return 1.0;
  if (w <= 10) return 1.4;
  return 1.75;
}

export function fptsPair(settings) {
  const s = settings || {};
  const pf = (s.fpts || 0) + (s.fpts_decimal || 0) / 100;
  const pa = (s.fpts_against || 0) + (s.fpts_against_decimal || 0) / 100;
  return { pf, pa };
}

export function pythagWinPct(pf, pa, exp = PYTHAG_EXP) {
  const a = Math.max(0, Number(pf) || 0);
  const b = Math.max(0, Number(pa) || 0);
  if (a + b <= 0) return 0.5;
  const num = Math.pow(a, exp);
  const den = num + Math.pow(b, exp);
  if (!den) return 0.5;
  return num / den;
}

/** P(home beats away) from two win rates. */
export function winProb(pHome, pAway) {
  const a = Math.min(0.95, Math.max(0.05, Number(pHome) || 0.5));
  const b = Math.min(0.95, Math.max(0.05, Number(pAway) || 0.5));
  const sum = a + b;
  if (sum <= 0) return 0.5;
  return a / sum;
}

/**
 * Blend season form_z, recent form_z, and live trend_z, then nudge pythag.
 * Neutral / missing signals leave pythag untouched.
 */
export function formAdjPyth(pyth, formZ, recentZ, trendZ, slopeZ, lean = FORM_LEAN) {
  const season = Number(formZ);
  const recent = Number(recentZ);
  const trend = Number(trendZ);
  const slope = Number(slopeZ);
  const signal = (Number.isFinite(season) ? 0.25 * season : 0)
    + (Number.isFinite(recent) ? 0.30 * recent : 0)
    + (Number.isFinite(slope) ? 0.15 * slope : 0)
    + (Number.isFinite(trend) ? 0.30 * trend : 0);
  const bump = Math.max(-0.20, Math.min(0.20, signal * lean));
  return Math.min(0.95, Math.max(0.05, (Number(pyth) || 0.5) + bump));
}

export function standingsPts(wins, losses, ties) {
  return (Number(wins) || 0) * 2 + (Number(ties) || 0);
}

export function pickSlotFromFinish(finish, teams) {
  const n = Math.max(2, Number(teams) || 10);
  const f = Math.min(n, Math.max(1, Number(finish) || Math.ceil(n / 2)));
  return n - f + 1;
}

function norm01(value, min, max) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return 0.5;
  return Math.min(1, Math.max(0, (Number(value) - lo) / (hi - lo)));
}

function mean(arr) {
  if (!arr || !arr.length) return 0;
  let s = 0;
  for (const x of arr) s += Number(x) || 0;
  return s / arr.length;
}

function stdev(arr, avg) {
  if (!arr || arr.length < 2) return 0;
  let s = 0;
  for (const x of arr) {
    const d = (Number(x) || 0) - avg;
    s += d * d;
  }
  return Math.sqrt(s / (arr.length - 1));
}

/**
 * Collapse per-roster week residuals into form rows (before league z-scores).
 * Early weeks are soft-weighted — rookies / unsettled NFL starters.
 * @param {object} weekDeltasByRoster — roster_id → [{ week, actual, proj, delta }]
 */
export function summarizeFormByRoster(weekDeltasByRoster) {
  const out = Object.create(null);
  for (const [rid, weeks] of Object.entries(weekDeltasByRoster || {})) {
    const rows = (weeks || []).filter((w) => {
      const proj = Number(w && w.proj);
      const actual = Number(w && w.actual);
      return Number.isFinite(proj) && proj >= 30 && Number.isFinite(actual);
    });
    if (!rows.length) continue;
    let wSum = 0;
    let dSum = 0;
    let rSum = 0;
    for (const w of rows) {
      const weight = weekFormWeight(w.week);
      const delta = Number(w.delta);
      const d = Number.isFinite(delta) ? delta : (Number(w.actual) - Number(w.proj));
      const ratio = Number(w.actual) / Math.max(40, Number(w.proj));
      wSum += weight;
      dSum += d * weight;
      rSum += ratio * weight;
    }
    const sorted = rows.slice().sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0));
    const recentN = Math.min(3, sorted.length);
    const recent = sorted.slice(-recentN);
    const deltaOf = (w) => {
      const delta = Number(w.delta);
      return Number.isFinite(delta) ? delta : (Number(w.actual) - Number(w.proj));
    };
    const recentDelta = mean(recent.map(deltaOf));
    // Form slope: recent residual vs early (≤3) — catches seats that flip vs proj.
    const earlyRows = sorted.filter((w) => Number(w.week) <= 3);
    const earlyDelta = earlyRows.length ? mean(earlyRows.map(deltaOf)) : recentDelta;
    const formSlope = recentDelta - earlyDelta;
    out[String(rid)] = {
      form_delta: Math.round((dSum / wSum) * 10) / 10,
      form_ratio: Math.round((rSum / wSum) * 1000) / 1000,
      form_recent: Math.round(recentDelta * 10) / 10,
      form_slope: Math.round(formSlope * 10) / 10,
      form_n: rows.length,
    };
  }
  return out;
}

/** Attach league z-scores + 0–1 form_score onto summarizeFormByRoster rows. */
export function scoreFormLeague(formByRoster) {
  const keys = Object.keys(formByRoster || {});
  if (!keys.length) return Object.create(null);
  const deltas = keys.map((k) => Number(formByRoster[k].form_delta) || 0);
  const recents = keys.map((k) => Number(formByRoster[k].form_recent) || 0);
  const avgD = mean(deltas);
  const sdD = stdev(deltas, avgD) || 1;
  const avgR = mean(recents);
  const sdR = stdev(recents, avgR) || 1;
  const scored = Object.create(null);
  for (const k of keys) {
    const row = formByRoster[k];
    const formZ = ((Number(row.form_delta) || 0) - avgD) / sdD;
    const recentZ = ((Number(row.form_recent) || 0) - avgR) / sdR;
    scored[k] = {
      ...row,
      form_z: Math.round(formZ * 1000) / 1000,
      form_recent_z: Math.round(recentZ * 1000) / 1000,
    };
  }
  const slopes = keys.map((k) => Number(formByRoster[k].form_slope) || 0);
  const avgSlope = mean(slopes);
  const sdSlope = stdev(slopes, avgSlope) || 1;
  for (const k of keys) {
    const slopeZ = ((Number(formByRoster[k].form_slope) || 0) - avgSlope) / sdSlope;
    scored[k].form_slope_z = Math.round(slopeZ * 1000) / 1000;
  }
  // Recent form dominates; slope catches W6-style flips vs proj (2025 Truman pattern).
  const blend = keys.map((k) => {
    const s = scored[k];
    return 0.30 * s.form_z + 0.50 * s.form_recent_z + 0.20 * s.form_slope_z;
  });
  const minB = Math.min(...blend, 0);
  const maxB = Math.max(...blend, 0);
  keys.forEach((k, i) => {
    scored[k].form_score = Math.round(norm01(blend[i], minB, maxB) * 1000) / 1000;
  });
  return scored;
}

/**
 * Recent transaction heat: trades + FA/waiver adds in the last few scored weeks.
 * 2025 W6 retro: outperformers (SF/Truman/Tips) were hot on the wire and trade board.
 * @param {object} opts
 * @param {Array} opts.trades — { season, week, user_ids[] }
 * @param {Array} opts.moves — { season, week, type, roster_ids[], adds }
 * @param {object} opts.ownerByRoster
 * @param {number} opts.season
 * @param {number} opts.week — last scored week
 * @param {number} [opts.window] — lookback weeks (default 3)
 */
export function summarizeHeatByRoster(opts) {
  const week = Number(opts.week) || 0;
  const season = opts.season;
  const window = Number(opts.window) || 3;
  const start = Math.max(1, week - window + 1);
  const ownerByRoster = opts.ownerByRoster || {};
  const heat = Object.create(null);
  const bump = (rid, kind) => {
    const key = String(rid);
    if (!heat[key]) heat[key] = { trade_n: 0, fa_n: 0 };
    heat[key][kind] += 1;
  };
  for (const t of opts.trades || []) {
    if (String(t.season) !== String(season)) continue;
    const w = Number(t.week) || 0;
    if (w < start || w > week) continue;
    for (const uid of (t.user_ids || [])) {
      for (const [rid, owner] of Object.entries(ownerByRoster)) {
        if (String(owner) === String(uid)) bump(rid, "trade_n");
      }
    }
  }
  for (const m of opts.moves || []) {
    if (String(m.season) !== String(season)) continue;
    const w = Number(m.week) || 0;
    if (w < start || w > week) continue;
    if (m.type !== "free_agent" && m.type !== "waiver") continue;
    const addN = Object.keys(m.adds || {}).length;
    if (!addN) continue;
    for (const rid of (m.roster_ids || [])) bump(rid, "fa_n");
  }
  for (const key of Object.keys(heat)) {
    const row = heat[key];
    // Trades count heavier — 2025 champs were deal-makers, not only FA scrapers.
    row.heat = Math.round((row.trade_n * 2 + row.fa_n * 0.35) * 10) / 10;
  }
  return heat;
}

export function scoreHeatLeague(heatByRoster) {
  const keys = Object.keys(heatByRoster || {});
  if (!keys.length) return Object.create(null);
  const heats = keys.map((k) => Number(heatByRoster[k].heat) || 0);
  const avg = mean(heats);
  const sd = stdev(heats, avg) || 1;
  const scored = Object.create(null);
  const zs = keys.map((k, i) => {
    const z = (heats[i] - avg) / sd;
    scored[k] = {
      ...heatByRoster[k],
      heat_z: Math.round(z * 1000) / 1000,
    };
    return z;
  });
  const minZ = Math.min(...zs, 0);
  const maxZ = Math.max(...zs, 0);
  keys.forEach((k, i) => {
    scored[k].heat_score = Math.round(norm01(zs[i], minZ, maxZ) * 1000) / 1000;
  });
  return scored;
}

/**
 * Live scoring trend toward playoffs from weekly actual points.
 * League-relative PPW: early (≤4) vs post-early / recent window.
 * @param {object} weekPointsByRoster — roster_id → [{ week, points }]
 */
export function summarizeScoringTrend(weekPointsByRoster) {
  const byWeek = Object.create(null);
  for (const weeks of Object.values(weekPointsByRoster || {})) {
    for (const w of weeks || []) {
      const week = Number(w.week);
      const pts = Number(w.points);
      if (!Number.isFinite(week) || !Number.isFinite(pts)) continue;
      (byWeek[week] ||= []).push(pts);
    }
  }
  const leagueMean = Object.create(null);
  for (const [week, arr] of Object.entries(byWeek)) {
    leagueMean[week] = mean(arr);
  }

  const out = Object.create(null);
  for (const [rid, weeks] of Object.entries(weekPointsByRoster || {})) {
    const rows = (weeks || [])
      .map((w) => ({
        week: Number(w.week),
        points: Number(w.points),
      }))
      .filter((w) => Number.isFinite(w.week) && Number.isFinite(w.points) && w.points > 0)
      .sort((a, b) => a.week - b.week);
    if (rows.length < 2) continue;

    const withRel = rows.map((w) => ({
      ...w,
      rel: w.points - (leagueMean[w.week] || 0),
      weight: weekFormWeight(w.week),
    }));

    const early = withRel.filter((w) => w.week <= EARLY_WEEK_CUTOFF);
    const post = withRel.filter((w) => w.week > EARLY_WEEK_CUTOFF);
    const recentN = Math.min(3, withRel.length);
    const recent = withRel.slice(-recentN);

    const earlyRel = early.length ? mean(early.map((w) => w.rel)) : mean(withRel.map((w) => w.rel));
    const postRel = post.length ? mean(post.map((w) => w.rel)) : earlyRel;
    const recentRel = mean(recent.map((w) => w.rel));

    // Weighted talent PPW (early soft) for race / pythag scaling.
    let wSum = 0;
    let pSum = 0;
    for (const w of withRel) {
      wSum += w.weight;
      pSum += w.points * w.weight;
    }
    const talentPpw = wSum ? pSum / wSum : mean(withRel.map((w) => w.points));

    // Slope of league-relative points vs week.
    const xs = withRel.map((w) => w.week);
    const ys = withRel.map((w) => w.rel);
    const mx = mean(xs);
    const my = mean(ys);
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) * (xs[i] - mx);
    }
    const slope = den ? num / den : 0;

    // Improvement vs early weeks (display).
    const trendDelta = postRel - earlyRel;
    // Ranking signal: must also be scoring well lately — not just "less bad".
    // Until 3+ post-early weeks exist, trust recent level more than the delta
    // (a two-week spike after week 4 should not reorder the board alone).
    const postN = post.length;
    const trendConf = Math.min(1, postN / 3);
    const rawSignal = 0.40 * trendDelta + 0.60 * recentRel;
    const trendSignal = trendConf * rawSignal + (1 - trendConf) * recentRel;

    out[String(rid)] = {
      early_rel: Math.round(earlyRel * 10) / 10,
      post_rel: Math.round(postRel * 10) / 10,
      recent_rel: Math.round(recentRel * 10) / 10,
      trend_delta: Math.round(trendDelta * 10) / 10,
      trend_signal: Math.round(trendSignal * 10) / 10,
      trend_slope: Math.round(slope * 1000) / 1000,
      talent_ppw: Math.round(talentPpw * 10) / 10,
      trend_n: withRel.length,
      trend_conf: Math.round(trendConf * 1000) / 1000,
    };
  }
  return out;
}

/** League z-scores + 0–1 trend_score for playoff-trending blend. */
export function scoreTrendLeague(trendByRoster) {
  const keys = Object.keys(trendByRoster || {});
  if (!keys.length) return Object.create(null);
  const signals = keys.map((k) => {
    const row = trendByRoster[k];
    if (row.trend_signal != null) return Number(row.trend_signal) || 0;
    // Compat: old rows without trend_signal.
    return 0.4 * (Number(row.trend_delta) || 0) + 0.6 * (Number(row.recent_rel) || 0);
  });
  const slopes = keys.map((k) => Number(trendByRoster[k].trend_slope) || 0);
  const avgSig = mean(signals);
  const sdSig = stdev(signals, avgSig) || 1;
  const avgS = mean(slopes);
  const sdS = stdev(slopes, avgS) || 1;
  const scored = Object.create(null);
  const blend = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const row = trendByRoster[k];
    const trendZ = (signals[i] - avgSig) / sdSig;
    const slopeZ = ((Number(row.trend_slope) || 0) - avgS) / sdS;
    const signal = 0.8 * trendZ + 0.2 * slopeZ;
    blend.push(signal);
    scored[k] = {
      ...row,
      trend_signal: row.trend_signal != null
        ? Number(row.trend_signal)
        : Math.round(signals[i] * 10) / 10,
      trend_z: Math.round(trendZ * 1000) / 1000,
      trend_slope_z: Math.round(slopeZ * 1000) / 1000,
    };
  }
  const minB = Math.min(...blend, 0);
  const maxB = Math.max(...blend, 0);
  keys.forEach((k, i) => {
    scored[k].trend_score = Math.round(norm01(blend[i], minB, maxB) * 1000) / 1000;
  });
  return scored;
}

/**
 * @param {object} opts
 * @param {Array} opts.rosters — Sleeper rosters
 * @param {object} opts.ownerByRoster — roster_id → user_id
 * @param {object} opts.nameByUser — user_id → display name (aliases win)
 * @param {Array<[number, number]>} opts.remainingPairs — remaining RS matchup pairs of roster_ids
 * @param {number} opts.teams
 * @param {number} opts.season
 * @param {number} opts.week — last scored week
 * @param {number} opts.playoffWeekStart
 * @param {object} [opts.bagNowByUser] — unused (API compat)
 * @param {object} [opts.arcByUser] — user_id → { avg_climb, slow_burn_rate, fast_fade_rate, n }
 * @param {object} [opts.formByRoster] — roster_id → form row
 * @param {object} [opts.trendByRoster] — roster_id → trend row (or raw week points arrays)
 * @param {object} [opts.heatByRoster] — roster_id → { trade_n, fa_n, heat, heat_z, heat_score }
 */
export function projectFinishBook(opts) {
  const rosters = opts.rosters || [];
  const ownerByRoster = opts.ownerByRoster || {};
  const nameByUser = opts.nameByUser || {};
  const remainingPairs = opts.remainingPairs || [];
  const teams = Number(opts.teams) || rosters.length || 10;
  const arcByUser = opts.arcByUser || {};
  let formByRoster = opts.formByRoster || {};
  let trendByRoster = opts.trendByRoster || {};
  let heatByRoster = opts.heatByRoster || {};

  if (formByRoster && !Object.values(formByRoster).some((r) => r && r.form_z != null)) {
    const hasWeeks = Object.values(formByRoster).some((r) => Array.isArray(r));
    if (hasWeeks) {
      formByRoster = scoreFormLeague(summarizeFormByRoster(formByRoster));
    } else if (Object.keys(formByRoster).length) {
      formByRoster = scoreFormLeague(formByRoster);
    }
  }
  if (trendByRoster && !Object.values(trendByRoster).some((r) => r && r.trend_z != null)) {
    const hasWeeks = Object.values(trendByRoster).some((r) => Array.isArray(r));
    if (hasWeeks) {
      trendByRoster = scoreTrendLeague(summarizeScoringTrend(trendByRoster));
    } else if (Object.keys(trendByRoster).length) {
      trendByRoster = scoreTrendLeague(trendByRoster);
    }
  }
  if (heatByRoster && !Object.values(heatByRoster).some((r) => r && r.heat_z != null)) {
    if (Object.keys(heatByRoster).length) {
      heatByRoster = scoreHeatLeague(heatByRoster);
    }
  }

  const week = Number(opts.week) || 0;
  const playoffStart = Number(opts.playoffWeekStart) || 15;
  const weeksLeft = Math.max(0, playoffStart - 1 - week);
  const seasonWeeks = Math.max(1, week + weeksLeft);
  // Trust career arcs more early; live path/trend more late.
  const arcScale = weeksLeft / seasonWeeks;
  const gamesPlayed = Math.max(1, week);
  // Multi-season MC calibration: re-balance blend by week (see projected-finish-mc).
  const blendW = scaledBlendWeights(week || 1, playoffStart, {
    race: RACE_WEIGHT,
    path: PATH_WEIGHT,
    ease: EASE_WEIGHT,
    arc: ARC_WEIGHT,
    form: FORM_WEIGHT,
    trend: TREND_WEIGHT,
  });

  const byRid = new Map();
  for (const r of rosters) {
    const rid = Number(r.roster_id);
    const st = r.settings || {};
    const { pf, pa } = fptsPair(st);
    const wins = Number(st.wins) || 0;
    const losses = Number(st.losses) || 0;
    const ties = Number(st.ties) || 0;
    const uid = ownerByRoster[rid] || r.owner_id || null;
    const arc = (uid != null && arcByUser[String(uid)]) || {};
    const form = formByRoster[String(rid)] || formByRoster[rid] || {};
    const trend = trendByRoster[String(rid)] || trendByRoster[rid] || {};
    const heat = heatByRoster[String(rid)] || heatByRoster[rid] || {};

    const seasonPpw = pf / gamesPlayed;
    const talentPpw = Number(trend.talent_ppw);
    // Late-weighted talent PF: pull season totals toward post-early efficiency.
    const blendPpw = Number.isFinite(talentPpw)
      ? (0.30 * seasonPpw + 0.70 * talentPpw)
      : seasonPpw;
    const talentPf = blendPpw * gamesPlayed;
    const pyth = pythagWinPct(talentPf, pa);

    const formZ = Number(form.form_z);
    const recentZ = Number(form.form_recent_z);
    const slopeZ = Number(form.form_slope_z);
    const trendZ = Number(trend.trend_z);
    const heatZ = Number(heat.heat_z);
    // Heat nudges trend z — deal-makers / FA heat from 2025 W6 retro.
    const trendWithHeat = (Number.isFinite(trendZ) ? trendZ : 0)
      + 0.25 * (Number.isFinite(heatZ) ? heatZ : 0);
    const adjPyth = formAdjPyth(pyth, formZ, recentZ, trendWithHeat, slopeZ);

    byRid.set(rid, {
      roster_id: rid,
      user_id: uid,
      name: (uid && nameByUser[uid]) || `roster ${rid}`,
      wins,
      losses,
      ties,
      record: wins + "-" + losses + (ties ? "-" + ties : ""),
      pf: Math.round(pf * 100) / 100,
      pa: Math.round(pa * 100) / 100,
      talent_pf: Math.round(talentPf * 100) / 100,
      standings_pts: standingsPts(wins, losses, ties),
      pyth,
      adj_pyth: adjPyth,
      bag_now: null,
      avg_climb: Number(arc.avg_climb) || 0,
      slow_burn_rate: Number(arc.slow_burn_rate) || 0,
      fast_fade_rate: Number(arc.fast_fade_rate) || 0,
      arc_n: Number(arc.n) || 0,
      form_delta: form.form_delta != null ? Number(form.form_delta) : null,
      form_recent: form.form_recent != null ? Number(form.form_recent) : null,
      form_slope: form.form_slope != null ? Number(form.form_slope) : null,
      form_ratio: form.form_ratio != null ? Number(form.form_ratio) : null,
      form_n: Number(form.form_n) || 0,
      form_z: Number.isFinite(formZ) ? formZ : 0,
      form_recent_z: Number.isFinite(recentZ) ? recentZ : 0,
      form_slope_z: Number.isFinite(slopeZ) ? slopeZ : 0,
      form_score: form.form_score != null ? Number(form.form_score) : 0.5,
      early_rel: trend.early_rel != null ? Number(trend.early_rel) : null,
      post_rel: trend.post_rel != null ? Number(trend.post_rel) : null,
      recent_rel: trend.recent_rel != null ? Number(trend.recent_rel) : null,
      trend_delta: trend.trend_delta != null ? Number(trend.trend_delta) : null,
      trend_slope: trend.trend_slope != null ? Number(trend.trend_slope) : null,
      talent_ppw: Number.isFinite(talentPpw) ? Math.round(talentPpw * 10) / 10 : null,
      trend_n: Number(trend.trend_n) || 0,
      trend_z: Number.isFinite(trendZ) ? trendZ : 0,
      // Fold transaction heat into trend_score for the blend slot.
      trend_score: Math.min(1, Math.max(0,
        0.75 * (trend.trend_score != null ? Number(trend.trend_score) : 0.5)
        + 0.25 * (heat.heat_score != null ? Number(heat.heat_score) : 0.5))),
      trade_n: Number(heat.trade_n) || 0,
      fa_n: Number(heat.fa_n) || 0,
      heat: heat.heat != null ? Number(heat.heat) : null,
      heat_z: Number.isFinite(heatZ) ? heatZ : 0,
      remaining: [],
      opp_pyth_sum: 0,
      opp_n: 0,
      expected_remaining_wins: 0,
    });
  }

  for (const pair of remainingPairs) {
    if (!pair || pair.length < 2) continue;
    const a = Number(pair[0]);
    const b = Number(pair[1]);
    const A = byRid.get(a);
    const B = byRid.get(b);
    if (!A || !B) continue;
    const pA = winProb(A.adj_pyth, B.adj_pyth);
    const pB = 1 - pA;
    A.remaining.push({ opp_roster_id: b, opp: B.name, p_win: Math.round(pA * 1000) / 1000 });
    B.remaining.push({ opp_roster_id: a, opp: A.name, p_win: Math.round(pB * 1000) / 1000 });
    A.expected_remaining_wins += pA;
    B.expected_remaining_wins += pB;
    A.opp_pyth_sum += B.adj_pyth;
    B.opp_pyth_sum += A.adj_pyth;
    A.opp_n += 1;
    B.opp_n += 1;
  }

  const seats = [...byRid.values()];
  for (const s of seats) {
    s.expected_wins = Math.round((s.wins + s.expected_remaining_wins) * 1000) / 1000;
    s.expected_remaining_wins = Math.round(s.expected_remaining_wins * 1000) / 1000;
    s.sos = s.opp_n ? Math.round((s.opp_pyth_sum / s.opp_n) * 1000) / 1000 : 0.5;
    s.sos_ease = Math.round((1 - s.sos) * 1000) / 1000;
  }

  // Current place (race only): standings points, then raw PF.
  const raceOrder = seats.slice().sort((a, b) =>
    (b.standings_pts - a.standings_pts)
    || (b.pf - a.pf)
    || (a.roster_id - b.roster_id));
  raceOrder.forEach((s, i) => { s.place_now = i + 1; });

  const maxRace = Math.max(1, ...seats.map((s) => s.standings_pts));
  const maxTalentPf = Math.max(1, ...seats.map((s) => s.talent_pf || s.pf));
  const remWins = seats.map((s) => s.expected_remaining_wins);
  const minRem = Math.min(...remWins);
  const maxRem = Math.max(...remWins);
  const eases = seats.map((s) => s.sos_ease);
  const minEase = Math.min(...eases);
  const maxEase = Math.max(...eases);
  const climbs = seats.map((s) => s.avg_climb);
  const minClimb = Math.min(...climbs);
  const maxClimb = Math.max(...climbs);
  const forms = seats.map((s) => Number(s.form_score));
  const minForm = Math.min(...forms);
  const maxForm = Math.max(...forms);
  const trends = seats.map((s) => Number(s.trend_score));
  const minTrend = Math.min(...trends);
  const maxTrend = Math.max(...trends);

  for (const s of seats) {
    // Race uses late-weighted talent PF so weeks 1–4 do not dominate,
    // but banked wins still anchor the board.
    const race = 0.65 * (s.standings_pts / maxRace)
      + 0.35 * ((s.talent_pf || s.pf) / maxTalentPf);
    const path = norm01(s.expected_remaining_wins, minRem, maxRem);
    const ease = norm01(s.sos_ease, minEase, maxEase);
    const arcRaw = norm01(s.avg_climb, minClimb, maxClimb);
    const fadePull = Math.min(1, Math.max(0, s.fast_fade_rate));
    // Slow-burn history gets a small live boost when already trending up.
    const burnBoost = Math.min(0.15, Math.max(0, s.slow_burn_rate) * 0.15
      * Math.max(0, s.trend_z));
    const arc = Math.min(1, Math.max(0,
      arcRaw * (0.55 + 0.45 * arcScale) - 0.25 * fadePull + burnBoost));
    const form = norm01(s.form_score, minForm, maxForm);
    const trend = norm01(s.trend_score, minTrend, maxTrend);
    s.path_score = Math.round(path * 1000) / 1000;
    s.ease_score = Math.round(ease * 1000) / 1000;
    s.arc_score = Math.round(arc * 1000) / 1000;
    s.form_score = Math.round(form * 1000) / 1000;
    s.trend_score = Math.round(trend * 1000) / 1000;
    s.proj_score = Math.round(
      (blendW.race * race
        + blendW.path * path
        + blendW.ease * ease
        + blendW.arc * arc
        + blendW.form * form
        + blendW.trend * trend) * 10000,
    ) / 10000;
  }

  const projOrder = seats.slice().sort((a, b) =>
    (b.proj_score - a.proj_score)
    || (b.expected_wins - a.expected_wins)
    || (b.expected_remaining_wins - a.expected_remaining_wins)
    || (b.talent_pf - a.talent_pf)
    || (b.pf - a.pf)
    || (a.roster_id - b.roster_id));

  projOrder.forEach((s, i) => {
    s.proj_finish = i + 1;
    s.proj_slot = pickSlotFromFinish(s.proj_finish, teams);
    s.band = pickTier(s.proj_slot, teams);
    s.delta_place = s.place_now - s.proj_finish;
  });

  return {
    v: 5,
    season: Number(opts.season) || null,
    week: Number(opts.week) || null,
    playoff_week_start: Number(opts.playoffWeekStart) || null,
    teams,
    remaining_games: remainingPairs.length,
    rule: {
      race_weight: blendW.race,
      path_weight: blendW.path,
      ease_weight: blendW.ease,
      arc_weight: blendW.arc,
      form_weight: blendW.form,
      trend_weight: blendW.trend,
      base_race_weight: RACE_WEIGHT,
      base_path_weight: PATH_WEIGHT,
      base_ease_weight: EASE_WEIGHT,
      base_arc_weight: ARC_WEIGHT,
      base_form_weight: FORM_WEIGHT,
      base_trend_weight: TREND_WEIGHT,
      sos_weight: blendW.path,
      bag_weight: BAG_WEIGHT,
      pythag_exp: PYTHAG_EXP,
      form_lean: FORM_LEAN,
      early_week_cutoff: EARLY_WEEK_CUTOFF,
      arc_scale: Math.round(arcScale * 1000) / 1000,
      rem_frac: blendW.rem_frac,
      note: "v5: week-scaled blend from multi-season MC; early weeks soft; playoff-trend + form slope + trade/FA heat. Regular season book — MC playoff bands optional.",
    },
    seats: projOrder.map((s) => ({
      user_id: s.user_id,
      name: s.name,
      roster_id: s.roster_id,
      place_now: s.place_now,
      record: s.record,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pf: s.pf,
      pa: s.pa,
      talent_pf: s.talent_pf,
      sos: s.sos,
      sos_ease: s.sos_ease,
      expected_remaining_wins: s.expected_remaining_wins,
      expected_wins: s.expected_wins,
      avg_climb: s.avg_climb,
      slow_burn_rate: s.slow_burn_rate,
      fast_fade_rate: s.fast_fade_rate,
      path_score: s.path_score,
      ease_score: s.ease_score,
      arc_score: s.arc_score,
      form_score: s.form_score,
      form_delta: s.form_delta,
      form_recent: s.form_recent,
      form_slope: s.form_slope,
      form_ratio: s.form_ratio,
      form_n: s.form_n,
      form_z: s.form_z,
      form_recent_z: s.form_recent_z,
      form_slope_z: s.form_slope_z,
      trend_score: s.trend_score,
      early_rel: s.early_rel,
      post_rel: s.post_rel,
      recent_rel: s.recent_rel,
      trend_delta: s.trend_delta,
      trend_slope: s.trend_slope,
      talent_ppw: s.talent_ppw,
      trend_n: s.trend_n,
      trend_z: s.trend_z,
      trade_n: s.trade_n,
      fa_n: s.fa_n,
      heat: s.heat,
      heat_z: s.heat_z,
      bag_now: s.bag_now,
      proj_score: s.proj_score,
      proj_finish: s.proj_finish,
      proj_slot: s.proj_slot,
      band: s.band,
      delta_place: s.delta_place,
      remaining: s.remaining,
    })),
  };
}
