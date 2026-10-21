/**
 * In-season projected finish → draft slot → Early / Mid / Late.
 *
 * Not career "Manager avg finish". Not bag-window guesswork alone.
 * Regular-season race + remaining schedule strength + a light bag blend.
 */
import { pickTier } from "../lib.mjs";

/** Bill James–style pythagorean exponent for fantasy PF/PA. */
export const PYTHAG_EXP = 1.8;

/** How much current race (standings points + PF) vs SoS rest-of-way drives the rank. */
export const RACE_WEIGHT = 0.55;
export const SOS_WEIGHT = 0.35;
/** Analyzer / bag "now" score when present (0–10). Zero if missing. */
export const BAG_WEIGHT = 0.10;

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
 * @param {object} [opts.bagNowByUser] — user_id → 0..10 analyzer now score
 */
export function projectFinishBook(opts) {
  const rosters = opts.rosters || [];
  const ownerByRoster = opts.ownerByRoster || {};
  const nameByUser = opts.nameByUser || {};
  const remainingPairs = opts.remainingPairs || [];
  const teams = Number(opts.teams) || rosters.length || 10;
  const bagNowByUser = opts.bagNowByUser || {};

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
      bag_now: uid != null && bagNowByUser[uid] != null
        ? Number(bagNowByUser[uid])
        : null,
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
  const maxExp = Math.max(1, ...seats.map((s) => s.expected_wins));

  for (const s of seats) {
    const race = 0.7 * (s.standings_pts / maxRace) + 0.3 * (s.pf / maxPf);
    const sosPart = s.expected_wins / maxExp;
    const bag = s.bag_now == null ? race : Math.min(1, Math.max(0, s.bag_now / 10));
    s.proj_score = Math.round(
      (RACE_WEIGHT * race + SOS_WEIGHT * sosPart + BAG_WEIGHT * bag) * 10000,
    ) / 10000;
  }

  const projOrder = seats.slice().sort((a, b) =>
    (b.proj_score - a.proj_score)
    || (b.expected_wins - a.expected_wins)
    || (b.pf - a.pf)
    || (a.roster_id - b.roster_id));

  projOrder.forEach((s, i) => {
    s.proj_finish = i + 1;
    s.proj_slot = pickSlotFromFinish(s.proj_finish, teams);
    s.band = pickTier(s.proj_slot, teams);
    s.delta_place = s.place_now - s.proj_finish; // + means climbing (better finish #)
  });

  return {
    v: 1,
    season: Number(opts.season) || null,
    week: Number(opts.week) || null,
    playoff_week_start: Number(opts.playoffWeekStart) || null,
    teams,
    remaining_games: remainingPairs.length,
    rule: {
      race_weight: RACE_WEIGHT,
      sos_weight: SOS_WEIGHT,
      bag_weight: BAG_WEIGHT,
      pythag_exp: PYTHAG_EXP,
      note: "Regular-season projected finish. Last place → 1.01 band; title → late. Does not simulate the playoff bracket.",
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
      expected_remaining_wins: Math.round(s.expected_remaining_wins * 1000) / 1000,
      expected_wins: s.expected_wins,
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
