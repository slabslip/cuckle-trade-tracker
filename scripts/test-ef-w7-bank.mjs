#!/usr/bin/env node
/**
 * Expected Finish must bank the in-flight NFL week (W7) with race intent —
 * nightly must not wipe Truman (playoff_hunt) back to a W6 #10.
 */
import fs from "node:fs";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const gen = fs.readFileSync("build-projected-finish.mjs", "utf8");
for (const need of [
  "bankWeek",
  "matchupsHavePoints",
  "applyWeekResults",
  "/state/nfl",
  "last_scored_leg",
]) {
  if (!gen.includes(need)) fail("build-projected-finish missing bank path: " + need);
}

const pf = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/projected-finish.json", "utf8"),
);
const ui = JSON.parse(fs.readFileSync("data/ui/projected-finish.json", "utf8"));
if (Number(pf.week) !== 7) fail("league projected-finish week must be 7, got " + pf.week);
if (Number(ui.week) !== 7) fail("data/ui projected-finish week must be 7, got " + ui.week);
if (!String(pf.note || "").includes("banked")) {
  fail("W7 book note should say banked (got: " + pf.note + ")");
}

const seats = pf.seats || [];
const byName = Object.fromEntries(seats.map((s) => [s.name, s]));
const truman = byName.TrumanCooper;
if (!truman) fail("TrumanCooper missing from EF book");
if (truman.race_intent !== "playoff_hunt") {
  fail("Truman race_intent must be playoff_hunt, got " + truman.race_intent);
}
if (Number(truman.proj_finish) >= 10) {
  fail("Truman must not be proj #10 after W7 bank (got #" + truman.proj_finish + ")");
}
if (Number(truman.proj_finish) > 8) {
  fail("Truman playoff_hunt should sit Mid/Early mid-pack, not #" + truman.proj_finish);
}

// Intent board sanity: tanks not Late top-3; win_now not Early buried.
for (const s of seats) {
  if (s.race_intent === "tank" && s.band === "Late" && s.proj_finish <= 3) {
    fail(s.name + " tank Late top-3");
  }
  if (s.race_intent === "win_now" && s.proj_finish >= 9) {
    fail(s.name + " win_now buried at #" + s.proj_finish);
  }
}

const arch = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/manager-archetypes.json", "utf8"),
);
const archT = (arch.seats || []).find((s) => s.name === "TrumanCooper");
if (!archT || Number(archT.live_proj_finish) >= 10) {
  fail("manager-archetypes Truman live_proj must track restored EF (<10)");
}

console.log(JSON.stringify({
  ok: true,
  week: pf.week,
  truman_proj: truman.proj_finish,
  truman_band: truman.band,
  truman_record: truman.record,
  arch_live_proj: archT.live_proj_finish,
}));
