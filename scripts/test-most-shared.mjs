#!/usr/bin/env node
/** Most shared door: players on the most different rosters. */
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
  fail("most shared must keep DATA_V and SW cache");
}
if (!build.includes("build-most-shared.mjs")) {
  fail("build.mjs must run build-most-shared.mjs");
}
for (const need of [
  'id: "most_shared"',
  'lab: "Most shared"',
  "function mostSharedDetailHtml(",
  'data-most-shared-open="',
  'closest("[data-most-shared-open]")',
  'getLeagueJson("most-shared.json")',
  "mostSharedOpenKey",
  "const DATA_DASH_MAX = 24",
  'src.splice(after + 1, 0, "most_shared")',
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  const doorIds = [...doors.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (doorIds.length !== 24 || defIds.length !== 24) {
    fail("DATA_DOORS / DEFAULT must be 24 tiles, got " + doorIds.length + "/" + defIds.length);
  }
  if (doorIds[22] !== "most_shared" || defIds[22] !== "most_shared") {
    fail("Most shared must be door tile 23");
  }
  if (doorIds[21] !== "median_monitor") fail("must not displace Median monitor");
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/most-shared.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.players) || book.players.length < 3) {
  fail("most-shared book missing players");
}
if (book.n !== book.players.length) fail("n must match players length");
if (!book.players.every((p) => p.rank && p.name && p.n_seats >= 2
  && Array.isArray(p.seats) && p.seats.length === p.n_seats)) {
  fail("each player needs rank/name/n_seats/seats");
}
const design = "design-most-shared.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("most_shared")) fail(design + " must open most_shared");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Most shared",
  doors: 24,
  n: book.n,
  top: book.players.slice(0, 3).map((p) => ({
    rank: p.rank,
    name: p.name,
    n_seats: p.n_seats,
    seat_lab: p.seat_lab,
  })),
}, null, 2));
