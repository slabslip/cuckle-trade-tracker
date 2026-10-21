/**
 * Monte Carlo remaining-season + playoff place simulator for Expected finish
 * calibration. Samples weekly scores from each seat's observed distribution
 * (league prior early), plays out remaining H2H, then a 6-team playoff tree.
 *
 * Kept free of imports from projected-finish.mjs to avoid a circular dependency
 * (the book imports week-scaled blend helpers from here).
 */
import { pickTier } from "../lib.mjs";

export const DEFAULT_MC_SIMS = 2500;

function standingsPts(wins, losses, ties) {
  return (Number(wins) || 0) * 2 + (Number(ties) || 0);
}

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const x of arr) s += Number(x) || 0;
  return s / arr.length;
}

function stdev(arr, avg) {
  if (!arr || arr.length < 2) return 0;
  const m = avg != null ? avg : mean(arr);
  let s = 0;
  for (const x of arr) {
    const d = (Number(x) || 0) - m;
    s += d * d;
  }
  return Math.sqrt(s / (arr.length - 1));
}

/**
 * Score model: blend observed weekly points with league prior.
 * Early weeks trust the prior more (W1 almost fully prior).
 */
export function scoreModelFromWeeks(weekPts, leagueMu, leagueSd, week) {
  const pts = (weekPts || []).map((x) => Number(x)).filter((x) => Number.isFinite(x));
  const n = pts.length;
  const obsMu = n ? mean(pts) : leagueMu;
  const obsSd = n >= 2 ? stdev(pts, obsMu) : leagueSd;
  const w = Number(week) || n || 1;
  // Prior weight decays as evidence accumulates.
  const priorW = w <= 1 ? 0.85 : w <= 4 ? 0.55 : w <= 8 ? 0.30 : 0.12;
  const mu = priorW * leagueMu + (1 - priorW) * obsMu;
  const sd = Math.max(12, priorW * leagueSd + (1 - priorW) * (obsSd || leagueSd));
  return { mu, sd, n, priorW };
}

/** Box-Muller normal sample. */
export function sampleNormal(mu, sd, rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(0, mu + sd * z);
}

/**
 * Rank seats for RS place: standings points, then PF, then roster_id.
 * @returns {number[]} roster_ids best→worst
 */
export function rankByRecord(rows) {
  return rows
    .slice()
    .sort((a, b) =>
      (standingsPts(b.wins, b.losses, b.ties) - standingsPts(a.wins, a.losses, a.ties))
      || ((b.pf || 0) - (a.pf || 0))
      || ((a.roster_id || 0) - (b.roster_id || 0)))
    .map((r) => Number(r.roster_id));
}

/**
 * Play one remaining RS slate. Mutates seat map wins/losses/ties/pf/pa.
 */
export function playMatchup(seatA, seatB, ptsA, ptsB) {
  seatA.pf += ptsA;
  seatA.pa += ptsB;
  seatB.pf += ptsB;
  seatB.pa += ptsA;
  if (ptsA > ptsB) {
    seatA.wins += 1;
    seatB.losses += 1;
  } else if (ptsB > ptsA) {
    seatB.wins += 1;
    seatA.losses += 1;
  } else {
    seatA.ties += 1;
    seatB.ties += 1;
  }
}

/**
 * Standard 6-team winners bracket: 1+2 bye, 3v6, 4v5, then semis, final, 3rd.
 * Non-qualifiers take places 7..N by RS order.
 * @returns {Map<number, number>} roster_id → final place
 */
