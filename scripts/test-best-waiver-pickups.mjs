#!/usr/bin/env node
/**
 * Best waiver pickups door: top 10 pickup→today + top 10 pickup→peak.
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
  fail("best waiver pickups must keep DATA_V and SW cache");
}
if (!build.includes("build-best-waiver-pickups.mjs")) {
  fail("build.mjs must run build-best-waiver-pickups.mjs");
}
for (const need of [
  'id: "best_waiver_pickups"',
  'lab: "Best waiver pickups"',
  'getLeagueJson("best-waiver-pickups.json")',
  "bestWaiverPickupsBook",
  'band("Pickup → today", "top"',
  'band("Pickup → peak", "bot"',
  'src[passedAt] = "best_waiver_pickups"',
  "Pickup → today is today's curve",
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  if (doors.includes('"best_waiver_pickups"')) {
    fail("Best waiver pickups must soft-pin — not steal a locked DATA_DOORS slot");
  }
  const research = (page.match(/const DATA_DASH_RESEARCH = \[([\s\S]*?)\];/) || [])[1] || "";
  if (!research.includes('"best_waiver_pickups"')) {
    fail("Best waiver pickups must sit on DATA_DASH_RESEARCH");
  }
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/best-waiver-pickups.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.to_today) || !Array.isArray(book.to_peak)) {
  fail("best-waiver-pickups book missing to_today / to_peak");
}
if (book.to_today.length !== 10 || book.to_peak.length !== 10) {
  fail("each board must be top 10, got today=" + book.to_today.length + " peak=" + book.to_peak.length);
}
for (const row of book.to_today.concat(book.to_peak)) {
  if (!row.rank || !row.player || !row.date || row.delta == null || row.pickup_value == null) {
    fail("each row needs rank/player/date/delta/pickup_value");
  }
  if (row.delta <= 0) fail("top lists must be positive lifts only");
}
if (book.to_today[0].delta < book.to_today[9].delta) fail("to_today must be sorted biggest first");
if (book.to_peak[0].delta < book.to_peak[9].delta) fail("to_peak must be sorted biggest first");
{
  const ids = new Set(book.to_today.map((r) => r.player_id));
  if (ids.size !== book.to_today.length) fail("to_today must be one row per player");
}

const design = "design-best-waiver-pickups.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (html.includes("src=share")) fail(design + " must not use src=share");
  if (!html.includes("best_waiver_pickups")) fail(design + " must open best_waiver_pickups");
}

const lead = book.to_today[0];
console.log(JSON.stringify({
  ok: true,
  today_lead: lead.player,
  delta: lead.delta,
  picker: lead.picker,
  peak_lead: book.to_peak[0].player,
  peak_delta: book.to_peak[0].delta,
}));
