#!/usr/bin/env node
/**
 * Twelve deepening reviews of today's GM standings / money-game edits.
 * Each loop is one law. Fail fast. Dynasty Cuckle must not move.
 */
import fs from "node:fs";
import {
  applyRedraftSeason,
  seasonPointBuckets,
  countableFpts,
} from "../lib/redraft-season.mjs";
import {
  huntByWeekFromBracket,
  scoreIsChampionshipHunt,
  scoreIsSemiMoneyPlace,
  titlePathWeeks,
  weekScoreBookFromTape,
} from "../lib/week-score-lists.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const ID = "1389723418827460608";
const ui = `${ROOT}data/leagues/${ID}/ui`;
const raw = `${ROOT}data/leagues/${ID}/raw`;

function load(p, fb) {
  if (!fs.existsSync(p)) return fb;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function loop(n, cond, msg) {
  if (!cond) {
    console.error("REVIEW " + n + " FAIL: " + msg);
    process.exit(1);
  }
  console.log("REVIEW " + n + " PASS: " + msg);
}

const finishes = load(`${ui}/finishes.json`, {});
const weeks = load(`${ui}/week-scores.json`, {});
const tape = load(`${raw}/weekly_scores.json`, { scores: [] });
const cuckleFin = load(`${ROOT}data/ui/finishes.json`, {});
const page = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");
const html = fs.readFileSync(`${ROOT}index.html`, "utf8");
const redraft = fs.readFileSync(`${ROOT}lib/redraft-season.mjs`, "utf8");
const lists = fs.readFileSync(`${ROOT}lib/week-score-lists.mjs`, "utf8");
const boards = finishes.years || [];
const seats = finishes.seats || [];
const seatOf = (name) => seats.find((s) => s.name === name);
const placeOf = (name, season) => (seatOf(name) || {}).places?.find((p) => p.season === season);
const boardOf = (season) => boards.find((y) => y.season === season);

// 1 Year books exist, 12 unique places, no gaps
const yearsOk = ["2025", "2024", "2023", "2022", "2021", "2020"].every((y) => {
  const b = boardOf(y);
  if (!b || b.n !== 12 || !Array.isArray(b.rows) || b.rows.length !== 12) return false;
  const places = b.rows.map((r) => r.place);
  return places.join(",") === "1,2,3,4,5,6,7,8,9,10,11,12"
    && new Set(b.rows.map((r) => r.user_id)).size === 12;
});
loop(1, boards.length === 6 && yearsOk,
  "each saved year is a 12-seat 1-12 board with unique seats");

// 2 From-tags: top six playoff, bottom six RS
const fromOk = boards.every((b) => (
  b.rows[0].from === "title" && b.rows[1].from === "title"
  && b.rows[2].from === "semi" && b.rows[3].from === "semi"
  && b.rows[4].from === "first_round" && b.rows[5].from === "first_round"
  && b.rows.slice(6).every((r) => r.from === "regular")
));
loop(2, fromOk,
  "1-2 championship, 3-4 3rd-place, 5-6 first round, 7-12 regular season");

// 3 Last place is worst regular-season record
const sackoOk = boards.every((b) => {
  const last = b.rows[11];
  const worstRs = b.rows.slice().sort((a, c) => {
    const pa = (Number(a.wins) || 0) * 2 + (Number(a.ties) || 0);
    const pb = (Number(c.wins) || 0) * 2 + (Number(c.ties) || 0);
    if (pa !== pb) return pa - pb;
    return (Number(a.rs_fpts) || 0) - (Number(c.rs_fpts) || 0);
  })[0];
  return last && worstRs && last.user_id === worstRs.user_id && last.rs_place === 12;
});
loop(3, sackoOk
  && placeOf("Adizzl3", "2025")?.place === 12
  && placeOf("ztrain123", "2024")?.place === 12
  && placeOf("TaylorJohnson16", "2020")?.place === 12
  && placeOf("JnastyGBE300", "2021")?.place === 12,
  "sacko is worst RS record every year, not ESPN consolation last");

// 4 Year board matches each seat's saved place
const matchOk = boards.every((b) => b.rows.every((row) => {
  const seat = seats.find((s) => s.user_id === row.user_id);
  const p = (seat && seat.places || []).find((x) => x.season === b.season);
  return p && p.place === row.place && p.from === row.from && p.rs_place === row.rs_place;
}));
loop(4, matchOk,
  "year boards are the same concrete places stored on every seat");

// 5 Money PF: 3rd-place week in for semis, first-round consolation out
const kotula24 = placeOf("kotula69", "2024");
const tbow24 = placeOf("Tbow00", "2024");
const sbzy24 = placeOf("sbzy11", "2024");
const ztrain25 = placeOf("ztrain123", "2025");
const collin25 = placeOf("collinmccaskill", "2025");
loop(5, kotula24 && kotula24.fpts === 1704.74 && kotula24.rs_fpts === 1326.16
  && tbow24 && tbow24.fpts === 2013.88 && tbow24.rs_fpts === 1742.68
  && sbzy24 && sbzy24.fpts === 1631.54
  && ztrain25 && ztrain25.fpts === 1798.92 && ztrain25.rs_fpts === 1532.18
  && collin25 && collin25.fpts === 1654.88 && collin25.rs_fpts === 1428.96,
  "3rd-place weeks count in PF; first-round consolation stays out");

// 6 Leftover scores never become place or week-score lows
const tbow25 = placeOf("Tbow00", "2025");
const playoffLows = (weeks.playoff && weeks.playoff.low) || [];
const playoffHighs = (weeks.playoff && weeks.playoff.high) || [];
loop(6, tbow25 && tbow25.place === 7 && tbow25.fpts === tbow25.rs_fpts
  && playoffLows[0] && playoffLows[0].name === "kotula69" && playoffLows[0].points === 56.06
  && !playoffHighs.some((r) => r.points === 157.58)
  && !playoffLows.some((r) => r.points === 157.58),
  "missed-playoff leftovers do not move place, PF, or week-score lists");

// 7 Bye seeds still land in the semis, not regular season
loop(7, placeOf("ztrain123", "2025")?.from === "semi"
  && placeOf("collinmccaskill", "2025")?.from === "semi"
  && placeOf("Biff34", "2025")?.from === "title"
  && placeOf("sbzy11", "2025")?.from === "first_round",
  "2025 bye seeds stay semis; first-round outs stay 5-6");

// 8 Playoff avg uses yearly places; RS avg ignores the playoff reshuffle
const tbow = seatOf("Tbow00");
const kotula = seatOf("kotula69");
loop(8, tbow && tbow.rs_avg === 4 && tbow.playoff_avg === 3
  && tbow24 && tbow24.rs_place === 1 && tbow24.place === 4
  && kotula && kotula.playoff_avg === 4.3 && kotula.rs_avg === 7
  && placeOf("kotula69", "2024")?.place === 3,
  "Tbow RS 4.0 / playoff 3.0; 2024 title-hunt 1st is still 4th in the money games");

// 9 Sacko fee + pot + script still boots
loop(9, finishes.pot && finishes.pot.sacko === 200 && finishes.pot.pot === 3800
  && seatOf("Adizzl3")?.net === -500
  && seatOf("JnastyGBE300")?.lost === 2200
  && page.includes('const DATA_V = "listshare20260918172000"')
  && html.includes("chuckle-shell-v282-finish-one") === false
  && fs.readFileSync(`${ROOT}sw.js`, "utf8").includes("chuckle-shell-v283-list-share"),
  "sacko $200 / pot $3800 still on the book; cache moved for the review ship");

// 10 Cuckle isolation: old dynasty book, no year picker leak
loop(10, cuckleFin.v === 1 && !cuckleFin.years && cuckleFin.rule.indexOf("winners-bracket") === 0
  && (cuckleFin.seats || []).some((s) => (s.places || []).some((p) => p.from === "bracket"))
  && page.includes('id === "season_place" && leagueFormat().kind === "redraft"')
  && html.includes('id === "season_place" && leagueFormat().kind === "redraft"')
  && page.includes("function finishYearWant(") && html.includes("function finishYearWant(")
  && page.includes("function finishPlaceSeats(") && html.includes("function finishPlaceSeats(")
  && page.includes("Winners bracket, then record.") && html.includes("Winners bracket, then record.")
  && !page.includes('"career_avg", "points_king"') && !html.includes('"career_avg", "points_king"')
  && page.includes('from === "bracket"') && page.includes('return "Playoff"'),
  "Cuckle book unchanged; year picker, yearWant, and Playoff label stay redraft-safe");

// 11 titlePathWeeks is computed once per season, not once per score
const gm2025wb = [
  { m: 1, r: 1, l: 10, w: 8, t1: 10, t2: 8 },
  { m: 2, r: 1, l: 9, w: 11, t1: 11, t2: 9 },
  { m: 3, r: 2, l: 1, w: 8, t1: 1, t2: 8 },
  { m: 4, r: 2, l: 12, w: 11, t1: 12, t2: 11 },
  { p: 5, m: 5, r: 2, l: 9, w: 10, t1: 10, t2: 9 },
  { p: 1, m: 6, r: 3, l: 11, w: 8, t1: 8, t2: 11 },
  { p: 3, m: 7, r: 3, l: 12, w: 1, t1: 1, t2: 12 },
];
const hunt17 = [...(huntByWeekFromBracket(gm2025wb, 15)[17] || [])].sort((a, b) => a - b).join(",");
loop(11, redraft.includes("const path = titlePathWeeks(scores, year)")
  && lists.includes("pathBySeason")
  && lists.includes("scoreIsSemiMoneyPlace(score, scores, path)")
  && lists.includes("scoreIsPlayoffLineup(s, scores, pathFor")
  && lists.includes("if (place != null && place !== 1) continue")
  && !lists.includes("place !== 1 && place !== 3")
  && hunt17 === "8,11",
  "title-path weeks cache per season; p=3 stays off the hunt map");

// 12 Edge fixtures: empty tape, missing 3rd-place game, leftover, stub
const rows = [
  { season: "2099", user_id: "c", name: "Champ", place: 1, wins: 9, losses: 5, fpts: 100, roster_id: 1 },
  { season: "2099", user_id: "r", name: "Runner", place: 2, wins: 8, losses: 6, fpts: 90, roster_id: 2 },
  { season: "2099", user_id: "s1", name: "SemiA", place: 3, wins: 7, losses: 7, fpts: 80, roster_id: 3 },
  { season: "2099", user_id: "s2", name: "SemiB", place: 4, wins: 11, losses: 3, fpts: 120, roster_id: 4 },
];
const empty = applyRedraftSeason(rows, [], "c");
const emptyBy = Object.fromEntries(empty.map((r) => [r.name, r]));
const scores = [
  { user_id: "c", season: "2099", week: 15, points: 100, phase: "playoff", hunt: true },
  { user_id: "r", season: "2099", week: 15, points: 90, phase: "playoff", hunt: true },
  { user_id: "s1", season: "2099", week: 15, points: 80, phase: "playoff", hunt: true },
  { user_id: "s2", season: "2099", week: 15, points: 70, phase: "playoff", hunt: true },
  { user_id: "c", season: "2099", week: 16, points: 110, phase: "playoff", hunt: true },
  { user_id: "r", season: "2099", week: 16, points: 40, phase: "playoff", hunt: true },
  { user_id: "s1", season: "2099", week: 16, points: 9, phase: "playoff", hunt: true },
  { user_id: "s2", season: "2099", week: 17, points: 101, phase: "playoff", hunt: false, playoff_tier: "WINNERS_CONSOLATION_LADDER" },
  { user_id: "out", season: "2099", week: 17, points: 200, phase: "playoff", hunt: false },
];
const path = titlePathWeeks(scores, "2099");
const buckets = seasonPointBuckets(scores, "2099");
const tagged = scores.map((s) => (
  s.playoff_tier === "WINNERS_CONSOLATION_LADDER" ? { ...s, hunt: true } : s
));
const taggedRows = applyRedraftSeason(rows, tagged, "c");
const taggedBy = Object.fromEntries(taggedRows.map((r) => [r.name, r]));
loop(12, emptyBy.SemiA.place === 3 && emptyBy.SemiB.place === 4
  && !scoreIsSemiMoneyPlace(scores[7], scores, path)
  && !scoreIsSemiMoneyPlace(scores[8], scores, path)
  && countableFpts(buckets.s1) === 80
  && weekScoreBookFromTape({ scores }).playoff.high.every((r) => r.points !== 200)
  && applyRedraftSeason([], scores, "c").length === 0
  && !scoreIsChampionshipHunt({ phase: "playoff", hunt: true, points: 101, playoff_tier: "WINNERS_CONSOLATION_LADDER" })
  && taggedBy.SemiA.place === 3 && taggedBy.SemiB.place === 4
  && taggedBy.Champ.place === 1,
  "missing 3rd-place tape keeps official 3-4; stubs, leftovers, and hunt=true 3rd-place stay out");

console.log("PASS 12 standings review loops");