export function simulateSixTeamPlayoffs(rsOrder, models, rng) {
  const place = new Map();
  const n = rsOrder.length;
  if (n < 6) {
    rsOrder.forEach((rid, i) => place.set(rid, i + 1));
    return place;
  }
  const seeds = rsOrder.slice(0, 6);
  const out = rsOrder.slice(6);
  out.forEach((rid, i) => place.set(rid, 7 + i));

  const score = (rid) => {
    const m = models[String(rid)] || models[rid] || { mu: 120, sd: 35 };
    return sampleNormal(m.mu, m.sd, rng);
  };
  const play = (a, b) => (score(a) >= score(b) ? a : b);

  const q1 = play(seeds[2], seeds[5]); // 3 vs 6
  const q2 = play(seeds[3], seeds[4]); // 4 vs 5
  const lq1 = q1 === seeds[2] ? seeds[5] : seeds[2];
  const lq2 = q2 === seeds[3] ? seeds[4] : seeds[3];

  const s1 = play(seeds[0], q1); // 1 vs winner 3/6
  const s2 = play(seeds[1], q2); // 2 vs winner 4/5
  const ls1 = s1 === seeds[0] ? q1 : seeds[0];
  const ls2 = s2 === seeds[1] ? q2 : seeds[1];

  const champ = play(s1, s2);
  const runner = champ === s1 ? s2 : s1;
  const third = play(ls1, ls2);
  const fourth = third === ls1 ? ls2 : ls1;

  // 5th/6th: first-round losers by seed order (higher seed = better place).
  const firstRoundLosers = [lq1, lq2].sort(
    (a, b) => rsOrder.indexOf(a) - rsOrder.indexOf(b),
  );

  place.set(champ, 1);
  place.set(runner, 2);
  place.set(third, 3);
  place.set(fourth, 4);
  place.set(firstRoundLosers[0], 5);
  place.set(firstRoundLosers[1], 6);
  return place;
}

/**
 * Run N Monte Carlo sims from a frozen as-of state.
 * @param {object} opts
 * @param {object} opts.seats — roster_id → { wins, losses, ties, pf, pa, weekPts[] }
 * @param {Array<[number,number]>} opts.remainingPairs
 * @param {number} [opts.nSims=2500]
 * @param {number} [opts.seed=1]
 * @param {number} [opts.week] — as-of week (for prior blend)
 * @param {boolean} [opts.includePlayoffs=true]
 */
