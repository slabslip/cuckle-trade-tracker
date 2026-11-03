#!/usr/bin/env node
/** Truman 4-of-6 into playoffs → Championship bracket on EF + Best Ball. */
import fs from "node:fs";
import { resolveTrumanFourOfSix } from "../lib/finish-scenario.mjs";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const ownerByRoster = {
  1: "u1", 2: "u2", 3: "u3", 4: "u4", 5: "u5",
  6: "u6", 7: "u7", 8: "u8", 9: "u9", 10: "u10",
};
const nameByUser = {
  u1: "SF69erss", u2: "TipsUp", u3: "ChiefGumby", u4: "ARae",
  u5: "KingHenryXXVI", u6: "bigjberg", u7: "TrumanCooper",
  u8: "BubbaCuckShremp", u9: "DarkWingDucks2023", u10: "TedCumberbatch",
};
const schedule = [
  { week: 9, a: 7, b: 10 },
  { week: 10, a: 7, b: 8 },
  { week: 11, a: 7, b: 6 },
  { week: 12, a: 7, b: 5 },
  { week: 13, a: 7, b: 4 },
  { week: 14, a: 7, b: 3 },
];
const sc = resolveTrumanFourOfSix({ ownerByRoster, nameByUser, schedule });
if (!sc || sc.rest_record !== "4-2" || sc.final_from_4_4 !== "8-6") {
  fail("scenario resolve failed: " + JSON.stringify(sc));
}

const ef = JSON.parse(fs.readFileSync("data/ui/projected-finish.json", "utf8"));
const bb = JSON.parse(fs.readFileSync("data/ui/best-ball-hype.json", "utf8"));
if (!ef.scenario || ef.scenario.id !== "truman_4of6") fail("EF missing scenario");
if (!bb.scenario || bb.scenario.id !== "truman_4of6") fail("BB missing scenario");
const tEf = (ef.seats || []).find((s) => s.name === "TrumanCooper");
const tBb = (bb.seats || []).find((s) => s.name === "TrumanCooper");
if (!tEf || Number(tEf.proj_finish) > 6) fail("EF Truman not Top 6");
if (!tBb || tBb.bracket !== "champ") fail("BB Truman not champ");

console.log(JSON.stringify({
  ok: true,
  final: sc.final_from_4_4,
  ef_proj: tEf.proj_finish,
  bb_seed: tBb.seed,
  bb_place: tBb.place_proj,
  path: sc.forced.map((f) => f.lab),
}));
