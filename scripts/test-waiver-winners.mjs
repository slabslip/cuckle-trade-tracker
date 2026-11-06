#!/usr/bin/env node
/**
 * Waiver winners door: 14th League Data slot, top 10 pickup→today + peak.
 */
import fs from "node:fs";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const build = fs.readFileSync("build.mjs", "utf8");

if (!page.includes('const DATA_V = "') || !/^const CACHE = "chuckle-shell-v\d+/m.test(sw)) {
  fail("waiver winners must keep DATA_V and SW cache");
}
if (!build.includes("build-best-waiver-pickups.mjs")) {
  fail("build.mjs must run build-best-waiver-pickups.mjs");
}
for (const need of [
  'id: "waiver_winners"',
  'lab: "Waiver winners"',
  'getLeagueJson("best-waiver-pickups.json")',
  "bestWaiverPickupsBook",
  'band("Pickup → today", "top"',
  'band("Pickup → peak", "bot"',
  'src[passedAt] = "waiver_winners"',
  "Pickup → today is today's curve",
  "const DATA_DASH_MAX = 14",
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  const doorIds = [...doors.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (doorIds.length !== 14 || defIds.length !== 14) {
    fail("DATA_DOORS / DEFAULT must be 14 tiles, got " + doorIds.length + "/" + defIds.length);
  }
  if (doorIds[10] !== "waiver_winners" || defIds[10] !== "waiver_winners") {
    fail("Waiver winners must be door tile 11");
  }
  if (!doors.includes('"waiver_winners"') || def.includes('"best_waiver_pickups"')) {
    fail("doors must use waiver_winners id");
  }
  const research = (page.match(/const DATA_DASH_RESEARCH = \[([\s\S]*?)\];/) || [])[1] || "";
  if (!research.includes('"waiver_winners"')) {
    fail("Waiver winners must sit on DATA_DASH_RESEARCH");
  }
}
if (!gen.includes('if (id === "best_waiver_pickups") return "waiver_winners"')) {
  fail("receiptDoorCanon must alias best_waiver_pickups → waiver_winners");
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/best-waiver-pickups.json", "utf8"),
);
if (Number(book.v) < 2 || !Array.isArray(book.to_today) || !Array.isArray(book.to_peak)) {
  fail("best-waiver-pickups book missing v2 to_today / to_peak");
}
if (book.to_today.length !== 10 || book.to_peak.length !== 10) {
  fail("each board must be top 10");
}
if (!book.rule || !/drafted-then-dropped/i.test(String(book.rule.origin || ""))) {
  fail("book rule must require original waiver/FA entry");
}
// Drafted-first stars must not appear (Anthony Richardson was a draft then later claim).
if (book.to_peak.some((r) => /Anthony Richardson/i.test(r.player || ""))) {
  fail("drafted-first players must not rank on Waiver winners");
}
if (!page.includes("drafted then dropped then claimed does not count")
  && !gen.includes("drafted then dropped then claimed does not count")) {
  fail("caption must spell out original-waiver-only rule");
}

const design = "design-waiver-winners.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (html.includes("src=share")) fail(design + " must not use src=share");
  if (!html.includes("waiver_winners")) fail(design + " must open waiver_winners");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Waiver winners",
  doors: 14,
  today_lead: book.to_today[0].player,
  delta: book.to_today[0].delta,
}));
