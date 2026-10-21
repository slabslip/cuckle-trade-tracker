#!/usr/bin/env node
/** ESPN name / franchise attach + hunt tiers. Fail fast. */
import { buildBridge, buildFranchiseMap, resolveEspnScoreUid } from "../merge-provider-history.mjs";
import { espnPhase, espnPlayoffHunt, espnScoresFromSchedule, espnSidePoints } from "../lib/espn-weeks.mjs";

function fail(msg) {
  console.error("ESPN FAIL: " + msg);
  process.exit(1);
}

const sleeper = [
  { user_id: "s-biff", canonical_name: "Biff34", aliases: [{ name: "Gimmie The Goo" }] },
  { user_id: "s-truman", canonical_name: "TrumanCooper", aliases: [{ name: "PRONOUNS-SHE/DEUR" }] },
];
const espnMembers = [
  { user_id: "espn:aaa", espn_id: "aaa", canonical_name: "Biff34", aliases: [{ name: "Biff34" }] },
  { user_id: "espn:old", espn_id: "old", canonical_name: "LeftIn2018", aliases: [{ name: "LeftIn2018" }] },
];
const espnSeats = [
  { season: "2018", roster_id: 3, owner_id: "espn:old", team_name: "Old Club" },
  { season: "2024", roster_id: 3, owner_id: "espn:aaa", team_name: "Gimmie The Goo" },
  { season: "2024", roster_id: 7, owner_id: "espn:aaa", team_name: "Other Slot" },
];

const person = buildBridge(espnMembers, sleeper, { "espn:zzz": "s-truman" }, espnSeats);
if (person["espn:aaa"] !== "s-biff") fail("Biff34 ESPN person should map to Sleeper Biff34");
if (person["espn:old"]) fail("departed manager must not invent a Sleeper seat");
if (person["espn:zzz"] !== "s-truman") fail("explicit pin must win");

const stemSleeper = [
  { user_id: "s-z", canonical_name: "ztrain123", aliases: [] },
  { user_id: "s-k", canonical_name: "kotula69", aliases: [] },
  { user_id: "s-t", canonical_name: "TaylorJohnson16", aliases: [] },
];
const stemEspn = [
  { user_id: "espn:z", canonical_name: "ztrain12", aliases: [{ name: "Zach Alavi" }] },
  { user_id: "espn:k", canonical_name: "kotulac27", aliases: [{ name: "chris kotula" }] },
  { user_id: "espn:j", canonical_name: "Taylor_DJohnson", aliases: [{ name: "Taylor Johnson" }] },
  { user_id: "espn:gone", canonical_name: "hudmorse", aliases: [{ name: "hud morse" }] },
];
const stem = buildBridge(stemEspn, stemSleeper, {}, []);
if (stem["espn:z"] !== "s-z") fail("ztrain12 stems onto ztrain123");
if (stem["espn:k"] !== "s-k") fail("kotula last name maps uniquely");
if (stem["espn:j"] !== "s-t") fail("Taylor Johnson last name maps uniquely");
if (stem["espn:gone"]) fail("hudmorse must stay ESPN-only until pinned");

const fanSleeper = [{ user_id: "s-tbow", canonical_name: "Tbow00", aliases: [{ name: "espnfan0776830917" }, { name: "Thatcher Bowers" }] }];
const fanEspn = [
  { user_id: "espn:nut", canonical_name: "ESPNFAN1357922193", aliases: [{ name: "Austin Durham" }] },
  { user_id: "espn:swin", canonical_name: "ESPNfan7396258614", aliases: [{ name: "Ricky Swink" }] },
  { user_id: "espn:tb", canonical_name: "espnfan0776830917", aliases: [{ name: "Thatcher Bowers" }] },
];
const fans = buildBridge(fanEspn, fanSleeper, {}, []);
if (fans["espn:tb"] !== "s-tbow") fail("Thatcher handle still maps to Tbow00");
if (fans["espn:nut"]) fail("Austin Durham must not ride the espnfan stem onto Tbow");
if (fans["espn:swin"]) fail("Ricky Swink must not ride the espnfan stem onto Tbow");

const dirtyTbow = [{
  user_id: "s-tbow2",
  canonical_name: "Tbow00",
  aliases: [
    { name: "Tbow (2022 Champ/2024 MP)", kind: "team_name" },
    { name: "Austin Durham", kind: "espn_display" },
    { name: "Ricky Swink", kind: "espn_display" },
  ],
}];
const dirtyEspn = [
  { user_id: "espn:nut2", canonical_name: "Austin Durham", aliases: [{ name: "Austin Durham" }] },
  { user_id: "espn:tb2", canonical_name: "espnfan0776830917", aliases: [{ name: "Thatcher Bowers" }] },
];
const dirty = buildBridge(dirtyEspn, dirtyTbow, { "espn:tb2": "s-tbow2" }, []);
if (dirty["espn:nut2"]) fail("polluted espn_display aliases on Tbow must not steal Durham");
if (dirty["espn:tb2"] !== "s-tbow2") fail("explicit Tbow pin still wins");

