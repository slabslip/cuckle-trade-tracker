import assert from "node:assert/strict";
import {
  pythagWinPct,
  winProb,
  pickSlotFromFinish,
  projectFinishBook,
} from "./lib/projected-finish.mjs";

assert.ok(pythagWinPct(1000, 800) > 0.5);
assert.ok(pythagWinPct(800, 1000) < 0.5);
assert.equal(Math.round(winProb(0.6, 0.4) * 100), 60);
assert.equal(pickSlotFromFinish(10, 10), 1);
assert.equal(pickSlotFromFinish(1, 10), 10);
assert.equal(pickSlotFromFinish(5, 10), 6);

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

assert.equal(book.seats[0].name, "Alpha");
assert.equal(book.seats[0].proj_finish, 1);
assert.equal(book.seats[0].proj_slot, 2);
assert.equal(book.seats[1].proj_finish, 2);
assert.equal(book.seats[1].proj_slot, 1);
assert.equal(book.seats[1].band, "Early");
assert.ok(book.seats[0].expected_wins > book.seats[1].expected_wins);

console.log("projected-finish.test.mjs ok");
