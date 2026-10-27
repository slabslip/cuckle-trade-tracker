#!/usr/bin/env node
/**
 * Expected Finish through official W7: live standings + PF/PA, with points-for
 * as the leading race indicator. Empty in-flight weeks must not mint ties.
 */
import fs from "node:fs";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const gen = fs.readFileSync("build-projected-finish.mjs", "utf8");
const review = fs.readFileSync("scripts/review-projected-finish-week.mjs", "utf8");
const lib = fs.readFileSync("lib/projected-finish.mjs", "utf8");

for (const need of [
  "bankWeek",
  "matchupsHavePoints",
  "applyWeekResults",
  "/state/nfl",
  "last_scored_leg",
]) {
  if (!gen.includes(need)) fail("build-projected-finish missing bank path: " + need);
}
if (!review.includes("hasPts") || !review.includes("Number(m && m.points) > 0")) {
  fail("review script must refuse all-zero in-flight matchups");
}
if (!lib.includes("RACE_PF_SHARE") || !lib.includes("RACE_STANDINGS_SHARE")) {
  fail("projected-finish must export PF-leading race split");
}
if (!/RACE_PF_SHARE = 0\.55/.test(lib) || !/RACE_STANDINGS_SHARE = 0\.45/.test(lib)) {
  fail("race split must keep PF ahead of standings (0.55 / 0.45)");
}

const pf = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/projected-finish.json", "utf8"),
);
const ui = JSON.parse(fs.readFileSync("data/ui/projected-finish.json", "utf8"));
if (Number(pf.week) !== 7) fail("league projected-finish week must be 7, got " + pf.week);
if (Number(ui.week) !== 7) fail("data/ui projected-finish week must be 7, got " + ui.week);
if (Number(pf.rule?.race_pf_share) <= Number(pf.rule?.race_standings_share)) {
  fail("book rule must keep PF share ahead of standings share");
}
if ((pf.seats || []).some((s) => Number(s.ties) > 0)) {
  fail("official W7 book must not carry fake in-flight ties");
}

const byName = Object.fromEntries((pf.seats || []).map((s) => [s.name, s]));
const tips = byName.TipsUp;
const arae = byName.ARae;
const henry = byName.KingHenryXXVI;
const ted = byName.TedCumberbatch;
if (!tips || !arae || !henry || !ted) fail("missing core seats");
if (!(tips.pf > arae.pf)) fail("Tips PF should beat ARae PF");
if (!(tips.proj_finish < arae.proj_finish)) {
  fail("PF leading indicator: Tips (high PF, 3-4) must project ahead of ARae (low PF, 4-3)");
}
if (Number(henry.wins) !== 6 || Number(ted.wins) !== 6) {
  fail("official W7 standings: Henry and Ted should be 6-1");
}
if (Number(henry.place_now) !== 1) {
  fail("Henry should own place_now #1 on official W7 (got #" + henry.place_now + ")");
}

// Intent sanity (same as review loop).
for (const s of pf.seats || []) {
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
const archTips = (arch.seats || []).find((s) => s.name === "TipsUp");
if (!archTips || Number(archTips.live_proj_finish) !== Number(tips.proj_finish)) {
  fail("manager-archetypes Tips live_proj must match EF book");
}

console.log(JSON.stringify({
  ok: true,
  week: pf.week,
  race_pf_share: pf.rule.race_pf_share,
  tips_proj: tips.proj_finish,
  tips_pf: tips.pf,
  arae_proj: arae.proj_finish,
  arae_pf: arae.pf,
  henry_place: henry.place_now,
  henry_record: henry.record,
  board: (pf.seats || []).map((s) => ({
    proj: s.proj_finish,
    place: s.place_now,
    name: s.name,
    record: s.record,
    pf: s.pf,
    band: s.band,
  })),
}));
