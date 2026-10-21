/**
 * In-season projected finish → draft slot → Early / Mid / Late.
 *
 * Not career "Manager avg finish". Not bag-window guesswork alone.
 * Regular-season race + remaining schedule path + late-season arc prior.
 *
 * v2 (movement): banked wins no longer dominate. Expected remaining wins
 * (SoS-aware), relative schedule ease, and historical late climb (season arcs)
 * can reorder seats vs place_now.
 */
import { pickTier } from "../lib.mjs";

/** Bill James–style pythagorean exponent for fantasy PF/PA. */
export const PYTHAG_EXP = 1.8;

/**
 * Score blend (v2). Race is an anchor, not the whole board.
 * - race: current standings + PF
 * - path: expected *remaining* wins (SoS already inside P(win))
 * - ease: remaining schedule easier than league mean
 * - arc: historical late-season climb (avg_climb from season arcs)
 */
export const RACE_WEIGHT = 0.30;
export const PATH_WEIGHT = 0.40;
export const EASE_WEIGHT = 0.15;
export const ARC_WEIGHT = 0.15;

/** @deprecated kept for older callers / SDD footnotes — maps to PATH_WEIGHT. */
export const SOS_WEIGHT = PATH_WEIGHT;
/** Bag blend retired in v2; arcs replace the soft prior. */
export const BAG_WEIGHT = 0;

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
 * @param {object} [opts.bagNowByUser] — unused in v2 (kept for API compat)
 * @param {object} [opts.arcByUser] — user_id → { avg_climb, slow_burn_rate, fast_fade_rate, n }
 */
