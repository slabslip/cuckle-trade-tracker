import assert from "node:assert/strict";
import {
  pythagWinPct,
  winProb,
  pickSlotFromFinish,
  projectFinishBook,
  formAdjPyth,
  weekFormWeight,
  summarizeFormByRoster,
  scoreFormLeague,
  summarizeScoringTrend,
  scoreTrendLeague,
  summarizeHeatByRoster,
  scoreHeatLeague,
  RACE_WEIGHT,
  PATH_WEIGHT,
  ARC_WEIGHT,
  FORM_WEIGHT,
  TREND_WEIGHT,
  EARLY_WEEK_CUTOFF,
} from "./lib/projected-finish.mjs";
import {
  runMonteCarlo,
  scoreModelFromWeeks,
  scaledBlendWeights,
  weekBlendScale,
  attachMonteCarloToBook,
  mcBlendWeight,
  mcSeatBlendWeight,
  bestBallScoreMu,
  simulateLosersBracketBestBall,
  mulberry32,
  BEST_BALL_LIFT,
  DEFAULT_MC_SIMS,
} from "./lib/projected-finish-mc.mjs";


assert.ok(pythagWinPct(1000, 800) > 0.5);
assert.ok(pythagWinPct(800, 1000) < 0.5);
assert.equal(Math.round(winProb(0.6, 0.4) * 100), 60);
assert.equal(pickSlotFromFinish(10, 10), 1);
assert.equal(pickSlotFromFinish(1, 10), 10);
assert.equal(pickSlotFromFinish(5, 10), 6);
assert.ok(PATH_WEIGHT >= 0.25);
assert.ok(ARC_WEIGHT >= 0.08);
assert.ok(FORM_WEIGHT >= 0.1);
assert.ok(TREND_WEIGHT >= 0.10);
assert.ok(TREND_WEIGHT <= RACE_WEIGHT);
assert.equal(EARLY_WEEK_CUTOFF, 4);
assert.ok(weekFormWeight(1) < weekFormWeight(5));
assert.ok(weekFormWeight(3) < weekFormWeight(12));
assert.ok(formAdjPyth(0.5, 1.5, 1.5, 1.5) > 0.5);
assert.ok(formAdjPyth(0.5, -1.5, -1.5, -1.5) < 0.5);

const book = projectFinishBook({
  rosters: [
    { roster_id: 1, owner_id: "a", settings: { wins: 5, losses: 1, fpts: 1000, fpts_against: 800 } },
    { roster_id: 2, owner_id: "b", settings: { wins: 1, losses: 5, fpts: 700, fpts_against: 900 } },
  ],
  ownerByRoster: { 1: "a", 2: "b" },
  nameByUser: { a: "Alpha", b: "Beta" },
  remainingPairs: [[1, 2], [1, 2]],
  teams: 2,
  season: 2026,
  week: 6,
  playoffWeekStart: 15,
});

assert.ok(book.v >= 5);
assert.equal(book.seats[0].name, "Alpha");
assert.equal(book.seats[0].proj_finish, 1);
assert.equal(book.seats[0].proj_slot, 2);
assert.equal(book.seats[1].proj_finish, 2);
assert.equal(book.seats[1].proj_slot, 1);
assert.equal(book.seats[1].band, "Early");
assert.ok(book.seats[0].expected_wins > book.seats[1].expected_wins);

// Soft board: same record, but Beta has the easy remaining slate + climb history.
const movers = projectFinishBook({
  rosters: [
    {
      roster_id: 1,
      owner_id: "lead",
      settings: { wins: 3, losses: 3, fpts: 900, fpts_against: 880, fpts_decimal: 0 },
    },
    {
      roster_id: 2,
      owner_id: "chase",
      settings: { wins: 3, losses: 3, fpts: 860, fpts_against: 900, fpts_decimal: 0 },
    },
    {
      roster_id: 3,
      owner_id: "tank",
      settings: { wins: 1, losses: 5, fpts: 700, fpts_against: 950, fpts_decimal: 0 },
    },
  ],
  ownerByRoster: { 1: "lead", 2: "chase", 3: "tank" },
  nameByUser: { lead: "LeadNow", chase: "ChaseArc", tank: "TankSoft" },
  remainingPairs: [
    [1, 2],
    [1, 2],
    [2, 3],
    [2, 3],
    [1, 3],
    [1, 3],
  ],
  teams: 3,
  season: 2026,
  week: 6,
  playoffWeekStart: 15,
  arcByUser: {
    lead: { avg_climb: -2, fast_fade_rate: 0.5, slow_burn_rate: 0, n: 6 },
    chase: { avg_climb: 2, fast_fade_rate: 0, slow_burn_rate: 0.4, n: 6 },
    tank: { avg_climb: 0, fast_fade_rate: 0, slow_burn_rate: 0, n: 6 },
  },
});

