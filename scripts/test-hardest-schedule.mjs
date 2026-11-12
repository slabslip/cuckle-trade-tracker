#!/usr/bin/env node
/** Hardest remaining schedule door: full-league SoS rank + slate expand. */
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
  fail("hardest schedule must keep DATA_V and SW cache");
}
if (!build.includes("build-hardest-schedule.mjs")) {
  fail("build.mjs must run build-hardest-schedule.mjs after projected-finish");
}
if (build.indexOf("build-projected-finish.mjs") > build.indexOf("build-hardest-schedule.mjs")) {
  fail("hardest-schedule must rebuild after projected-finish");
}
for (const need of [
  'id: "hardest_schedule"',
  'lab: "Toughest schedule"',
  "function hardestScheduleDetailHtml(",
  'data-hardest-schedule-open="',
  'closest("[data-hardest-schedule-open]")',
  'getLeagueJson("hardest-schedule.json")',
  "hardestScheduleOpenKey",
  "Every seat ranked hardest",
  "const DATA_DASH_MAX = 22",
  'src.splice(after + 1, 0, "hardest_schedule")',
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  const doorIds = [...doors.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (doorIds.length !== 22 || defIds.length !== 22) {
    fail("DATA_DOORS / DEFAULT must be 22 tiles, got " + doorIds.length + "/" + defIds.length);
  }
  if (doorIds[17] !== "hardest_schedule" || defIds[17] !== "hardest_schedule") {
    fail("Hardest remaining schedule must be door tile 18");
  }
  if (doorIds[16] !== "closest_games") fail("must not displace Closest games");
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/hardest-schedule.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.seats) || book.seats.length < 2) {
  fail("hardest-schedule book missing seats");
}
if (book.n !== book.seats.length) fail("n must match seats length");
if (!(Array.isArray(book.remaining_weeks) && book.remaining_weeks.length)) {
  fail("remaining_weeks required");
}
if (!book.seats.every((s) => s.rank && s.name && s.sos != null && s.sos_lab
  && Array.isArray(s.opponents))) {
  fail("each seat needs rank/name/sos/sos_lab/opponents");
}
const soses = book.seats.map((s) => Number(s.sos));
for (let i = 1; i < soses.length; i++) {
  if (soses[i] > soses[i - 1] + 1e-9) fail("seats not sorted hardest-first by sos");
}

const design = "design-hardest-schedule.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("hardest_schedule")) fail(design + " must open hardest_schedule");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Toughest schedule",
  doors: 22,
  n: book.n,
  remaining_weeks: book.remaining_weeks,
  top: book.seats.slice(0, 3).map((s) => ({
    rank: s.rank,
    name: s.name,
    sos: s.sos,
    sos_lab: s.sos_lab,
  })),
  softest: {
    rank: book.seats[book.seats.length - 1].rank,
    name: book.seats[book.seats.length - 1].name,
    sos: book.seats[book.seats.length - 1].sos,
    sos_lab: book.seats[book.seats.length - 1].sos_lab,
  },
}));
