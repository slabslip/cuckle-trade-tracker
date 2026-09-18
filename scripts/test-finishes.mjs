#!/usr/bin/env node
/** Career finishes: average place, season count, no parked / no double-count. */
import { standingsFor, standingsForRedraft } from "../lib/standings.mjs";
import {
  addFinish,
  buildFinishesBook,
  careerFloorSeats,
  contenderSeats,
  grossWonSeats,
  playoffAvgSeats,
  playoffNSeats,
  pointsKingSeats,
  rankFinishes,
  remapEspnStanding,
  rsAvgSeats,
  sackoSeats,
} from "../lib/finishes.mjs";
import { GM_POT } from "../lib/redraft-season.mjs";

function fail(msg) {
  console.error("FINISH FAIL: " + msg);
  process.exit(1);
}

const wb = [
  { p: 1, w: 8, l: 11 },
  { p: 3, w: 1, l: 12 },
  { p: 5, w: 10, l: 9 },
];
const names = {
  a: "Biff34",
  b: "JnastyGBE300",
  c: "ztrain123",
  d: "collinmccaskill",
  e: "fatassmexican",
  f: "sbzy11",
  g: "Tbow00",
  h: "kotula69",
  i: "Aballers",
  j: "TrumanCooper",
  k: "TaylorJohnson16",
  l: "Adizzl3",
};
const owner = { 8: "a", 11: "b", 1: "c", 12: "d", 10: "e", 9: "f", 7: "g", 6: "h", 5: "i", 4: "j", 3: "k", 2: "l" };
const recordOrder = [8, 11, 1, 12, 9, 10, 7, 6, 5, 4, 3, 2];
const rosters = recordOrder.map((rid, i) => ({
  roster_id: rid,
  owner_id: owner[rid],
  settings: { wins: 12 - i, losses: i, ties: 0, fpts: 1600 - i * 10, fpts_decimal: 0 },
}));
const rows = standingsFor({ season: "2025", rosters, owner, names, wb }, names);
if (rows[0].name !== "Biff34" || rows[0].place !== 1 || rows[0].from !== "bracket") {
  fail("2025 first is Biff from the bracket: " + JSON.stringify(rows[0]));
}
if (rows[1].name !== "JnastyGBE300" || rows[1].place !== 2) fail("runner-up is Jnasty");
if (rows.find((r) => r.name === "TrumanCooper").place !== 10) fail("Truman is 10th from record after the six placed");

const byUser = new Map();
for (const r of rows) addFinish(byUser, { ...r, season: "2025" });
addFinish(byUser, { user_id: "a", name: "Biff34", season: "2024", place: 3 });
addFinish(byUser, { user_id: "a", name: "Biff34", season: "2024", place: 99 });
addFinish(byUser, { user_id: "park", name: "SethHenry12", season: "2025", place: 0 });
addFinish(byUser, { user_id: "park", name: "SethHenry12", place: 13 });
const ranked = rankFinishes(byUser, [{ user_id: "a", name: "Biff34" }]);
const biff = ranked.find((s) => s.name === "Biff34");
if (!biff || biff.n !== 2 || biff.avg !== 2) fail("Biff avg is (1+3)/2 = 2.0 over 2 seasons: " + JSON.stringify(biff));
if (ranked.some((s) => s.name === "SethHenry12")) fail("Seth with no real finish must stay off the list");
if (ranked[0].name !== "Biff34") fail("best average is first");

const book = buildFinishesBook({
  sleeperSeasons: [{ season: "2025", rows }],
  espnStandings: [
    { season: "2025", user_id: "a", name: "Biff34", place: 12 },
    { season: "2024", user_id: "j", name: "TrumanCooper", place: 4 },
    { season: "2024", user_id: "l", name: "Adizzl3", place: 12 },
  ],
  members: Object.entries(names).map(([user_id, name]) => ({ user_id, name })),
  leagueId: "test",
  sleeperYears: ["2025"],
});
if (book.seasons.join(",") !== "2025,2024") fail("seasons newest first, ESPN year kept: " + book.seasons);
if (book.seats.find((s) => s.name === "Biff34").avg !== 1) fail("ESPN 2025 must not overwrite Sleeper 2025");
const tru = book.seats.find((s) => s.name === "TrumanCooper");
if (!tru || tru.n !== 2 || tru.avg !== 7) fail("Truman 2025 10th + ESPN 2024 4th = 7.0: " + JSON.stringify(tru));
if (book.seats.some((s) => s.name === "SethHenry12")) fail("book must omit people who never finished");
if (book.v !== 3 || book.career_floor !== 3) fail("career book v3 ships a 3-season floor");
if (book.rule !== "winners-bracket then record; average of completed seasons only") {
  fail("default finishes rule stays dynasty / winners-bracket: " + book.rule);
}
const biffSeat = book.seats.find((s) => s.name === "Biff34");
if (!biffSeat || biffSeat.titles_n !== 1 || biffSeat.top6_n !== 1 || biffSeat.last_n !== 0) {
  fail("Biff 2025 title is one crown, not a sacko: " + JSON.stringify(biffSeat));
}
if (biffSeat.fpts_avg == null || biffSeat.wins < 7) fail("Biff keeps 2025 points and wins: " + JSON.stringify(biffSeat));
const lastSeat = book.seats.find((s) => s.name === "Adizzl3");
if (!lastSeat || lastSeat.last_n !== 2) fail("Adizzl3 is last in 2025 and 2024: " + JSON.stringify(lastSeat));
if (tru.last_n !== 0) fail("Truman 10th in a 12-team year is not sacko");
if (careerFloorSeats(book.seats, 3).length) fail("no seat has 3 seasons in this fixture");
if (pointsKingSeats(book.seats, 1)[0].name !== "Biff34") fail("points king at n=1 is Biff");
if (contenderSeats(book.seats, 1)[0].contender < 50) fail("title year is a contender season");
if (sackoSeats(book.seats)[0].name !== "Adizzl3") fail("sacko list starts with last place");

