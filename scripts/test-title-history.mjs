#!/usr/bin/env node
import { enrichTitleHistory, fptsRankInSeason, lastPlaceUnlocks } from "../lib/title-history.mjs";

function fail(msg) {
  console.error("TITLE-HISTORY FAIL: " + msg);
  process.exit(1);
}

const standings = [
  { season: "2024", user_id: "biff", name: "Biff34", place: 9, wins: 6, losses: 8, fpts: 1390 },
  { season: "2024", user_id: "poop", name: "modano913", place: 1, wins: 9, losses: 5, fpts: 1518 },
  { season: "2024", user_id: "tb", name: "TB", place: 4, wins: 11, losses: 3, fpts: 1742 },
  { season: "2023", user_id: "poop", name: "modano913", place: 1, wins: 7, losses: 7, fpts: 1521 },
  { season: "2023", user_id: "biff", name: "Biff34", place: 2, wins: 8, losses: 6, fpts: 1600 },
  { season: "2025", user_id: "biff", name: "Biff34", place: 1, wins: 7, losses: 7, fpts: 1665 },
];
if (fptsRankInSeason(standings.filter((r) => r.season === "2024"), "tb") !== 1) {
  fail("TB is 1st in 2024 points");
}
if (fptsRankInSeason(standings.filter((r) => r.season === "2024"), "poop") !== 2) {
  fail("modano is 2nd in 2024 points");
}

const titles = [
  { season: "2025", user_id: "biff", name: "Biff34", provider: "sleeper", record: { fpts_rank: 1 }, prior: null, repeat: null, thesis: "keep me" },
  { season: "2024", user_id: "poop", name: "modano913", provider: "espn", record: { wins: 9, losses: 5, fpts: 1518 }, prior: null, repeat: null, final_missing: "espn_history" },
  { season: "2023", user_id: "poop", name: "modano913", provider: "espn", record: { wins: 7, losses: 7, fpts: 1521 }, prior: null, repeat: null, final_missing: "espn_history" },
];
enrichTitleHistory(titles, standings);
const biff = titles[0];
const poop24 = titles[1];
const poop23 = titles[2];
if (biff.thesis !== "keep me") fail("Sleeper thesis stays");
if (!biff.prior || biff.prior.place !== 9 || biff.prior.season !== "2024") {
  fail("Biff 2025 prior is 2024 9th: " + JSON.stringify(biff.prior));
}
if (poop24.record.fpts_rank !== 2) fail("2024 champ fpts_rank is 2: " + poop24.record.fpts_rank);
if (poop24.repeat !== "repeat") fail("2023+2024 is back-to-back: " + poop24.repeat);
if (poop23.repeat) fail("2023 is not a repeat");
if (!/bracket from 2nd/.test(poop24.thesis) || !/Repeat/.test(poop24.thesis)) {
  fail("ESPN thesis names the bracket win and repeat: " + poop24.thesis);
}

const sackos = lastPlaceUnlocks({
  seats: [
    { user_id: "tru", name: "TrumanCooper", places: [{ season: "2025", place: 10 }] },
    { user_id: "diz", name: "Adizzl3", places: [{ season: "2025", place: 12 }] },
    { user_id: "alav", name: "ALAV", places: [{ season: "2024", place: 12 }] },
  ],
});
if (sackos.length !== 2) fail("one sacko per year: " + JSON.stringify(sackos));
if (sackos.find((r) => r.season === "2025").name !== "Adizzl3") fail("2025 last is Adizzl3, not 10th");
if (sackos.find((r) => r.season === "2024").name !== "ALAV") fail("2024 last is ALAV");

console.log("PASS title-history: ranks, prior, repeat, sacko from worst place");