const byName = Object.fromEntries(movers.seats.map((s) => [s.name, s]));
assert.equal(byName.LeadNow.place_now, 1, "Lead owns place now on PF");
assert.ok(
  byName.ChaseArc.proj_finish < byName.LeadNow.proj_finish,
  "ChaseArc should project ahead of LeadNow on path+ease+arc",
);
assert.ok(byName.ChaseArc.delta_place > 0, "ChaseArc climbs vs place now");
assert.ok(movers.seats.some((s) => s.delta_place !== 0), "book must move at least one seat");

// Form: same race + slate, but Over clears proj every week and Under misses.
const formRows = scoreFormLeague(summarizeFormByRoster({
  1: [
    { week: 1, actual: 120, proj: 100, delta: 20 },
    { week: 2, actual: 125, proj: 100, delta: 25 },
    { week: 3, actual: 130, proj: 105, delta: 25 },
    { week: 4, actual: 128, proj: 102, delta: 26 },
  ],
  2: [
    { week: 1, actual: 90, proj: 110, delta: -20 },
    { week: 2, actual: 88, proj: 112, delta: -24 },
    { week: 3, actual: 85, proj: 108, delta: -23 },
    { week: 4, actual: 92, proj: 115, delta: -23 },
  ],
}));
assert.ok(formRows["1"].form_delta > 0);
assert.ok(formRows["2"].form_delta < 0);

const formBook = projectFinishBook({
  rosters: [
    {
      roster_id: 1,
      owner_id: "over",
      settings: { wins: 3, losses: 3, fpts: 900, fpts_against: 900 },
    },
    {
      roster_id: 2,
      owner_id: "under",
      settings: { wins: 3, losses: 3, fpts: 900, fpts_against: 900 },
    },
  ],
  ownerByRoster: { 1: "over", 2: "under" },
  nameByUser: { over: "OverProj", under: "UnderProj" },
  remainingPairs: [[1, 2], [1, 2], [1, 2], [1, 2]],
  teams: 2,
  season: 2026,
  week: 4,
  playoffWeekStart: 15,
  formByRoster: formRows,
});
const formBy = Object.fromEntries(formBook.seats.map((s) => [s.name, s]));
assert.ok(formBy.OverProj.proj_finish < formBy.UnderProj.proj_finish, "over-proj seat ranks ahead");
assert.ok(
  formBy.OverProj.expected_remaining_wins > formBy.UnderProj.expected_remaining_wins,
  "over-proj seat gets better remaining leans",
);
assert.ok(formBy.OverProj.remaining[0].p_win > 0.55, "matchup lean must credit form");

// Trend: HotStart fades after week 4; LateRise surges — late trend should win.
const trendRows = scoreTrendLeague(summarizeScoringTrend({
  1: [
    { week: 1, points: 180 }, { week: 2, points: 175 }, { week: 3, points: 170 },
    { week: 4, points: 165 }, { week: 5, points: 120 }, { week: 6, points: 115 },
  ],
  2: [
    { week: 1, points: 110 }, { week: 2, points: 115 }, { week: 3, points: 120 },
    { week: 4, points: 125 }, { week: 5, points: 170 }, { week: 6, points: 175 },
  ],
}));
assert.ok(trendRows["2"].trend_delta > trendRows["1"].trend_delta, "LateRise has better trend_delta");

const trendBook = projectFinishBook({
  rosters: [
    {
      roster_id: 1,
      owner_id: "hot",
      settings: { wins: 4, losses: 2, fpts: 925, fpts_against: 880 },
    },
    {
      roster_id: 2,
      owner_id: "rise",
      settings: { wins: 3, losses: 3, fpts: 815, fpts_against: 900 },
    },
  ],
  ownerByRoster: { 1: "hot", 2: "rise" },
  nameByUser: { hot: "HotStart", rise: "LateRise" },
  remainingPairs: [[1, 2], [1, 2], [1, 2], [1, 2], [1, 2], [1, 2]],
  teams: 2,
  season: 2026,
  week: 6,
  playoffWeekStart: 15,
  trendByRoster: trendRows,
  arcByUser: {
    hot: { avg_climb: -1, fast_fade_rate: 0.4, slow_burn_rate: 0, n: 5 },
    rise: { avg_climb: 1.5, fast_fade_rate: 0, slow_burn_rate: 0.5, n: 5 },
  },
});
const trendBy = Object.fromEntries(trendBook.seats.map((s) => [s.name, s]));
assert.equal(trendBy.HotStart.place_now, 1, "HotStart leads place now");
assert.ok(
  trendBy.LateRise.proj_finish < trendBy.HotStart.proj_finish,
  "LateRise projects ahead once early weeks are soft + trend applied",
);
assert.ok(trendBy.LateRise.trend_delta > 0);
assert.ok(trendBy.HotStart.trend_delta < 0);

