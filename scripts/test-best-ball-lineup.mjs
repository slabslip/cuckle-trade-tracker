#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  optimalLineupFromPoints,
  weekResultsFromScores,
  recordLabel,
  applyResult,
  emptyRecord,
} from "../lib/best-ball-lineup.mjs";
import { buildBestBallHypeBook } from "../lib/best-ball-hype.mjs";

const positions = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN"];
const posById = {
  qb1: "QB", qb2: "QB",
  rb1: "RB", rb2: "RB", rb3: "RB",
  wr1: "WR", wr2: "WR", wr3: "WR",
  te1: "TE", te2: "TE",
};

// Bench QB scores more than starter QB — best ball must take qb2.
const opt = optimalLineupFromPoints({
  qb1: 10, qb2: 25,
  rb1: 12, rb2: 11, rb3: 20,
  wr1: 15, wr2: 14, wr3: 8,
  te1: 9, te2: 18,
}, posById, positions);
assert.equal(opt.starters.find((s) => s.slot === "QB").id, "qb2");
assert.ok(opt.starters.some((s) => s.id === "rb3"), "extra RB can fill FLEX");
assert.ok(opt.starters.some((s) => s.id === "te2"), "hot TE starts");
assert.ok(opt.points > 10 + 12 + 11 + 15 + 14 + 9, "beats naive low lineup");

const rows = [
  { roster_id: 1, matchup_id: 1, points: 100, players_points: { qb1: 20, rb1: 20, rb2: 15, wr1: 20, wr2: 15, te1: 10 } },
  { roster_id: 2, matchup_id: 1, points: 110, players_points: { qb1: 18, rb1: 18, rb2: 14, wr1: 18, wr2: 14, te1: 9 } },
];
const pos = { qb1: "QB", rb1: "RB", rb2: "RB", wr1: "WR", wr2: "WR", te1: "TE" };
const slots = ["QB", "RB", "RB", "WR", "WR", "TE"];
const bb = weekResultsFromScores(rows, (r) => optimalLineupFromPoints(r.players_points, pos, slots).points);
assert.equal(bb.get(1).result, "W", "roster 1 wins on BB even if actual lost");
assert.equal(bb.get(2).result, "L");

const rec = emptyRecord();
applyResult(rec, "W", 100, 90);
applyResult(rec, "L", 80, 95);
assert.equal(recordLabel(rec), "1-1");

const book = buildBestBallHypeBook({
  weeks: [
    {
      week: 1,
      rows: [
        { roster_id: 1, matchup_id: 1, points: 80, players_points: { a: 30, b: 25, c: 20, d: 15, e: 14, f: 12 } },
        { roster_id: 2, matchup_id: 1, points: 100, players_points: { a: 22, b: 20, c: 18, d: 16, e: 14, f: 10 } },
        { roster_id: 3, matchup_id: 2, points: 90, players_points: { a: 28, b: 24, c: 19, d: 15, e: 13, f: 11 } },
        { roster_id: 4, matchup_id: 2, points: 85, players_points: { a: 26, b: 22, c: 18, d: 14, e: 12, f: 10 } },
        { roster_id: 5, matchup_id: 3, points: 95, players_points: { a: 27, b: 23, c: 20, d: 16, e: 14, f: 12 } },
        { roster_id: 6, matchup_id: 3, points: 70, players_points: { a: 20, b: 18, c: 16, d: 12, e: 10, f: 8 } },
        { roster_id: 7, matchup_id: 4, points: 88, players_points: { a: 25, b: 21, c: 18, d: 15, e: 13, f: 11 } },
        { roster_id: 8, matchup_id: 4, points: 92, players_points: { a: 24, b: 22, c: 19, d: 15, e: 14, f: 12 } },
        { roster_id: 9, matchup_id: 5, points: 77, players_points: { a: 23, b: 20, c: 17, d: 13, e: 11, f: 9 } },
        { roster_id: 10, matchup_id: 5, points: 81, players_points: { a: 22, b: 19, c: 16, d: 14, e: 12, f: 10 } },
      ],
    },
  ],
  rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "BN"],
  players: {
    a: { position: "QB" }, b: { position: "RB" }, c: { position: "RB" },
    d: { position: "WR" }, e: { position: "WR" }, f: { position: "TE" },
  },
  ownerByRoster: {
    1: "u1", 2: "u2", 3: "u3", 4: "u4", 5: "u5",
    6: "u6", 7: "u7", 8: "u8", 9: "u9", 10: "u10",
  },
  nameByUser: {
    u1: "A", u2: "B", u3: "C", u4: "D", u5: "E",
    u6: "F", u7: "G", u8: "H", u9: "I", u10: "J",
  },
  season: 2026,
  week: 1,
  leagueId: "x",
});
assert.equal(book.v, 2);
assert.equal(book.seats.length, 10);
assert.ok(book.seats.every((s) => s.record && s.actual_record && Array.isArray(s.weeks)));

