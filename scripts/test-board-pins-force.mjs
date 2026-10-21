#!/usr/bin/env node
/**
 * Saved dynasty boards must get Season arcs (Home top-4) + Trade helper pinned.
 */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "boardPinsForce20261021"')
  || !gen.includes('const DATA_V = "boardPinsForce20261021"')
  || !sw.includes("chuckle-shell-v335-board-pins-force")) {
  fail("boardPinsForce must bust DATA_V and SW cache");
}

const start = page.indexOf("function dataDashMigrateMyPicks(");
const end = page.indexOf("\n    function dataDashBoardTiles(", start);
if (start < 0 || end < 0) fail("missing dataDashMigrateMyPicks");
const fnSrc = page.slice(start, end);
if (!fnSrc.includes('src.splice(Math.min(3, src.length), 0, "season_arcs")')
  || !fnSrc.includes('src.splice(3, 0, "season_arcs")')
  || !fnSrc.includes('src.splice(after + 1, 0, "trade_helper")')) {
  fail("migrate must force-pin season_arcs (top-4) and trade_helper");
}

const DATA_DASH_MAX = 13;
const DATA_DASH_MIN = 6;
const catalog = new Set([
  "projected_finish", "my_draft", "firsts_held", "season_arcs",
  "my_trades", "trade_helper", "league_trades", "league_draft",
  "profit_loss", "past_champions", "season_place",
  "week_scores", "manager_archetypes", "vs_you", "book_top",
]);

function dataDashById(id) {
  return catalog.has(id) ? { id } : null;
}
function isRedraftLeague() { return false; }
function dataDashCanon(tiles) {
  const seen = {};
  const out = [];
  for (const raw of tiles || []) {
    const id = String(raw || "");
    if (!id || seen[id] || !dataDashById(id)) continue;
    seen[id] = true;
    out.push(id);
    if (out.length >= DATA_DASH_MAX) break;
  }
  return out;
}

// eslint-disable-next-line no-new-func
const dataDashMigrateMyPicks = new Function(
  "DATA_DASH_MAX", "dataDashById", "isRedraftLeague", "dataDashCanon",
  `${fnSrc}\nreturn dataDashMigrateMyPicks;`,
)(DATA_DASH_MAX, dataDashById, isRedraftLeague, dataDashCanon);

function assert(cond, msg) {
  if (!cond) fail(msg);
}

{
  // Old saved board: no season_arcs, no trade_helper (common remote seat_data_dash).
  const old = [
    "projected_finish", "my_draft", "firsts_held", "my_trades",
    "league_trades", "league_draft", "profit_loss", "past_champions",
    "season_place", "week_scores", "manager_archetypes",
  ];
  const next = dataDashMigrateMyPicks(old);
  assert(next.indexOf("season_arcs") === 3, "season_arcs must land in Home top-4 slot 3, got " + next.join(","));
  assert(next.indexOf("trade_helper") === next.indexOf("my_trades") + 1,
    "trade_helper must sit after my_trades, got " + next.join(","));
}

{
  // Full board with season_arcs buried below top-4 — lift it.
  const buried = [
    "projected_finish", "my_draft", "firsts_held", "my_trades",
    "league_trades", "league_draft", "profit_loss", "past_champions",
    "season_place", "week_scores", "manager_archetypes", "season_arcs", "vs_you",
  ];
  const next = dataDashMigrateMyPicks(buried);
  assert(next.indexOf("season_arcs") === 3, "buried season_arcs must move to slot 3, got " + next.join(","));
  assert(next.indexOf("trade_helper") >= 0, "trade_helper must replace vs_you on full board");
}

{
  // Already correct — stay stable.
  const good = [
    "projected_finish", "my_draft", "firsts_held", "season_arcs",
    "my_trades", "trade_helper", "league_trades", "league_draft",
    "profit_loss", "past_champions", "season_place",
    "week_scores", "manager_archetypes",
  ];
  assert(dataDashMigrateMyPicks(good).join(",") === good.join(","), "good board must stay put");
}

console.log(JSON.stringify({
  ok: true,
  DATA_V: "boardPinsForce20261021",
  CACHE: "chuckle-shell-v335-board-pins-force",
}));
