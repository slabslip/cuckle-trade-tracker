import test from "node:test";
import assert from "node:assert/strict";
import {
  gamesFromMatchupRows,
  yearImpactForSeat,
  rankClosestGames,
  buildClosestGamesBook,
  indexArcsBySeason,
  CLOSEST_GAMES_TOP_N,
} from "./closest-games.mjs";

test("gamesFromMatchupRows pairs by matchup_id and computes margin", () => {
  const rosterToUser = new Map([[1, "u1"], [2, "u2"], [3, "u3"], [4, "u4"]]);
  const nameByUser = new Map([["u1", "Alpha"], ["u2", "Beta"], ["u3", "Gamma"], ["u4", "Delta"]]);
  const games = gamesFromMatchupRows([
    { matchup_id: 1, roster_id: 1, points: 100.05 },
    { matchup_id: 1, roster_id: 2, points: 100.0 },
    { matchup_id: 2, roster_id: 3, points: 140 },
    { matchup_id: 2, roster_id: 4, points: 110 },
    { matchup_id: 3, roster_id: 1, points: 0 },
    { matchup_id: 3, roster_id: 2, points: 0 },
  ], {
    season: "2024",
    week: 7,
    phase: "regular",
    rosterToUser,
    nameByUser,
  });
  assert.equal(games.length, 2); // 0-0 skipped
  const nail = games.find((g) => g.margin === 0.05);
  assert.ok(nail);
  assert.equal(nail.a.name, "Alpha");
  assert.equal(nail.b.name, "Beta");
  assert.equal(nail.a.result, "W");
  assert.equal(nail.b.result, "L");
  assert.equal(nail.season, "2024");
  assert.equal(nail.week, 7);
});

test("rankClosestGames keeps smallest margins first, top N", () => {
  const ranked = rankClosestGames([
    { key: "a", margin: 12, season: "2020", week: 1 },
    { key: "b", margin: 0.1, season: "2021", week: 3 },
    { key: "c", margin: 0, season: "2022", week: 5 },
    { key: "d", margin: 3, season: "2019", week: 2 },
  ], 3);
  assert.equal(ranked.length, 3);
  assert.deepEqual(ranked.map((g) => g.key), ["c", "b", "d"]);
  assert.equal(ranked[0].rank, 1);
  assert.equal(CLOSEST_GAMES_TOP_N, 10);
});

test("yearImpactForSeat tells the week result and year path", () => {
  const arcs = indexArcsBySeason({
    seasons: [{
      season: "2023",
      seats: [{
        user_id: "u1",
        name: "Alpha",
        place_w4: 4,
        place_w8: 2,
        place_final: 1,
        made_playoffs: true,
        arc: "slow_burn",
      }],
    }],
  });
  const game = {
    season: "2023",
    week: 8,
    phase: "regular",
    a: { user_id: "u1", name: "Alpha", points: 112.2, result: "W" },
    b: { user_id: "u2", name: "Beta", points: 111.9, result: "L" },
  };
  const impact = yearImpactForSeat(game.a, game, arcs, new Map());
  assert.equal(impact.place_final, 1);
  assert.equal(impact.made_playoffs, true);
  assert.match(impact.thesis, /Won 112\.2–111\.9 in W8/);
  assert.match(impact.thesis, /finished #1/);
  assert.match(impact.thesis, /made playoffs/);
  assert.match(impact.thesis, /slow burn/);
});

test("buildClosestGamesBook attaches years and caps at 10", () => {
  const games = [];
  for (let i = 0; i < 15; i++) {
    games.push({
      key: `g${i}`,
      season: "2024",
      week: i + 1,
      phase: "regular",
      margin: i * 0.5,
      a: { user_id: "u1", name: "A", points: 100 + i, result: "W" },
      b: { user_id: "u2", name: "B", points: 100, result: "L" },
    });
  }
  const book = buildClosestGamesBook({
    games,
    leagueId: "L1",
    asOf: "2026-11-09",
    arcsBook: {
      seasons: [{
        season: "2024",
        seats: [
          { user_id: "u1", place_final: 2, place_w4: 3, place_w8: 2, made_playoffs: true, arc: "steady" },
          { user_id: "u2", place_final: 8, place_w4: 5, place_w8: 7, made_playoffs: false, arc: "fast_fade" },
        ],
      }],
    },
    standings: [{
      season: "2024",
      rows: [
        { user_id: "u1", wins: 10, losses: 4, ties: 0, fpts: 2000, place: 2 },
        { user_id: "u2", wins: 5, losses: 9, ties: 0, fpts: 1600, place: 8 },
      ],
    }],
  });
  assert.equal(book.v, 1);
  assert.equal(book.games.length, 10);
  assert.equal(book.games[0].margin, 0);
  assert.equal(book.games[0].years.length, 2);
  assert.ok(book.games[0].years[0].thesis);
  assert.equal(book.n_games, 15);
});
