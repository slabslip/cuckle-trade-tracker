import {
  leagueMedianFromScores,
  medianResult,
  standingPts,
  h2hByRosterFromMatchups,
  buildMedianMonitorBook,
} from "./median-monitor.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

// Sleeper example: 10-team — 5th & 6th highest → avg of two middle when sorted asc.
{
  const scores = [194.44, 186.96, 177.78, 172.22, 153.9, 151.56, 144.76, 138.02, 131.52, 111.56];
  const m = leagueMedianFromScores(scores);
  // middle of sorted: 151.56 + 153.9
  assert(m === 152.73, "even-N median should average two middle scores, got " + m);
  assert(medianResult(153.9, m) === "W", "above median = W");
  assert(medianResult(151.56, m) === "L", "below median = L");
  assert(medianResult(152.73, m) === "T", "exact median = T");
}

assert(standingPts(5, 2, 1) === 11, "W=2 T=1");

{
  const rows = [
    { matchup_id: 1, roster_id: 1, points: 120 },
    { matchup_id: 1, roster_id: 2, points: 110 },
    { matchup_id: 2, roster_id: 3, points: 100 },
    { matchup_id: 2, roster_id: 4, points: 100 },
  ];
  const map = h2hByRosterFromMatchups(rows);
  assert(map.get(1).result === "W", "roster 1 W");
  assert(map.get(2).result === "L", "roster 2 L");
  assert(map.get(3).result === "T", "roster 3 T");
  assert(map.get(4).result === "T", "roster 4 T");
}

{
  const weekly = {
    seasons: [{ season: "2026", league_id: "L1", playoff_week_start: 15 }],
    scores: [
      { season: "2026", week: 1, roster_id: 1, user_id: "a", points: 160, phase: "regular" },
      { season: "2026", week: 1, roster_id: 2, user_id: "b", points: 150, phase: "regular" },
      { season: "2026", week: 1, roster_id: 3, user_id: "c", points: 140, phase: "regular" },
      { season: "2026", week: 1, roster_id: 4, user_id: "d", points: 130, phase: "regular" },
      // playoff week must be ignored
      { season: "2026", week: 15, roster_id: 1, user_id: "a", points: 200, phase: "playoff" },
    ],
  };
  const matchupsByWeek = new Map([
    [1, [
      { matchup_id: 1, roster_id: 1, points: 160 },
      { matchup_id: 1, roster_id: 2, points: 150 },
      { matchup_id: 2, roster_id: 3, points: 140 },
      { matchup_id: 2, roster_id: 4, points: 130 },
    ]],
  ]);
  const nameByUser = new Map([
    ["a", "Alpha"], ["b", "Bravo"], ["c", "Charlie"], ["d", "Delta"],
  ]);
  const book = buildMedianMonitorBook({
    weeklyScores: weekly,
    matchupsByWeek,
    nameByUser,
    season: "2026",
    playoffWeekStart: 15,
    leagueId: "L1",
  });
  assert(book.n === 4, "4 seats");
  assert(book.week_count === 1, "1 RS week");
  assert(book.week_medians[0].median === 145, "median of 4 = avg(140,150)");
  // Alpha: H2H W + median W → 2-0 combined, rank 1
  const alpha = book.seats.find((s) => s.user_id === "a");
  assert(alpha.combined_record === "2-0", "alpha combined " + alpha.combined_record);
  assert(alpha.rank === 1, "alpha #1");
  // Bravo: H2H L + median W → 1-1
  const bravo = book.seats.find((s) => s.user_id === "b");
  assert(bravo.combined_record === "1-1", "bravo combined");
  assert(bravo.median_record === "1-0", "bravo median");
}

console.log(JSON.stringify({ ok: true, lib: "median-monitor" }));