const potBook = buildFinishesBook({
  sleeperSeasons: [{ season: "2025", rows }],
  espnStandings: [
    { season: "2024", user_id: "a", name: "Biff34", place: 5, from: "first_round", rs_place: 2 },
    { season: "2024", user_id: "l", name: "Adizzl3", place: 12, from: "regular", rs_place: 12 },
  ],
  members: Object.entries(names).map(([user_id, name]) => ({ user_id, name })),
  leagueId: "test",
  sleeperYears: ["2025"],
  pot: GM_POT,
});
if (potBook.v !== 4 || !potBook.pot || potBook.pot.entry !== 300) fail("redraft pot book is v4");
const potBiff = potBook.seats.find((s) => s.name === "Biff34");
if (!potBiff || potBiff.playoff_n !== 2 || potBiff.playoff_avg !== 3) {
  fail("Biff 2025 title + 2024 first-round is 2 playoff years / 3.0 avg: " + JSON.stringify(potBiff));
}
if (potBiff.rs_avg == null) fail("Biff keeps an RS average");
if (potBiff.won !== 1700 || potBiff.lost !== 600 || potBiff.net !== 1100) {
  fail("Biff $1500 title + $200 fifth, $600 entries: " + JSON.stringify(potBiff));
}
if (playoffNSeats(potBook.seats)[0].name !== "Biff34") fail("playoff appearances start with Biff");
if (grossWonSeats(potBook.seats)[0].name !== "Biff34") fail("gross won starts with the title");
if (!rsAvgSeats(potBook.seats, 1).length) fail("RS average list is not empty");
if (playoffAvgSeats(potBook.seats, 2)[0].name !== "Biff34") fail("playoff avg floor 2 starts with Biff");

const remapped = remapEspnStanding(
  { season: "2018", user_id: "espn:old", roster_id: 3, place: 2, name: "Old" },
  { "espn:old": "person" },
  { 3: "franchise" },
);
if (remapped.user_id !== "franchise") fail("franchise map wins over person map");

const gmWb = [
  { m: 1, r: 1, l: 10, w: 8, t1: 10, t2: 8 },
  { m: 2, r: 1, l: 9, w: 11, t1: 11, t2: 9 },
  { m: 3, r: 2, l: 1, w: 8, t1: 1, t2: 8 },
  { m: 4, r: 2, l: 12, w: 11, t1: 12, t2: 11 },
  { p: 5, m: 5, r: 2, l: 9, w: 10, t1: 10, t2: 9 },
  { p: 1, m: 6, r: 3, l: 11, w: 8, t1: 8, t2: 11 },
  { p: 3, m: 7, r: 3, l: 12, w: 1, t1: 1, t2: 12 },
];
const redraft = standingsForRedraft({ season: "2025", rosters, owner, names, wb: gmWb }, names);
if (redraft[0].name !== "Biff34" || redraft[1].name !== "JnastyGBE300") fail("title game still 1-2");
if (redraft.find((r) => r.name === "sbzy11").place !== 5) fail("first-round outs sort by regular season: sbzy 9-5 is 5th");
if (redraft.find((r) => r.name === "fatassmexican").place !== 6) fail("p=5 consolation must not put fatass over sbzy");
if (redraft.find((r) => r.name === "Adizzl3").place !== 12) fail("missed playoffs still regular-season last");
if (redraft.find((r) => r.name === "sbzy11").from !== "first_round") fail("first-round loser is tagged first_round");
if (redraft.find((r) => r.name === "ztrain123").from !== "semi") fail("bye who lost a semi is tagged semi");

console.log("PASS finishes: avg rank, season count, no parked, Sleeper year wins");