export function projectFinishBook(opts) {
  const rosters = opts.rosters || [];
  const ownerByRoster = opts.ownerByRoster || {};
  const nameByUser = opts.nameByUser || {};
  const remainingPairs = opts.remainingPairs || [];
  const teams = Number(opts.teams) || rosters.length || 10;
  const arcByUser = opts.arcByUser || {};
  const week = Number(opts.week) || 0;
  const playoffStart = Number(opts.playoffWeekStart) || 15;
  const weeksLeft = Math.max(0, playoffStart - 1 - week);
  const seasonWeeks = Math.max(1, week + weeksLeft);
  // Trust arcs more early; live path more late.
  const arcScale = weeksLeft / seasonWeeks;

  const byRid = new Map();
  for (const r of rosters) {
    const rid = Number(r.roster_id);
    const st = r.settings || {};
    const { pf, pa } = fptsPair(st);
    const wins = Number(st.wins) || 0;
    const losses = Number(st.losses) || 0;
    const ties = Number(st.ties) || 0;
    const uid = ownerByRoster[rid] || r.owner_id || null;
    const pyth = pythagWinPct(pf, pa);
    const arc = (uid != null && arcByUser[String(uid)]) || {};
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
      standings_pts: standingsPts(wins, losses, ties),
      pyth,
      bag_now: null,
      avg_climb: Number(arc.avg_climb) || 0,
      slow_burn_rate: Number(arc.slow_burn_rate) || 0,
      fast_fade_rate: Number(arc.fast_fade_rate) || 0,
      arc_n: Number(arc.n) || 0,
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
    const pA = winProb(A.pyth, B.pyth);
    const pB = 1 - pA;
    A.remaining.push({ opp_roster_id: b, opp: B.name, p_win: Math.round(pA * 1000) / 1000 });
    B.remaining.push({ opp_roster_id: a, opp: A.name, p_win: Math.round(pB * 1000) / 1000 });
    A.expected_remaining_wins += pA;
    B.expected_remaining_wins += pB;
    A.opp_pyth_sum += B.pyth;
    B.opp_pyth_sum += A.pyth;
    A.opp_n += 1;
    B.opp_n += 1;
  }

  const seats = [...byRid.values()];
  for (const s of seats) {
    s.expected_wins = Math.round((s.wins + s.expected_remaining_wins) * 1000) / 1000;
    s.expected_remaining_wins = Math.round(s.expected_remaining_wins * 1000) / 1000;
    s.sos = s.opp_n ? Math.round((s.opp_pyth_sum / s.opp_n) * 1000) / 1000 : 0.5;
    // Easier schedule → higher score (inverse SoS).
    s.sos_ease = Math.round((1 - s.sos) * 1000) / 1000;
  }

  // Current place (race only): standings points, then PF.
  const raceOrder = seats.slice().sort((a, b) =>
    (b.standings_pts - a.standings_pts)
    || (b.pf - a.pf)
    || (a.roster_id - b.roster_id));
  raceOrder.forEach((s, i) => { s.place_now = i + 1; });

  const maxRace = Math.max(1, ...seats.map((s) => s.standings_pts));
  const maxPf = Math.max(1, ...seats.map((s) => s.pf));
  const remWins = seats.map((s) => s.expected_remaining_wins);
  const minRem = Math.min(...remWins);
  const maxRem = Math.max(...remWins);
  const eases = seats.map((s) => s.sos_ease);
  const minEase = Math.min(...eases);
  const maxEase = Math.max(...eases);
  const climbs = seats.map((s) => s.avg_climb);
  const minClimb = Math.min(...climbs);
  const maxClimb = Math.max(...climbs);

  for (const s of seats) {
    const race = 0.7 * (s.standings_pts / maxRace) + 0.3 * (s.pf / maxPf);
    // Path = remaining wins only (SoS inside). Do not re-add banked wins here.
    const path = norm01(s.expected_remaining_wins, minRem, maxRem);
    const ease = norm01(s.sos_ease, minEase, maxEase);
    // Historical late climb, damped by how much season is left.
    const arcRaw = norm01(s.avg_climb, minClimb, maxClimb);
    // Fade history pulls the other way when climb is muted.
    const fadePull = Math.min(1, Math.max(0, s.fast_fade_rate));
    const arc = Math.min(1, Math.max(0, arcRaw * (0.55 + 0.45 * arcScale) - 0.25 * fadePull));
    s.path_score = Math.round(path * 1000) / 1000;
    s.ease_score = Math.round(ease * 1000) / 1000;
    s.arc_score = Math.round(arc * 1000) / 1000;
    s.proj_score = Math.round(
      (RACE_WEIGHT * race
        + PATH_WEIGHT * path
        + EASE_WEIGHT * ease
        + ARC_WEIGHT * arc) * 10000,
    ) / 10000;
  }

  const projOrder = seats.slice().sort((a, b) =>
    (b.proj_score - a.proj_score)
    || (b.expected_wins - a.expected_wins)
    || (b.expected_remaining_wins - a.expected_remaining_wins)
    || (b.pf - a.pf)
    || (a.roster_id - b.roster_id));

  projOrder.forEach((s, i) => {
    s.proj_finish = i + 1;
    s.proj_slot = pickSlotFromFinish(s.proj_finish, teams);
    s.band = pickTier(s.proj_slot, teams);
    s.delta_place = s.place_now - s.proj_finish; // + means climbing (better finish #)
  });

  return {
    v: 2,
    season: Number(opts.season) || null,
    week: Number(opts.week) || null,
    playoff_week_start: Number(opts.playoffWeekStart) || null,
    teams,
    remaining_games: remainingPairs.length,
    rule: {
      race_weight: RACE_WEIGHT,
      path_weight: PATH_WEIGHT,
      ease_weight: EASE_WEIGHT,
      arc_weight: ARC_WEIGHT,
      sos_weight: PATH_WEIGHT,
      bag_weight: BAG_WEIGHT,
      pythag_exp: PYTHAG_EXP,
      arc_scale: Math.round(arcScale * 1000) / 1000,
      note: "v2: remaining path + schedule ease + late-season arcs can move seats vs place now. Regular season only — no playoff bracket sim.",
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
