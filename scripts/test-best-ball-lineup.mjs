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

const opt = optimalLineupFromPoints({
  qb1: 10, qb2: 25,
  rb1: 12, rb2: 11, rb3: 20,
  wr1: 15, wr2: 14, wr3: 8,
  te1: 9, te2: 18,
}, posById, positions);
assert.equal(opt.starters.find((s) => s.slot === "QB").id, "qb2");
assert.ok(opt.starters.some((s) => s.id === "rb3"), "extra RB can fill FLEX");
assert.ok(opt.starters.some((s) => s.id === "te2"), "hot TE starts");

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

function tenWeekRows(ptsByRid) {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rid, i) => {
    const opp = rid % 2 === 1 ? rid + 1 : rid - 1;
    const mid = Math.ceil(rid / 2);
    return {
      roster_id: rid,
      matchup_id: mid,
      points: ptsByRid[rid],
      players_points: {
        a: ptsByRid[rid] * 0.3,
        b: ptsByRid[rid] * 0.25,
        c: ptsByRid[rid] * 0.2,
        d: ptsByRid[rid] * 0.1,
        e: ptsByRid[rid] * 0.1,
        f: ptsByRid[rid] * 0.05,
      },
      _opp: opp,
    };
  });
}

const scoredPts = {
  1: 120, 2: 100, 3: 115, 4: 90, 5: 110,
  6: 95, 7: 85, 8: 80, 9: 70, 10: 60,
};

const ownerByRoster = {
  1: "u1", 2: "u2", 3: "u3", 4: "u4", 5: "u5",
  6: "u6", 7: "u7", 8: "u8", 9: "u9", 10: "u10",
};
const nameByUser = {
  u1: "A", u2: "B", u3: "C", u4: "D", u5: "E",
  u6: "F", u7: "G", u8: "H", u9: "I", u10: "J",
};
const players = {
  a: { position: "QB" }, b: { position: "RB" }, c: { position: "RB" },
  d: { position: "WR" }, e: { position: "WR" }, f: { position: "TE" },
  g: { position: "WR" },
};
const rosterPositions = ["QB", "RB", "RB", "WR", "WR", "TE", "BN"];
const currentRosters = {};
const currentStarters = {};
for (let rid = 1; rid <= 10; rid++) {
  currentRosters[rid] = ["a", "b", "c", "d", "e", "f"];
  currentStarters[rid] = ["a", "b", "c", "d", "e", "f"];
}
// Toilet seed 10 gets a stud only usable in best ball flex/QB pool via full roster
currentRosters[10] = ["a", "b", "c", "d", "e", "f", "stud"];
players.stud = { position: "QB" };

const projectionsByWeek = {};
for (let w = 2; w <= 17; w++) {
  const proj = {
    a: 18, b: 14, c: 12, d: 11, e: 10, f: 8, stud: 0,
  };
  // Stronger set lineups for higher seeds in RS weeks
  projectionsByWeek[w] = { ...proj };
}

// Bias remaining RS so seeds stay roughly 1..10 by strength
function biasWeek(w) {
  const base = {
    a: 18, b: 14, c: 12, d: 11, e: 10, f: 8, stud: 0,
  };
  // Per-roster overlay via starter strength — handled by set lineup sum; instead
  // leave flat and use different starter pools.
  return base;
}
for (let w = 2; w <= 17; w++) projectionsByWeek[w] = biasWeek(w);

// Give seeds different set strength via starter lists (first player inflated in proj per seat
// is awkward) — scale by adding seat-specific phantom not used. Simpler: set distinct
// starter proj by putting unique ids.
for (let rid = 1; rid <= 10; rid++) {
  const qb = "qb" + rid;
  players[qb] = { position: "QB" };
  currentStarters[rid] = [qb, "b", "c", "d", "e", "f"];
  currentRosters[rid] = [qb, "b", "c", "d", "e", "f"].concat(rid === 10 ? ["stud"] : []);
  for (let w = 2; w <= 17; w++) {
    projectionsByWeek[w][qb] = 30 - rid; // seed-ish strength
    projectionsByWeek[w].stud = 25;
  }
}

const book = buildBestBallHypeBook({
  weeks: [{ week: 1, rows: tenWeekRows(scoredPts) }],
  rsFutureWeeks: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((w) => ({
    week: w,
    rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rid) => ({
      roster_id: rid,
      matchup_id: Math.ceil(rid / 2),
    })),
  })),
  currentRosters,
  currentStarters,
  projectionsByWeek,
  rosterPositions,
  players,
  ownerByRoster,
  nameByUser,
  season: 2026,
  week: 1,
  playoffWeekStart: 15,
  playoffTeams: 6,
  leagueId: "x",
});

assert.equal(book.v, 3);
assert.equal(book.playoff_teams, 6);
assert.equal(book.seats.length, 10);
assert.ok(book.champ && book.toilet);
assert.ok(book.seats.every((s) => s.seed >= 1 && s.seed <= 10));
assert.equal(book.seats.filter((s) => s.bracket === "champ").length, 6);
assert.equal(book.seats.filter((s) => s.bracket === "toilet").length, 4);

const byes = (book.champ.rounds[0].games || []).filter((g) => g.bye);
assert.equal(byes.length, 2, "seeds 1–2 get week-one byes");
const qf = (book.champ.rounds[0].games || []).filter((g) => !g.bye);
assert.ok(qf.some((g) => {
  const seeds = [g.a.seed, g.b.seed].sort((a, b) => a - b);
  return seeds[0] === 3 && seeds[1] === 6;
}), "6v3 in champ QF");
assert.ok(qf.some((g) => {
  const seeds = [g.a.seed, g.b.seed].sort((a, b) => a - b);
  return seeds[0] === 4 && seeds[1] === 5;
}), "5v4 in champ QF");

const toiletR1 = book.toilet.rounds[0].games || [];
assert.ok(toiletR1.every((g) => g.mode === "best_ball"), "toilet is best ball");
assert.ok(toiletR1.some((g) => {
  const seeds = [g.a.seed, g.b.seed].sort((a, b) => a - b);
  return seeds[0] === 7 && seeds[1] === 10;
}), "10v7 toilet");
assert.ok(toiletR1.some((g) => {
  const seeds = [g.a.seed, g.b.seed].sort((a, b) => a - b);
  return seeds[0] === 8 && seeds[1] === 9;
}), "8v9 toilet");

assert.ok(book.champ.rounds[0].games.filter((g) => !g.bye).every((g) => g.mode === "set_lineup"));
assert.ok(book.seats.every((s) => Number(s.place_proj) >= 1 && Number(s.place_proj) <= 10));

console.log(JSON.stringify({
  ok: true,
  champ_leader: book.seats.find((s) => s.place_proj === 1)?.name,
  sacko: book.seats.find((s) => s.place_proj === 10)?.name,
  seeds: book.seeding.map((s) => s.name + "#" + s.seed),
}));