// Form slope: improving residual late should beat flattening early over-score.
assert.ok(Number.isFinite(formRows["1"].form_slope));

// Heat: deal-makers / FA scrapers get a trend nudge (2025 W6 retro).
const heatRaw = summarizeHeatByRoster({
  trades: [
    { season: 2026, week: 5, user_ids: ["deal"] },
    { season: 2026, week: 6, user_ids: ["deal"] },
  ],
  moves: [
    { season: 2026, week: 5, type: "free_agent", roster_ids: [1], adds: { "1": 1 } },
    { season: 2026, week: 6, type: "waiver", roster_ids: [1], adds: { "2": 1 } },
    { season: 2026, week: 6, type: "free_agent", roster_ids: [1], adds: { "3": 1 } },
  ],
  ownerByRoster: { 1: "deal", 2: "quiet" },
  season: 2026,
  week: 6,
  window: 3,
});
// Quiet seat must be present so league z/score has a floor (single-seat → 0.5).
heatRaw["2"] = { trade_n: 0, fa_n: 0, heat: 0 };
const heatRows = scoreHeatLeague(heatRaw);
assert.ok(heatRows["1"].heat > heatRows["2"].heat);
assert.ok((heatRows["1"].trade_n || 0) >= 2);
assert.ok((heatRows["1"].fa_n || 0) >= 3);
assert.ok(heatRows["1"].heat_score > heatRows["2"].heat_score);

const heatBook = projectFinishBook({
  rosters: [
    {
      roster_id: 1,
      owner_id: "deal",
      settings: { wins: 3, losses: 3, fpts: 880, fpts_against: 900 },
    },
    {
      roster_id: 2,
      owner_id: "quiet",
      settings: { wins: 3, losses: 3, fpts: 900, fpts_against: 880 },
    },
  ],
  ownerByRoster: { 1: "deal", 2: "quiet" },
  nameByUser: { deal: "DealMaker", quiet: "QuietBag" },
  remainingPairs: [[1, 2], [1, 2], [1, 2], [1, 2], [1, 2], [1, 2]],
  teams: 2,
  season: 2026,
  week: 6,
  playoffWeekStart: 15,
  heatByRoster: heatRows,
});
const heatBy = Object.fromEntries(heatBook.seats.map((s) => [s.name, s]));
assert.ok(heatBy.DealMaker.heat != null && heatBy.DealMaker.heat > 0);
assert.equal(heatBy.QuietBag.trade_n, 0);
assert.ok(
  heatBy.DealMaker.trend_score > heatBy.QuietBag.trend_score,
  "heat should lift DealMaker trend_score vs quiet seat",
);

console.log("projected-finish.test.mjs ok", {
  lead: byName.LeadNow.proj_finish,
  chase: byName.ChaseArc.proj_finish,
  formLean: formBy.OverProj.remaining[0].p_win,
  trend: {
    hot: trendBy.HotStart.proj_finish,
    rise: trendBy.LateRise.proj_finish,
    deltas: [trendBy.HotStart.trend_delta, trendBy.LateRise.trend_delta],
  },
  heat: {
    deal: heatBy.DealMaker.heat,
    dealTrend: heatBy.DealMaker.trend_score,
    quietTrend: heatBy.QuietBag.trend_score,
  },
});
assert.equal(DEFAULT_MC_SIMS, 2500);
assert.ok(weekBlendScale(1, 15).arc > weekBlendScale(12, 15).arc);
assert.ok(weekBlendScale(12, 15).path > weekBlendScale(1, 15).path);
const w1 = scaledBlendWeights(1, 15);
const w12 = scaledBlendWeights(12, 15);
assert.ok(w1.arc > w12.arc, "early weeks overweight arc");
assert.ok(w12.path > w1.path, "late weeks overweight path");
const sumW = w1.race + w1.path + w1.ease + w1.arc + w1.form + w1.trend;
assert.ok(Math.abs(sumW - 1) < 0.02, "scaled weights ~1");

