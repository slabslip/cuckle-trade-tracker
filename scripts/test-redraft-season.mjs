#!/usr/bin/env node
/** 3rd-place game sets 3rd/4th; consolation points stay out. Fail fast. */
import { applyRedraftSeason, countableFpts, seasonPointBuckets } from "../lib/redraft-season.mjs";
import { scoreIsChampionshipHunt } from "../lib/week-score-lists.mjs";

function fail(msg) {
  console.error("REDRAFT-SEASON FAIL: " + msg);
  process.exit(1);
}

const rows = [
  { season: "2024", user_id: "champ", name: "fatassmexican", place: 1, wins: 9, losses: 5, fpts: 1518, roster_id: 7 },
  { season: "2024", user_id: "final", name: "Adizzl3", place: 2, wins: 9, losses: 5, fpts: 1458, roster_id: 5 },
  { season: "2024", user_id: "semiB", name: "kotula69", place: 3, wins: 7, losses: 7, fpts: 1326, roster_id: 11 },
  { season: "2024", user_id: "semiA", name: "Tbow00", place: 4, wins: 11, losses: 3, fpts: 1743, roster_id: 9 },
  { season: "2024", user_id: "qfA", name: "sbzy11", place: 5, wins: 9, losses: 5, fpts: 1490, roster_id: 6 },
  { season: "2024", user_id: "qfB", name: "Aballers", place: 6, wins: 7, losses: 7, fpts: 1448, roster_id: 12 },
  { season: "2024", user_id: "rs7", name: "TaylorJohnson16", place: 11, wins: 6, losses: 8, fpts: 1554, roster_id: 4 },
  { season: "2024", user_id: "rs8", name: "JnastyGBE300", place: 7, wins: 6, losses: 8, fpts: 1405, roster_id: 2 },
  { season: "2024", user_id: "rs9", name: "Biff34", place: 9, wins: 6, losses: 8, fpts: 1391, roster_id: 3 },
  { season: "2024", user_id: "rs10", name: "collinmccaskill", place: 10, wins: 5, losses: 9, fpts: 1374, roster_id: 8 },
  { season: "2024", user_id: "rs11", name: "JaredMcFadden", place: 8, wins: 5, losses: 9, fpts: 1347, roster_id: 10 },
  { season: "2024", user_id: "last", name: "ztrain123", place: 12, wins: 4, losses: 10, fpts: 1316, roster_id: 1 },
];

const scores = [];
function add(uid, week, points, phase, hunt, extra) {
  scores.push({ user_id: uid, season: "2024", week, points, phase, hunt, ...(extra || {}) });
}
for (const r of rows) {
  add(r.user_id, 1, r.user_id === "rs7" ? 140 : 100, "regular", true);
  add(r.user_id, 14, r.user_id === "rs7" ? 120 : 80, "regular", true);
}
for (const uid of ["champ", "final", "semiA", "semiB", "qfA", "qfB"]) add(uid, 15, 120, "playoff", true);
for (const uid of ["champ", "final", "semiA", "semiB"]) add(uid, 16, 110, "playoff", true);
add("qfA", 16, 40, "playoff", false);
add("qfB", 16, 30, "playoff", false);
add("champ", 17, 150, "playoff", true);
add("final", 17, 90, "playoff", true);
add("semiA", 17, 101.62, "playoff", false, { playoff_tier: "WINNERS_CONSOLATION_LADDER" });
add("semiB", 17, 106.96, "playoff", false, { playoff_tier: "WINNERS_CONSOLATION_LADDER" });
add("last", 17, 10, "playoff", false);

const next = applyRedraftSeason(rows, scores, "champ");
const by = Object.fromEntries(next.map((r) => [r.name, r]));
if (by.fatassmexican.place !== 1 || by.Adizzl3.place !== 2) fail("title game stays 1-2");
if (by.kotula69.place !== 3) fail("3rd-place game winner is 3rd even at 7-7: " + by.kotula69.place);
if (by.Tbow00.place !== 4) fail("3rd-place game loser is 4th even at 11-3: " + by.Tbow00.place);
if (by.sbzy11.place !== 5 || by.Aballers.place !== 6) fail("first-round outs by regular season");
if (by.TaylorJohnson16.place !== 7) fail("Taylor 6-8 1554 PF is 7th in regular season, not 11th from consolation");
if (by.ztrain123.place !== 12) fail("ztrain 4-10 is regular-season last / sacko");
if (by.Biff34.place !== 9) fail("Biff stays 9th from regular season");
if (by.Tbow00.fpts >= 1743) fail("consolation 200 must not stay in Tbow's season points: " + by.Tbow00.fpts);
if (by.ztrain123.fpts !== 180) fail("sacko points are regular season only, not consolation 10: " + by.ztrain123.fpts);
if (by.fatassmexican.fpts !== 180 + 120 + 110 + 150) fail("champ keeps title-hunt weeks: " + by.fatassmexican.fpts);
if (by.Tbow00.rs_place !== 1) fail("Tbow 11-3 is regular-season 1st, not final 3rd: " + by.Tbow00.rs_place);
if (by.TaylorJohnson16.rs_place !== 7) fail("Taylor 6-8 is RS 7th among missed + worse records: " + by.TaylorJohnson16.rs_place);
if (by.ztrain123.rs_place !== 12) fail("ztrain is RS last");
if (by.Tbow00.rs_fpts !== 180) fail("Tbow RS points drop hunt and consolation: " + by.Tbow00.rs_fpts);

const buckets = seasonPointBuckets(scores, "2024");
if (countableFpts(buckets.last) !== 180) fail("countable drops consolation");
if (scoreIsChampionshipHunt({ phase: "playoff", hunt: false })) fail("consolation hunt flag");

const noGame = applyRedraftSeason(rows, scores.filter((s) => s.playoff_tier !== "WINNERS_CONSOLATION_LADDER"), "champ");
const noGameBy = Object.fromEntries(noGame.map((r) => [r.name, r]));
if (noGameBy.kotula69.place !== 3 || noGameBy.Tbow00.place !== 4) {
  fail("official incoming 3rd/4th stand when the 3rd-place tape is missing");
}

console.log("PASS redraft season: 3rd-place game, RS last place, consolation points out");
