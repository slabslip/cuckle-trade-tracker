#!/usr/bin/env node
/** Pipeline door: player search + credit looks, add-only board tile. */
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
  fail("pipeline must keep DATA_V and SW cache");
}
if (!build.includes("build-pipeline.mjs")) {
  fail("build.mjs must run build-pipeline.mjs");
}
for (const need of [
  'id: "pipeline"',
  'lab: "Pipeline"',
  "function pipelinePortalHtml(",
  "function pipelinePlayerHtml(",
  'data-pipeline-q',
  'data-pipeline-pick',
  'data-pipeline-look',
  'getLeagueJson("pipeline.json")',
  "const DATA_DASH_MAX = 16",
  "Pipeline credit",
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  const doorIds = [...doors.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (doorIds.length !== 16 || defIds.length !== 16) {
    fail("DATA_DOORS / DEFAULT must be 16 tiles, got " + doorIds.length + "/" + defIds.length);
  }
  if (doorIds[15] !== "pipeline" || defIds[15] !== "pipeline") {
    fail("Pipeline must be door tile 16");
  }
  // Existing tiles stay put
  if (doorIds[11] !== "cornerstone_trades" || doorIds[10] !== "waiver_winners") {
    fail("must not replace waiver_winners / cornerstone_trades");
  }
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/pipeline.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.players) || book.players.length < 100) {
  fail("pipeline book missing players");
}
const puka = book.players.find((p) => /Puka Nacua/i.test(p.name || ""));
if (!puka || !puka.facts || !puka.facts.pipeline) fail("expected Puka Nacua pipeline credit");
if (!/ARae/i.test(puka.facts.pipeline.name || "")) {
  fail("Puka pipeline credit should be ARae, got " + (puka.facts.pipeline.name || ""));
}
const allen = book.players.find((p) => p.name === "Josh Allen");
if (!allen || !allen.facts.first_owned || allen.facts.first_owned.name !== "ARae") {
  fail("Josh Allen first owned should be ARae");
}

const design = "design-pipeline.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("pipeline")) fail(design + " must open pipeline");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Pipeline",
  doors: 16,
  n_players: book.n_players,
  puka: puka.facts.pipeline.name,
}));
