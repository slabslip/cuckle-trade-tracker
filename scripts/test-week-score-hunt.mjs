#!/usr/bin/env node
/** Winners-bracket hunt map + list filter. Fail fast. */
import { huntByWeekFromBracket, huntByWeekJson, scoreIsChampionshipHunt, scoreIsSemiMoneyPlace, weekScoreBookFromTape } from "../lib/week-score-lists.mjs";

function fail(msg) {
  console.error("HUNT FAIL: " + msg);
  process.exit(1);
}
function ids(set) {
  return [...(set || [])].sort((a, b) => a - b).join(",");
}

// Gm 2025 6-team winners bracket (fetched 2026-09-15).
const GM_2025_WB = [
  { m: 1, r: 1, l: 10, w: 8, t1: 10, t2: 8 },
  { m: 2, r: 1, l: 9, w: 11, t1: 11, t2: 9 },
  { m: 3, r: 2, l: 1, w: 8, t1: 1, t2: 8, t2_from: { w: 1 } },
  { m: 4, r: 2, l: 12, w: 11, t1: 12, t2: 11, t2_from: { w: 2 } },
  { p: 5, m: 5, r: 2, l: 9, w: 10, t1: 10, t2: 9, t2_from: { l: 2 }, t1_from: { l: 1 } },
  { p: 1, m: 6, r: 3, l: 11, w: 8, t1: 8, t2: 11, t2_from: { w: 4 }, t1_from: { w: 3 } },
  { p: 3, m: 7, r: 3, l: 12, w: 1, t1: 1, t2: 12, t2_from: { l: 4 }, t1_from: { l: 3 } },
];

const by = huntByWeekFromBracket(GM_2025_WB, 15);
if (ids(by[15]) !== "8,9,10,11") fail("week 15 hunt should be the four QF seats, not byes: " + ids(by[15]));
if (ids(by[16]) !== "1,8,11,12") fail("week 16 hunt should be semis, not 5th place: " + ids(by[16]));
if (ids(by[17]) !== "8,11") fail("week 17 hunt is the title game only, not 3rd place: " + ids(by[17]));
if (by[18]) fail("week 18 has no title game");
const huntWeeks = [15, 16, 17].reduce((n, w) => n + (by[w] ? by[w].size : 0), 0);
if (huntWeeks !== 10) fail("2025 title-path hunt is 10 team-weeks, got " + huntWeeks);
if (huntByWeekJson([{ p: 1, r: 3, t1: 0, t2: 0 }], 15)[17]) fail("TBD title game must not write an empty hunt week");
if (Object.keys(huntByWeekFromBracket([], 15)).length) fail("empty bracket must yield no hunt weeks");
if (Object.keys(huntByWeekFromBracket(GM_2025_WB, 0)).length) fail("bad playoff_week_start must yield no hunt weeks");

const json = huntByWeekJson(GM_2025_WB, 15);
if (json[15].join(",") !== "8,9,10,11" || json[17].join(",") !== "8,11") {
  fail("huntByWeekJson drifted from the Set map");
}

if (!scoreIsChampionshipHunt({ phase: "regular", hunt: false })) fail("regular weeks always count");
if (scoreIsChampionshipHunt({ phase: "playoff", hunt: false })) fail("consolation must not count");
if (!scoreIsChampionshipHunt({ phase: "playoff", hunt: true })) fail("title-hunt playoff must count");
if (scoreIsChampionshipHunt({ phase: "playoff" })) fail("untagged playoff must not count as hunt");
if (scoreIsChampionshipHunt({ phase: "playoff", hunt: true, points: 9 })) fail("ESPN stub hunt under 20 must not count");
if (!scoreIsChampionshipHunt({ phase: "playoff", hunt: true, points: 57.1 })) fail("real hunt 57.1 must still count");
if (scoreIsChampionshipHunt({ phase: "playoff", hunt: true, points: 101, playoff_tier: "WINNERS_CONSOLATION_LADDER" })) {
  fail("3rd-place must not count as title hunt even when hunt=true");
}

const tape = {
  as_of: "2026-09-15",
  scores: [
    { user_id: "a", season: "2025", week: 8, points: 34.82, phase: "regular", hunt: true },
    { user_id: "b", season: "2025", week: 7, points: 172.08, phase: "regular", hunt: true },
    { user_id: "c", season: "2025", week: 16, points: 44.58, phase: "playoff", hunt: false },
    { user_id: "d", season: "2025", week: 18, points: 45.7, phase: "playoff", hunt: false },
    { user_id: "e", season: "2025", week: 17, points: 85.28, phase: "playoff", hunt: true },
    { user_id: "f", season: "2025", week: 16, points: 163.38, phase: "playoff", hunt: true },
    { user_id: "g", season: "2025", week: 17, points: 157.58, phase: "playoff", hunt: false },
    { user_id: "semi", season: "2025", week: 16, points: 119.1, phase: "playoff", hunt: true },
    { user_id: "semi", season: "2025", week: 17, points: 147.64, phase: "playoff", hunt: false },
    { user_id: "h", season: "2020", week: 14, points: 9, phase: "playoff", hunt: true },
  ],
};
const book = weekScoreBookFromTape(tape);
if (book.n_playoff !== 8 || book.n_playoff_hunt !== 4) fail("hunt counts wrong: " + book.n_playoff + "/" + book.n_playoff_hunt);
if (book.all.low.some((r) => r.points === 9) || book.playoff.low.some((r) => r.points === 9)) {
  fail("9-pt ESPN stub leaked into high/low lists");
}
if (book.all.low[0].points !== 34.82) fail("all low leaked consolation: " + book.all.low[0].points);
if (book.all.high[0].points !== 172.08) fail("all high drifted: " + book.all.high[0].points);
if (book.playoff.high[0].points !== 163.38) fail("playoff high should be the title-hunt 163.38");
if (book.playoff.low[0].points !== 85.28) fail("playoff low should be the title-game 85.28, not 44.58");
if (book.playoff.high.some((r) => r.points === 157.58)) fail("consolation 157.58 leaked into playoff highs");
if (!book.playoff.high.some((r) => r.points === 147.64)) fail("3rd-place money game 147.64 must count");
if (!scoreIsSemiMoneyPlace(
  { user_id: "semi", season: "2025", week: 17, points: 147.64, phase: "playoff", hunt: false },
  tape.scores,
)) fail("semi 3rd-place week is a money lineup");
if (scoreIsSemiMoneyPlace(
  { user_id: "g", season: "2025", week: 17, points: 157.58, phase: "playoff", hunt: false },
  tape.scores,
)) fail("missed-playoff leftover is not a money lineup");
if (book.all.low.some((r) => r.week === 18)) fail("week 18 leftover leaked into all lows");

console.log("PASS week-score hunt laws");
