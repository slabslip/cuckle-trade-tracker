#!/usr/bin/env node
/** Median monitor door: H2H + vs-median standings for this season. */
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
  fail("median monitor must keep DATA_V and SW cache");
}
if (!build.includes("build-median-monitor.mjs")) {
  fail("build.mjs must run build-median-monitor.mjs");
}
for (const need of [
  'id: "median_monitor"',
  'lab: "Median monitor"',
  "function medianMonitorDetailHtml(",
  'data-median-monitor-open="',
  'closest("[data-median-monitor-open]")',
  'getLeagueJson("median-monitor.json")',
  "medianMonitorOpenKey",
  "Extra Game vs League Median",
  "const DATA_DASH_MAX = 25",
  'src.splice(after + 1, 0, "median_monitor")',
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  const doorIds = [...doors.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (doorIds.length !== 25 || defIds.length !== 25) {
    fail("DATA_DOORS / DEFAULT must be 25 tiles, got " + doorIds.length + "/" + defIds.length);
  }
  if (doorIds[21] !== "median_monitor" || defIds[21] !== "median_monitor") {
    fail("Median monitor must be door tile 22");
  }
  if (doorIds[20] !== "past_champions") fail("must not displace Past champions");
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/median-monitor.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.seats) || book.seats.length < 2) {
  fail("median-monitor book missing seats");
}
if (book.n !== book.seats.length) fail("n must match seats length");
if (!(Array.isArray(book.weeks) && book.weeks.length)) fail("weeks required");
if (!book.seats.every((s) => s.rank && s.name && s.combined_record && s.h2h_record
  && s.median_record && Array.isArray(s.weeks))) {
  fail("each seat needs rank/name/records/weeks");
}
// Top half of scores each week should earn a median W (even N → half above).
for (const wm of book.week_medians || []) {
  if (wm.n % 2 === 0 && wm.above + wm.below + (wm.ties || 0) !== wm.n) {
    fail("week median counts must cover all teams");
  }
}
const design = "design-median-monitor.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("median_monitor")) fail(design + " must open median_monitor");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Median monitor",
  doors: 22,
  season: book.season,
  weeks: book.weeks,
  n: book.n,
  top: book.seats.slice(0, 3).map((s) => ({
    rank: s.rank,
    name: s.name,
    combined: s.combined_record,
    h2h: s.h2h_record,
    median: s.median_record,
    place_h2h: s.place_h2h,
    delta: s.delta_lab,
  })),
  movers: book.seats
    .filter((s) => s.place_delta)
    .map((s) => ({ name: s.name, delta: s.delta_lab, h2h: s.place_h2h, med: s.place_combined })),
}));
