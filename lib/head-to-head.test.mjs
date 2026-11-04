import assert from "node:assert/strict";
import {
  addGame,
  buildHeadToHeadBook,
  ingestWeek,
  orientPair,
  pairKey,
} from "./head-to-head.mjs";

{
  assert.equal(pairKey("b", "a"), "a|b");
  assert.equal(pairKey("a", "b"), "a|b");
}

{
  const pairs = new Map();
  addGame(pairs, { season: "2024", a: "u2", b: "u1", result: "W", pf: 120, pa: 100 });
  addGame(pairs, { season: "2024", a: "u1", b: "u2", result: "W", pf: 110, pa: 90 });
  addGame(pairs, { season: "2023", a: "u1", b: "u2", result: "T", pf: 100, pa: 100 });
  const row = pairs.get("u1|u2");
  assert.ok(row);
  // From u1: loss in first game (u2 won), win in second, tie in third → 1-1-1
  assert.equal(row.w, 1);
  assert.equal(row.l, 1);
  assert.equal(row.t, 1);
  assert.equal(row.games, 3);
  const fromU1 = orientPair(row, "u1");
  assert.equal(fromU1.record, "1-1-1");
  assert.equal(fromU1.w, 1);
  assert.equal(fromU1.l, 1);
  const fromU2 = orientPair(row, "u2");
  assert.equal(fromU2.record, "1-1-1");
  assert.equal(fromU2.w, 1);
  assert.equal(fromU2.l, 1);
  assert.equal(fromU2.by_season[0].season, "2024");
}

{
  const pairs = new Map();
  const rosterToUser = new Map([
    [1, "alice"],
    [2, "bob"],
    [3, "cara"],
    [4, "dan"],
  ]);
  ingestWeek(pairs, [
    { roster_id: 1, matchup_id: 1, points: 130 },
    { roster_id: 2, matchup_id: 1, points: 110 },
    { roster_id: 3, matchup_id: 2, points: 90 },
    { roster_id: 4, matchup_id: 2, points: 90 },
  ], rosterToUser, "2025");
  assert.equal(pairs.size, 2);
  const ab = orientPair(pairs.get(pairKey("alice", "bob")), "alice");
  assert.equal(ab.record, "1-0");
  assert.equal(ab.pf, 130);
  assert.equal(ab.pa, 110);
  const cd = orientPair(pairs.get(pairKey("cara", "dan")), "cara");
  assert.equal(cd.record, "0-0-1");
}

{
  const pairs = new Map();
  addGame(pairs, { season: "2022", a: "x", b: "y", result: "W", pf: 10, pa: 1 });
  const book = buildHeadToHeadBook({
    leagueId: "1",
    asOf: "2026-11-04",
    seats: [{ user_id: "y", name: "Y" }, { user_id: "x", name: "X" }],
    pairsMap: pairs,
  });
  assert.equal(book.v, 1);
  assert.equal(book.n_seats, 2);
  assert.equal(book.n_pairs, 1);
  assert.equal(book.seats[0].name, "X");
  assert.ok(book.pairs["x|y"]);
  assert.equal(book.pairs["x|y"].w, 1);
}

console.log(JSON.stringify({ ok: true, lib: "head-to-head" }));