const model = scoreModelFromWeeks([100, 110, 120], 130, 35, 3);
assert.ok(model.mu > 100 && model.mu < 130);

const mc = runMonteCarlo({
  seats: {
    1: { wins: 5, losses: 1, ties: 0, pf: 900, pa: 700, weekPts: [140, 150, 160, 155, 145, 150] },
    2: { wins: 1, losses: 5, ties: 0, pf: 600, pa: 900, weekPts: [90, 95, 100, 85, 88, 92] },
  },
  remainingPairs: [[1, 2], [1, 2], [1, 2], [1, 2]],
  nSims: 400,
  seed: 7,
  week: 6,
});
assert.ok(mc.by_roster["1"].mean_place < mc.by_roster["2"].mean_place);
assert.ok(mc.by_roster["1"].p_top4 > 0.5);
assert.ok(mcBlendWeight(12, 15) > mcBlendWeight(1, 15));
// W6+ disagree≥2 ramps seat blend toward MC (calib playbook).
assert.ok(mcSeatBlendWeight(7, 15, 9, 2.8) > mcBlendWeight(7, 15));
assert.ok(mcSeatBlendWeight(7, 15, 9, 2.8) >= 0.8);
assert.equal(mcSeatBlendWeight(7, 15, 4, 4.2), mcBlendWeight(7, 15));
assert.equal(mcSeatBlendWeight(3, 15, 9, 2.8), mcBlendWeight(3, 15));

const mcBook = attachMonteCarloToBook(
  projectFinishBook({
    rosters: [
      { roster_id: 1, owner_id: "a", settings: { wins: 5, losses: 1, fpts: 900, fpts_against: 700 } },
      { roster_id: 2, owner_id: "b", settings: { wins: 1, losses: 5, fpts: 600, fpts_against: 900 } },
    ],
    ownerByRoster: { 1: "a", 2: "b" },
    nameByUser: { a: "Alpha", b: "Beta" },
    remainingPairs: [[1, 2], [1, 2], [1, 2], [1, 2]],
    teams: 2,
    season: 2026,
    week: 6,
    playoffWeekStart: 15,
  }),
  {
    seats: {
      1: { wins: 5, losses: 1, ties: 0, pf: 900, pa: 700, weekPts: [140, 150, 160, 155, 145, 150] },
      2: { wins: 1, losses: 5, ties: 0, pf: 600, pa: 900, weekPts: [90, 95, 100, 85, 88, 92] },
    },
    remainingPairs: [[1, 2], [1, 2], [1, 2], [1, 2]],
    week: 6,
    playoffWeekStart: 15,
    nSims: 400,
    seed: 9,
  },
);
assert.ok(mcBook.mc && mcBook.mc.n_sims === 400);
assert.ok(mcBook.seats[0].mc_mean != null);
assert.ok(mcBook.seats[0].mc_p10 <= mcBook.seats[0].mc_p90);
assert.equal(mcBook.seats[0].name, "Alpha");

console.log("mc smoke", {
  lead: mc.by_roster["1"].mean_place,
  trail: mc.by_roster["2"].mean_place,
  w1arc: w1.arc,
  w12path: w12.path,
  blend: mcBook.mc.blend_weight,
});

// Race intent: same talent, but Tanker must not project ahead of Hunter on path.
const intentBook = projectFinishBook({
  rosters: [
    {
      roster_id: 1,
      owner_id: "tank",
      settings: { wins: 4, losses: 3, fpts: 900, fpts_against: 880 },
    },
    {
      roster_id: 2,
      owner_id: "hunt",
      settings: { wins: 3, losses: 4, fpts: 860, fpts_against: 900 },
    },
  ],
  ownerByRoster: { 1: "tank", 2: "hunt" },
  nameByUser: { tank: "TankSeat", hunt: "HuntSeat" },
  remainingPairs: [[1, 2], [1, 2], [1, 2], [1, 2], [1, 2], [1, 2], [1, 2]],
  teams: 2,
  season: 2026,
  week: 7,
  playoffWeekStart: 15,
  raceIntent: { by_name: { TankSeat: "tank", HuntSeat: "playoff_hunt" } },
});
const intentBy = Object.fromEntries(intentBook.seats.map((s) => [s.name, s]));
assert.equal(intentBy.TankSeat.race_intent, "tank");
assert.equal(intentBy.HuntSeat.race_intent, "playoff_hunt");
assert.ok(
  intentBy.HuntSeat.expected_remaining_wins > intentBy.TankSeat.expected_remaining_wins,
  "playoff hunter must get more remaining wins than equal-talent tanker",
);
assert.ok(
  intentBy.HuntSeat.proj_finish < intentBy.TankSeat.proj_finish,
  "playoff hunter should project ahead of tanker",
);
assert.equal(intentBook.v, 6);

