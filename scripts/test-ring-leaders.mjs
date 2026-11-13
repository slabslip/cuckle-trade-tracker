#!/usr/bin/env node
/** Ring leaders door: top 25 championship rings + title teams. */
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
  fail("ring leaders must keep DATA_V and SW cache");
}
if (!build.includes("build-ring-leaders.mjs")) {
  fail("build.mjs must run build-ring-leaders.mjs");
}
for (const need of [
  'id: "ring_leaders"',
  'lab: "Ring leaders"',
  "function ringLeadersDetailHtml(",
  'data-ring-leaders-open="',
  'closest("[data-ring-leaders-open]")',
  'getLeagueJson("ring-leaders.json")',
  "ringLeadersOpenKey",
  "Top 25 players by league championship rings",
  "const DATA_DASH_MAX = 25",
  'src.splice(after + 1, 0, "ring_leaders")',
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
  if (doorIds[18] !== "ring_leaders" || defIds[18] !== "ring_leaders") {
    fail("Ring leaders must be door tile 19");
  }
  if (doorIds[17] !== "hardest_schedule") fail("must not displace Toughest schedule");
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/ring-leaders.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.players) || book.players.length < 5) {
  fail("ring-leaders book missing players");
}
if (book.players.length > 25) fail("top list must be at most 25");
if (!book.players.every((p) => p.rank && p.player && p.rings != null
  && Array.isArray(p.teams) && Array.isArray(p.titles))) {
  fail("each row needs rank/player/rings/teams/titles");
}
const rings = book.players.map((p) => Number(p.rings));
for (let i = 1; i < rings.length; i++) {
  if (rings[i] > rings[i - 1] + 1e-9) fail("players not sorted by rings desc");
}

const design = "design-ring-leaders.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("ring_leaders")) fail(design + " must open ring_leaders");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Ring leaders",
  doors: 22,
  n_players: book.n_players,
  top: book.players.slice(0, 5).map((p) => ({
    rank: p.rank,
    player: p.player,
    rings: p.rings,
    teams: p.teams,
  })),
}));
