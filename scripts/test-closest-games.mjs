#!/usr/bin/env node
/** Closest games door: top 10 nailbiters + year impact expand. */
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
  fail("closest games must keep DATA_V and SW cache");
}
if (!build.includes("build-closest-games.mjs")) {
  fail("build.mjs must run build-closest-games.mjs");
}
for (const need of [
  'id: "closest_games"',
  'lab: "Closest games"',
  "function closestGamesDetailHtml(",
  'data-closest-games-open="',
  'closest("[data-closest-games-open]")',
  'getLeagueJson("closest-games.json")',
  "closestGamesOpenKey",
  "Top 10 closest matches",
  "const DATA_DASH_MAX = 22",
  'src.splice(after + 1, 0, "closest_games")',
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  const doorIds = [...doors.matchAll(/"([a-z0_9_]+)"/g)].map((m) => m[1]);
  const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (doorIds.length !== 22 || defIds.length !== 22) {
    fail("DATA_DOORS / DEFAULT must be 22 tiles, got " + doorIds.length + "/" + defIds.length);
  }
  if (doorIds[16] !== "closest_games" || defIds[16] !== "closest_games") {
    fail("Closest games must be door tile 17");
  }
  if (doorIds[15] !== "pipeline") fail("must not displace Pipeline");
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/closest-games.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.games) || book.games.length < 5) {
  fail("closest-games book missing games");
}
if (book.games.length > 10) fail("top list must be at most 10");
if (!book.games.every((g) => g.rank && g.season != null && g.week != null
  && g.margin != null && g.a && g.b && Array.isArray(g.years))) {
  fail("each game needs rank/season/week/margin/a/b/years");
}
const margins = book.games.map((g) => Number(g.margin));
for (let i = 1; i < margins.length; i++) {
  if (margins[i] < margins[i - 1] - 1e-9) fail("games not sorted by margin");
}
if (!(book.n_games >= book.games.length)) fail("n_games should cover scanned set");

const design = "design-closest-games.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("closest_games")) fail(design + " must open closest_games");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Closest games",
  doors: 22,
  n_games: book.n_games,
  top: book.games.slice(0, 3).map((g) => ({
    rank: g.rank,
    margin: g.margin,
    season: g.season,
    week: g.week,
    a: g.a.name,
    b: g.b.name,
  })),
}));