const scoredWeekRows = [
  { roster_id: 1, matchup_id: 1, points: 80, players_points: { a: 30, b: 25, c: 20, d: 15, e: 14, f: 12 } },
  { roster_id: 2, matchup_id: 1, points: 100, players_points: { a: 22, b: 20, c: 18, d: 16, e: 14, f: 10 } },
  { roster_id: 3, matchup_id: 2, points: 90, players_points: { a: 28, b: 24, c: 19, d: 15, e: 13, f: 11 } },
  { roster_id: 4, matchup_id: 2, points: 85, players_points: { a: 26, b: 22, c: 18, d: 14, e: 12, f: 10 } },
  { roster_id: 5, matchup_id: 3, points: 95, players_points: { a: 27, b: 23, c: 20, d: 16, e: 14, f: 12 } },
  { roster_id: 6, matchup_id: 3, points: 70, players_points: { a: 20, b: 18, c: 16, d: 12, e: 10, f: 8 } },
  { roster_id: 7, matchup_id: 4, points: 88, players_points: { a: 25, b: 21, c: 18, d: 15, e: 13, f: 11 } },
  { roster_id: 8, matchup_id: 4, points: 92, players_points: { a: 24, b: 22, c: 19, d: 15, e: 14, f: 12 } },
  { roster_id: 9, matchup_id: 5, points: 77, players_points: { a: 23, b: 20, c: 17, d: 13, e: 11, f: 9 } },
  { roster_id: 10, matchup_id: 5, points: 81, players_points: { a: 22, b: 19, c: 16, d: 14, e: 12, f: 10 } },
];

// Future week uses current roster + projections (not the scored-week players_points).
const book2 = buildBestBallHypeBook({
  weeks: [{ week: 1, rows: scoredWeekRows }],
  futureWeeks: [{
    week: 2,
    rows: [
      { roster_id: 1, matchup_id: 1 }, { roster_id: 2, matchup_id: 1 },
      { roster_id: 3, matchup_id: 2 }, { roster_id: 4, matchup_id: 2 },
      { roster_id: 5, matchup_id: 3 }, { roster_id: 6, matchup_id: 3 },
      { roster_id: 7, matchup_id: 4 }, { roster_id: 8, matchup_id: 4 },
      { roster_id: 9, matchup_id: 5 }, { roster_id: 10, matchup_id: 5 },
    ],
  }],
  currentRosters: {
    // Roster 1 traded for stud QB — future BB must use this, not week-1 pool alone.
    1: ["a", "b", "c", "d", "e", "f", "stud"],
    2: ["a", "b", "c", "d", "e", "f"],
    3: ["a", "b", "c", "d", "e", "f"],
    4: ["a", "b", "c", "d", "e", "f"],
    5: ["a", "b", "c", "d", "e", "f"],
    6: ["a", "b", "c", "d", "e", "f"],
    7: ["a", "b", "c", "d", "e", "f"],
    8: ["a", "b", "c", "d", "e", "f"],
    9: ["a", "b", "c", "d", "e", "f"],
    10: ["a", "b", "c", "d", "e", "f"],
  },
  projectionsByWeek: {
    2: {
      a: 20, b: 18, c: 16, d: 14, e: 12, f: 10,
      stud: 40, // new acquisition only on roster 1
    },
  },
  rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "BN"],
  players: {
    a: { position: "QB" }, b: { position: "RB" }, c: { position: "RB" },
    d: { position: "WR" }, e: { position: "WR" }, f: { position: "TE" },
    stud: { position: "QB" },
  },
  ownerByRoster: {
    1: "u1", 2: "u2", 3: "u3", 4: "u4", 5: "u5",
    6: "u6", 7: "u7", 8: "u8", 9: "u9", 10: "u10",
  },
  nameByUser: {
    u1: "A", u2: "B", u3: "C", u4: "D", u5: "E",
    u6: "F", u7: "G", u8: "H", u9: "I", u10: "J",
  },
  season: 2026,
  week: 1,
  projThroughWeek: 2,
  leagueId: "x",
});
assert.equal(book2.v, 2);
assert.equal(book2.proj_through_week, 2);
const seat1 = book2.seats.find((s) => s.roster_id === 1);
assert.ok(seat1.future_weeks.length === 1, "roster 1 has projected W2");
assert.ok(seat1.future_weeks[0].bb > 100, "stud QB lifts future BB score");
assert.ok(seat1.proj_wins >= seat1.wins, "projected record includes future");
assert.equal(seat1.weeks[0].kind, "scored");
assert.equal(seat1.future_weeks[0].kind, "projected");

console.log(JSON.stringify({
  ok: true,
  top: book.seats[0].name,
  record: book.seats[0].record,
  proj: seat1.proj_record,
  future_bb: seat1.future_weeks[0].bb,
}));