export function runMonteCarlo(opts) {
  const nSims = Number(opts.nSims) || DEFAULT_MC_SIMS;
  const rng = mulberry32(opts.seed != null ? opts.seed : 42);
  const seatsIn = opts.seats || {};
  const pairs = opts.remainingPairs || [];
  const week = Number(opts.week) || 1;
  const includePlayoffs = opts.includePlayoffs !== false;
  const rids = Object.keys(seatsIn).map(Number).sort((a, b) => a - b);

  const allPts = [];
  for (const rid of rids) {
    for (const p of (seatsIn[rid].weekPts || seatsIn[String(rid)].weekPts || [])) {
      allPts.push(Number(p) || 0);
    }
  }
  const leagueMu = allPts.length ? mean(allPts) : 130;
  const leagueSd = Math.max(20, allPts.length >= 2 ? stdev(allPts) : 35);

  const models = Object.create(null);
  for (const rid of rids) {
    const row = seatsIn[rid] || seatsIn[String(rid)];
    models[String(rid)] = scoreModelFromWeeks(row.weekPts || [], leagueMu, leagueSd, week);
  }

  const hist = Object.create(null);
  for (const rid of rids) {
    hist[String(rid)] = {
      places: new Array(nSims),
      rs_places: new Array(nSims),
    };
  }

  for (let i = 0; i < nSims; i++) {
    const live = Object.create(null);
    for (const rid of rids) {
      const s = seatsIn[rid] || seatsIn[String(rid)];
      live[rid] = {
        roster_id: rid,
        wins: Number(s.wins) || 0,
        losses: Number(s.losses) || 0,
        ties: Number(s.ties) || 0,
        pf: Number(s.pf) || 0,
        pa: Number(s.pa) || 0,
      };
    }
    for (const pair of pairs) {
      const a = Number(pair[0]);
      const b = Number(pair[1]);
      if (!live[a] || !live[b]) continue;
      const ma = models[String(a)];
      const mb = models[String(b)];
      const ptsA = sampleNormal(ma.mu, ma.sd, rng);
      const ptsB = sampleNormal(mb.mu, mb.sd, rng);
      playMatchup(live[a], live[b], ptsA, ptsB);
    }
    const rsOrder = rankByRecord(rids.map((rid) => live[rid]));
    rsOrder.forEach((rid, idx) => {
      hist[String(rid)].rs_places[i] = idx + 1;
    });
    if (includePlayoffs) {
      const finals = simulateSixTeamPlayoffs(rsOrder, models, rng);
      for (const rid of rids) {
        hist[String(rid)].places[i] = finals.get(rid) || (rsOrder.indexOf(rid) + 1);
      }
    } else {
      for (const rid of rids) {
        hist[String(rid)].places[i] = hist[String(rid)].rs_places[i];
      }
    }
  }

  const summary = Object.create(null);
  for (const rid of rids) {
    const places = hist[String(rid)].places.slice().sort((a, b) => a - b);
    const rsPlaces = hist[String(rid)].rs_places.slice().sort((a, b) => a - b);
    const avg = mean(places);
    const rsAvg = mean(rsPlaces);
    const median = places[Math.floor((places.length - 1) / 2)];
    const p10 = places[Math.floor(0.10 * (places.length - 1))];
    const p90 = places[Math.floor(0.90 * (places.length - 1))];
    let top4 = 0;
    let champ = 0;
    const counts = Object.create(null);
    for (const p of places) {
      counts[p] = (counts[p] || 0) + 1;
      if (p <= 4) top4 += 1;
      if (p === 1) champ += 1;
    }
    summary[String(rid)] = {
      roster_id: rid,
      n_sims: nSims,
      mean_place: Math.round(avg * 1000) / 1000,
      median_place: median,
      p10,
      p90,
      mean_rs_place: Math.round(rsAvg * 1000) / 1000,
      p_top4: Math.round((top4 / nSims) * 1000) / 1000,
      p_champ: Math.round((champ / nSims) * 1000) / 1000,
      place_hist: counts,
      model: models[String(rid)],
    };
  }

  return {
    n_sims: nSims,
    seed: opts.seed != null ? opts.seed : 42,
    league_mu: Math.round(leagueMu * 10) / 10,
    league_sd: Math.round(leagueSd * 10) / 10,
    remaining_games: pairs.length,
    by_roster: summary,
  };
}

/**
 * Week-dependent blend scales derived from multi-season MC calibration.
 * Returns multipliers applied to the v4 weight vector (re-normalized by caller).
 *
 * Empirically: early → trust race+arc more, path/trend less; late → invert.
 */
export function weekBlendScale(week, playoffStart = 15) {
  const w = Number(week) || 1;
  const pws = Number(playoffStart) || 15;
  const remFrac = Math.max(0, Math.min(1, (pws - 1 - w) / Math.max(1, pws - 2)));
  // remFrac≈1 at W1, ≈0 near playoffs.
  return {
    race: 0.85 + 0.35 * remFrac, // early: lean on banked race
    path: 1.25 - 0.55 * remFrac, // late: path dominates
    ease: 1.0,
    arc: 0.70 + 0.70 * remFrac, // career prior matters most early
    form: 0.70 + 0.50 * (1 - remFrac),
    trend: 0.55 + 0.70 * (1 - remFrac),
    rem_frac: Math.round(remFrac * 1000) / 1000,
  };
}

/**
 * Apply weekBlendScale to base weights; returns normalized weights summing to 1.
 */
export function scaledBlendWeights(week, playoffStart, base) {
  const s = weekBlendScale(week, playoffStart);
  const b = base || {};
  const raw = {
    race: (b.race ?? 0.28) * s.race,
    path: (b.path ?? 0.28) * s.path,
    ease: (b.ease ?? 0.10) * s.ease,
    arc: (b.arc ?? 0.10) * s.arc,
    form: (b.form ?? 0.12) * s.form,
    trend: (b.trend ?? 0.12) * s.trend,
  };
  const sum = Object.values(raw).reduce((a, x) => a + x, 0) || 1;
  const out = {};
  for (const k of Object.keys(raw)) {
    out[k] = Math.round((raw[k] / sum) * 1000) / 1000;
  }
  out.rem_frac = s.rem_frac;
  return out;
}

