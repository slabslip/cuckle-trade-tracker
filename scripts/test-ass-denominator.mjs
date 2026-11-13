#!/usr/bin/env node
/** Ass denominator door: players held longest on the worst rosters. */
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
  fail("ass denominator must keep DATA_V and SW cache");
}
if (!build.includes("build-ass-denominator.mjs")) {
  fail("build.mjs must run build-ass-denominator.mjs");
}
for (const need of [
  'id: "ass_denominator"',
  'lab: "Ass denominator"',
  "function assDenominatorDetailHtml(",
  'data-ass-denominator-open="',
  'closest("[data-ass-denominator-open]")',
  'getLeagueJson("ass-denominator.json")',
  "assDenominatorOpenKey",
  "const DATA_DASH_MAX = 25",
  'src.splice(after + 1, 0, "ass_denominator")',
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
  if (doorIds[24] !== "ass_denominator" || defIds[24] !== "ass_denominator") {
    fail("Ass denominator must be door tile 25");
  }
  if (doorIds[23] !== "day_traded") fail("must not displace Day traded");
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/ass-denominator.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.players) || book.players.length < 3) {
  fail("ass-denominator book missing players");
}
if (book.n !== book.players.length) fail("n must match players length");
if (!book.players.every((p) => p.rank && p.name && p.bad_days > 0
  && Array.isArray(p.seats) && p.seats.length >= 1)) {
  fail("each player needs rank/name/bad_days/seats");
}
const design = "design-ass-denominator.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("ass_denominator")) fail(design + " must open ass_denominator");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Ass denominator",
  doors: 25,
  n: book.n,
  top: book.players.slice(0, 3).map((p) => ({
    rank: p.rank,
    name: p.name,
    bad_days: p.bad_days,
    seat_lab: p.seat_lab,
  })),
}, null, 2));
