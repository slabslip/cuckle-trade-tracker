#!/usr/bin/env node
/** ESPN name / franchise attach + hunt tiers. Fail fast. */
import { inheritParkedToLive } from "../lib/espn-history.mjs";
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

const franchise = buildFranchiseMap(espnSeats, person, { "espn-team:9": "s-truman" });
if (franchise["3"] !== "s-biff") fail("team 3 franchise should follow latest matched owner: " + franchise["3"]);
if (franchise["9"] !== "s-truman") fail("espn-team pin should attach that slot");

const oldWeek = resolveEspnScoreUid({ user_id: "espn:old", roster_id: 3, points: 22 }, person, franchise);
if (oldWeek !== "s-biff") fail("leaver week on team 3 must attach to current Sleeper seat, got " + oldWeek);
const pinned = resolveEspnScoreUid({ user_id: "espn:ghost", roster_id: 9, points: 80 }, person, franchise);
if (pinned !== "s-truman") fail("pinned franchise week must attach");

const inherited = inheritParkedToLive({ 3: "s-biff", 4: "s-gone" }, [
  { season: "2025", owner_id: "s-gone", roster_id: 4 },
  { season: "2025", owner_id: "s-biff", roster_id: 3 },
  { season: "2026", owner_id: "s-new", roster_id: 4 },
  { season: "2026", owner_id: "s-biff", roster_id: 3 },
]);
if (inherited["4"] !== "s-new") fail("parked 2025 owner must hand ESPN slot to 2026 seat");
if (inherited["3"] !== "s-biff") fail("staying owner keeps their ESPN slot");

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
