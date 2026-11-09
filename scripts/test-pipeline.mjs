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
if (!build.includes("build-player-starts.mjs")) {
  fail("build.mjs must run build-player-starts.mjs before pipeline");
}
for (const need of [
  'id: "pipeline"',
  'lab: "Pipeline"',
  "function pipelinePortalHtml(",
  "function pipelinePlayerHtml(",
  'data-pipeline-q',
  'data-pipeline-pick',
  'data-pipeline-cat',
  'getLeagueJson("pipeline.json")',
  "const DATA_DASH_MAX = 16",
  "Discovered",
  "Developed",
  "function pipelineCatId(",
  "function pipelineCreditForCat(",
  "data-pipeline-pos",
  "pipeline-pos-list",
  "fantasy rank (PPR)",
  "function pipelinePosBoard(",
  "function pipelineWinnerStatus(",
  ".pipeline-owner.held",
  ".pipeline-owner.trade",
  ".pipeline-owner.drop",
  "still owns",
  "traded away",
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
if (Number(book.v) < 3 || !Array.isArray(book.players) || book.players.length < 100) {
  fail("pipeline book missing players (need v>=3 with pos ranks)");
}
if (!book.rule || !/0\.50 starts/.test(book.rule.metric || "")) {
  fail("pipeline rule must weight starts at 0.50");
}
if (!book.positions || book.positions.join(",") !== "QB,RB,WR,TE") {
  fail("pipeline book must list QB/RB/WR/TE positions");
}
{
  const wr = book.players
    .filter((p) => p.pos === "WR" && p.pos_rank != null)
    .sort((a, b) => a.pos_rank - b.pos_rank);
  if (wr.length < 10) fail("expected WR season ranks, got " + wr.length);
  if (wr[0].pos_rank !== 1 || !(wr[0].season_pts > 0)) {
    fail("WR #1 missing season pts");
  }
  for (let i = 1; i < Math.min(wr.length, 8); i++) {
    if (wr[i].season_pts > wr[i - 1].season_pts) {
      fail("WR ranks not ordered by season pts");
    }
  }
}
const startsRaw = "data/leagues/1315431339301806080/raw/player_starts.json";
if (!fs.existsSync(startsRaw)) fail("missing " + startsRaw);
const startsBook = JSON.parse(fs.readFileSync(startsRaw, "utf8"));
if (!startsBook.n_rows || startsBook.n_rows < 1000) {
  fail("player_starts tape too thin: " + startsBook.n_rows);
}
const puka = book.players.find((p) => /Puka Nacua/i.test(p.name || ""));
if (!puka || !puka.facts || !puka.facts.pipeline) fail("expected Puka Nacua pipeline credit");
if (!puka.facts.most_started || !(puka.facts.most_started.starts > 0)) {
  fail("Puka should have most_started from lineup tape");
}
if (!/started/i.test(puka.facts.pipeline.because || "")) {
  fail("Puka pipeline because should mention starts");
}
if (puka.facts.pipeline.owner_status !== "held" || !puka.facts.pipeline.still_owns) {
  fail("Puka pipeline winner should still own (held)");
}
const aj = book.players.find((p) => /A\.J\. Green/i.test(p.name || ""));
if (!aj || aj.facts.pipeline.owner_status !== "drop") {
  fail("A.J. Green pipeline winner should be drop status");
}
const cd = book.players.find((p) => p.name === "CeeDee Lamb");
if (!cd || cd.facts.pipeline.owner_status !== "trade") {
  fail("CeeDee Lamb pipeline winner should be trade status");
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
  n_start_rows: startsBook.n_rows,
  puka: puka.facts.pipeline.name,
  puka_starts: puka.facts.pipeline.starts,
  puka_most_started: puka.facts.most_started.name,
}));