/**
 * How hard to pull proj_finish toward MC mean place.
 * Multi-season calib: MC MAE beats the book more as the season progresses.
 */
export function mcBlendWeight(week, playoffStart = 15) {
  const w = Number(week) || 1;
  const pws = Number(playoffStart) || 15;
  const progressed = Math.max(0, Math.min(1, (w - 1) / Math.max(1, pws - 2)));
  // W1 ~0.20, W6 ~0.40, W12 ~0.62
  return Math.round((0.18 + 0.50 * progressed) * 1000) / 1000;
}

/**
 * Attach MC bands to a projected-finish book and re-rank proj_finish toward
 * MC mean place (week-dependent). Mutates and returns book.
 */
export function attachMonteCarloToBook(book, opts) {
  if (!book || !Array.isArray(book.seats) || !book.seats.length) return book;
  const week = Number(opts.week != null ? opts.week : book.week) || 1;
  const playoffStart = Number(opts.playoffWeekStart != null
    ? opts.playoffWeekStart
    : book.playoff_week_start) || 15;
  const nSims = Number(opts.nSims) || DEFAULT_MC_SIMS;
  const mc = runMonteCarlo({
    seats: opts.seats,
    remainingPairs: opts.remainingPairs || [],
    nSims,
    seed: opts.seed != null ? opts.seed : (Number(book.season) || 1) * 100 + week,
    week,
    includePlayoffs: opts.includePlayoffs !== false,
  });
  const blend = mcBlendWeight(week, playoffStart);
  const teams = Number(book.teams) || book.seats.length;

  for (const s of book.seats) {
    const row = mc.by_roster[String(s.roster_id)];
    if (!row) continue;
    s.mc_mean = row.mean_place;
    s.mc_median = row.median_place;
    s.mc_p10 = row.p10;
    s.mc_p90 = row.p90;
    s.mc_p_top4 = row.p_top4;
    s.mc_p_champ = row.p_champ;
    s.mc_rs_mean = row.mean_rs_place;
    s.mc_n_sims = row.n_sims;
    // Blend book rank with MC mean for final ordering signal.
    s.mc_blend_score = Math.round(
      ((1 - blend) * (teams + 1 - Number(s.proj_finish))
        + blend * (teams + 1 - Number(row.mean_place))) * 1000,
    ) / 1000;
  }

  const ordered = book.seats.slice().sort((a, b) =>
    ((b.mc_blend_score || 0) - (a.mc_blend_score || 0))
    || ((a.mc_mean || 99) - (b.mc_mean || 99))
    || ((b.proj_score || 0) - (a.proj_score || 0))
    || ((a.roster_id || 0) - (b.roster_id || 0)));

  ordered.forEach((s, i) => {
    s.book_finish = s.proj_finish; // preserve pre-MC rank
    s.proj_finish = i + 1;
    s.proj_slot = teams + 1 - s.proj_finish;
    s.band = pickTier(s.proj_slot, teams);
    s.delta_place = s.place_now - s.proj_finish;
  });
  book.seats = ordered;
  book.mc = {
    n_sims: nSims,
    blend_weight: blend,
    league_mu: mc.league_mu,
    league_sd: mc.league_sd,
    remaining_games: mc.remaining_games,
  };
  if (book.rule) {
    book.rule.mc_blend_weight = blend;
    book.rule.mc_n_sims = nSims;
    book.rule.note = (book.rule.note || "")
      + " MC mean blended into proj_finish; p10–p90 bands on seats.";
  }
  book.v = Math.max(Number(book.v) || 5, 5);
  return book;
}