const gmPins = {
  "espn:{90C5E68F-9D70-442F-BC9A-166CEAB8036B}": "s-adizz",
  "espn:{47AFDC89-7278-40E5-909E-0ABC1E1CE345}": "s-fatass",
  "espn:{4636A1A4-B500-469B-85D5-11E5642D3B10}": "s-aball",
  "espn:{F3C43C4E-029B-4774-B558-02D6531A61B0}": "s-aball",
  "espn:{6D737882-6883-49E5-BEE2-DCB584C7394A}": "s-sbzy",
};
const pinSleeper = [
  { user_id: "s-adizz", canonical_name: "Adizzl3", aliases: [] },
  { user_id: "s-fatass", canonical_name: "fatassmexican", aliases: [] },
  { user_id: "s-aball", canonical_name: "Aballers", aliases: [] },
  { user_id: "s-sbzy", canonical_name: "sbzy11", aliases: [] },
];
const pinEspn = [
  { user_id: "espn:{90C5E68F-9D70-442F-BC9A-166CEAB8036B}", canonical_name: "Austin Durham" },
  { user_id: "espn:{47AFDC89-7278-40E5-909E-0ABC1E1CE345}", canonical_name: "modano913" },
  { user_id: "espn:{4636A1A4-B500-469B-85D5-11E5642D3B10}", canonical_name: "AB2official" },
  { user_id: "espn:{6D737882-6883-49E5-BEE2-DCB584C7394A}", canonical_name: "ShaneBrandes11" },
];
const pinnedPeople = buildBridge(pinEspn, pinSleeper, gmPins, []);
if (pinnedPeople["espn:{90C5E68F-9D70-442F-BC9A-166CEAB8036B}"] !== "s-adizz") fail("Durham pins to Adizzl3");
if (pinnedPeople["espn:{47AFDC89-7278-40E5-909E-0ABC1E1CE345}"] !== "s-fatass") fail("Tully pins to fatassmexican");
if (pinnedPeople["espn:{4636A1A4-B500-469B-85D5-11E5642D3B10}"] !== "s-aball") fail("AB2 pins to Aballers");
if (pinnedPeople["espn:{6D737882-6883-49E5-BEE2-DCB584C7394A}"] !== "s-sbzy") fail("Shane pins to sbzy11");

const franchise = buildFranchiseMap(espnSeats, person, { "espn-team:9": "s-truman" });
if (franchise["3"] !== "s-biff") fail("team 3 franchise should follow latest matched owner: " + franchise["3"]);
if (franchise["9"] !== "s-truman") fail("espn-team pin should attach that slot");

const oldWeek = resolveEspnScoreUid({ user_id: "espn:old", roster_id: 3, points: 22 }, person, franchise);
if (oldWeek !== "espn:old") fail("named leaver keeps their own year, got " + oldWeek);
const shaneYear = resolveEspnScoreUid(
  { user_id: "espn:{6D737882-6883-49E5-BEE2-DCB584C7394A}", roster_id: 6 },
  pinnedPeople,
  { 6: "s-sbzy" },
);
if (shaneYear !== "s-sbzy") fail("Shane 2024 person still maps to sbzy11");
const rickyYear = resolveEspnScoreUid(
  { user_id: "espn:{B0EF2A82-4834-4464-A821-849374CA853B}", roster_id: 6 },
  pinnedPeople,
  { 6: "s-sbzy" },
);
if (rickyYear !== "espn:{B0EF2A82-4834-4464-A821-849374CA853B}") {
  fail("Ricky 2020–22 on slot 6 must not become Shane, got " + rickyYear);
}
const pinned = resolveEspnScoreUid({ user_id: "", roster_id: 9, points: 80 }, person, franchise);
if (pinned !== "s-truman") fail("blank owner still follows an espn-team pin");

if (espnPlayoffHunt("WINNERS_BRACKET") !== true) fail("winners bracket is hunt");
if (espnPlayoffHunt("WINNERS") !== true) fail("WINNERS is hunt");
if (espnPlayoffHunt("WINNERS_CONSOLATION_LADDER") !== false) fail("3rd place is out");
if (espnPlayoffHunt("LOSERS_CONSOLATION_LADDER") !== false) fail("losers ladder is out");
if (espnPlayoffHunt("CONSOLATION") !== false) fail("consolation is out");
if (espnPhase(14, 15, "NONE") !== "regular") fail("regular week");
if (espnPhase(16, 15, "WINNERS_BRACKET") !== "playoff") fail("winners week is playoff");
if (espnPhase(18, 15, "") !== "playoff") fail("week after pws is playoff");
if (espnSidePoints({ totalPoints: 112.46 }, 3) !== 112.46) fail("totalPoints");
if (espnSidePoints({ totalPoints: 0, pointsByScoringPeriod: { 7: 88.2 } }, 7) !== 88.2) fail("period points");

const rows = espnScoresFromSchedule([
  {
    matchupPeriodId: 16,
    playoffTierType: "WINNERS_BRACKET",
    home: { teamId: 3, totalPoints: 140.1 },
    away: { teamId: 1, totalPoints: 99.4 },
  },
  {
    matchupPeriodId: 16,
    playoffTierType: "LOSERS_CONSOLATION_LADDER",
    home: { teamId: 4, totalPoints: 22.2 },
    away: { teamId: 5, totalPoints: 18.8 },
  },
], "2020", "espn:1:2020", new Map([[3, "espn:aaa"], [1, "espn:old"], [4, "espn:x"], [5, "espn:y"]]), 15);
const hunt = rows.filter((r) => r.hunt);
const out = rows.filter((r) => !r.hunt);
if (hunt.length !== 2) fail("only winners-bracket sides are hunt: " + hunt.length);
if (out.length !== 2) fail("consolation sides stay on tape but not hunt: " + out.length);
if (out.some((r) => r.points < 30 && r.hunt)) fail("consolation 22 must not be hunt");

console.log("PASS ESPN franchise + hunt laws");