// Best-ball losers bracket: tank effort must not apply; strong roster can climb
// out of RS last among non-qualifiers.
assert.ok(BEST_BALL_LIFT > 1);
assert.ok(bestBallScoreMu(100, 130) > 100);
assert.ok(bestBallScoreMu(100, 130) > bestBallScoreMu(100, 130, 1.0));

{
  // Talent tank (high mu_full, dampened RS mu) vs weak contend — RS order puts
  // tank last, but best-ball should usually give tank the better consolation place.
  let tankWins7th = 0;
  const n = 400;
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(1000 + i);
    const models = {
      1: { mu: 90, mu_full: 150, mu_bb: bestBallScoreMu(150, 130), sd: 20, league_mu: 130 },
      2: { mu: 110, mu_full: 110, mu_bb: bestBallScoreMu(110, 130), sd: 20, league_mu: 130 },
      3: { mu: 105, mu_full: 105, mu_bb: bestBallScoreMu(105, 130), sd: 20, league_mu: 130 },
      4: { mu: 100, mu_full: 100, mu_bb: bestBallScoreMu(100, 130), sd: 20, league_mu: 130 },
    };
    // RS order among non-qualifiers: weak seats ahead of talent tank (id 1 last).
    const places = simulateLosersBracketBestBall([2, 3, 4, 1], models, rng);
    if (places.get(1) === 7) tankWins7th += 1;
  }
  assert.ok(
    tankWins7th > n * 0.45,
    "best-ball losers bracket must often promote talent tank over weak RS seats: " + tankWins7th,
  );
}

{
  // Full MC: tank effort on RS games, but losers BB uses mu_bb — mean place for a
  // high-talent tank who misses playoffs should beat pure RS-last locking.
  const mcBb = runMonteCarlo({
    seats: {
      1: { wins: 5, losses: 1, ties: 0, pf: 900, pa: 700, weekPts: [150, 155, 160, 145, 150, 148] },
      2: { wins: 4, losses: 2, ties: 0, pf: 850, pa: 750, weekPts: [140, 142, 138, 145, 141, 139] },
      3: { wins: 4, losses: 2, ties: 0, pf: 840, pa: 760, weekPts: [138, 140, 136, 142, 137, 135] },
      4: { wins: 3, losses: 3, ties: 0, pf: 800, pa: 800, weekPts: [130, 132, 128, 131, 129, 127] },
      5: { wins: 3, losses: 3, ties: 0, pf: 790, pa: 810, weekPts: [128, 126, 130, 125, 127, 124] },
      6: { wins: 2, losses: 4, ties: 0, pf: 750, pa: 850, weekPts: [120, 118, 122, 119, 121, 117] },
      // Talent tank: strong weekly pts but tank effort + bad record → often misses playoffs.
      7: { wins: 1, losses: 5, ties: 0, pf: 880, pa: 900, weekPts: [155, 160, 158, 162, 157, 159] },
      8: { wins: 1, losses: 5, ties: 0, pf: 620, pa: 900, weekPts: [95, 90, 92, 88, 91, 89] },
      9: { wins: 1, losses: 5, ties: 0, pf: 610, pa: 910, weekPts: [93, 88, 90, 86, 89, 87] },
      10: { wins: 0, losses: 6, ties: 0, pf: 580, pa: 950, weekPts: [85, 80, 82, 78, 81, 79] },
    },
    remainingPairs: [
      [7, 8], [7, 9], [7, 10], [8, 9], [8, 10], [9, 10],
      [1, 7], [2, 8], [3, 9], [4, 10], [5, 6],
    ],
    nSims: 800,
    seed: 42,
    week: 7,
    effortByRoster: {
      7: 0.62, // tank
      8: 1, 9: 1, 10: 1,
      1: 1.08, 2: 1.08, 3: 1, 4: 1, 5: 1, 6: 1,
    },
  });
  assert.ok(mcBb.by_roster["7"].model.mu_bb > mcBb.by_roster["7"].model.mu);
  assert.ok(mcBb.by_roster["7"].model.mu_bb > mcBb.by_roster["8"].model.mu_bb);
  // Talent tank's final mean should beat the weak #10 seat's mean.
  assert.ok(
    mcBb.by_roster["7"].mean_place < mcBb.by_roster["10"].mean_place,
    "talent tank must outrank empty roster after best-ball losers bracket",
  );
}
