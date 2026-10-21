#!/usr/bin/env node
/** Who has firsts must stay off Data board, library, and Home chips. */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "') || !sw.includes("chuckle-shell-v")) {
  fail("no-firsts-held page must keep DATA_V and SW cache");
}

for (const bad of [
  'lab: "Who has firsts"',
  'data-dash-open="firsts_held"',
  '"firsts_held", "season_arcs"',
]) {
  if (page.includes(bad)) fail("still on Data/Home: " + bad);
}

const def = page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/);
if (!def) fail("missing DATA_DASH_DEFAULT");
if (def[1].includes("firsts_held")) fail("default board still has firsts_held");
if (!def[1].includes('"manager_archetypes"') || !def[1].includes('"draft_board"')) {
  fail("default board should use manager_archetypes + draft_board");
}

const mig = page.slice(page.indexOf("function dataDashMigrateMyPicks("),
  page.indexOf("function dataDashBoardTiles("));
if (!mig.includes('src.indexOf("firsts_held")') || !mig.includes("src.splice")) {
  fail("migrate must strip firsts_held from saved boards");
}

console.log(JSON.stringify({ ok: true, DATA_V: "noFirstsHeld20261021" }));
