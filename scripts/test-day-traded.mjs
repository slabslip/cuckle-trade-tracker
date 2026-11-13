#!/usr/bin/env node
/** Day traded door: players most added + dropped on the wire. */
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
  fail("day traded must keep DATA_V and SW cache");
}
if (!build.includes("build-day-traded.mjs")) {
  fail("build.mjs must run build-day-traded.mjs");
}
for (const need of [
  'id: "day_traded"',
  'lab: "Day traded"',
  "function dayTradedDetailHtml(",
  'data-day-traded-open="',
  'closest("[data-day-traded-open]")',
  'getLeagueJson("day-traded.json")',
  "dayTradedOpenKey",
  "const DATA_DASH_MAX = 24",
  'src.splice(after + 1, 0, "day_traded")',
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
  if (doorIds[23] !== "day_traded" || defIds[23] !== "day_traded") {
    fail("Day traded must be door tile 24");
  }
  if (doorIds[22] !== "most_shared") fail("must not displace Most shared");
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/day-traded.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.players) || book.players.length < 3) {
  fail("day-traded book missing players");
}
if (book.n !== book.players.length) fail("n must match players length");
if (!book.players.every((p) => p.rank && p.name && p.churn >= 1
  && p.adds != null && p.drops != null && Array.isArray(p.recent))) {
  fail("each player needs rank/name/adds/drops/churn/recent");
}
const design = "design-day-traded.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("day_traded")) fail(design + " must open day_traded");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Day traded",
  doors: 24,
  n: book.n,
  top: book.players.slice(0, 3).map((p) => ({
    rank: p.rank,
    name: p.name,
    adds: p.adds,
    drops: p.drops,
    churn: p.churn,
  })),
}, null, 2));
