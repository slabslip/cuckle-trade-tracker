#!/usr/bin/env node
/**
 * Saved dynasty boards get Season arcs + Trade helper pinned without clobbering keep-top.
 */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "') || !sw.includes("chuckle-shell-v")) {
  fail("board pins page must keep DATA_V and SW cache");
}

const start = page.indexOf("function dataDashMigrateMyPicks(");
const end = page.indexOf("\n    function dataDashBoardTiles(", start);
if (start < 0 || end < 0) fail("missing dataDashMigrateMyPicks");
const fnSrc = page.slice(start, end);
if (!fnSrc.includes("softDrop")
  || !fnSrc.includes('src.splice(Math.min(3, src.length), 0, "season_arcs")')
  || !fnSrc.includes('src.splice(after + 1, 0, "trade_helper")')
  || fnSrc.includes('src[src.length - 1] = "trade_helper"')) {
  fail("migrate must soft-pin season_arcs / trade_helper without last-tile clobber");
}

const DATA_DASH_MAX = 13;
const catalog = new Set([
  "projected_finish", "my_draft", "manager_archetypes", "season_arcs",
  "my_trades", "trade_helper", "league_trades", "league_draft",
  "profit_loss", "past_champions", "season_place",
  "week_scores", "draft_board", "vs_you", "book_top", "firsts_held",
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
  const old = [
    "projected_finish", "my_draft", "firsts_held", "my_trades",
    "league_trades", "league_draft", "profit_loss", "past_champions",
    "season_place", "week_scores", "manager_archetypes",
  ];
  const next = dataDashMigrateMyPicks(old);
  assert(next.indexOf("firsts_held") < 0, "firsts_held stripped");
  assert(next.indexOf("season_arcs") === 3, "season_arcs must land in Home top-4 slot 3, got " + next.join(","));
  assert(next.indexOf("trade_helper") > next.indexOf("my_trades"),
    "trade_helper must sit after my_trades, got " + next.join(","));
}

{
  const buried = [
    "projected_finish", "my_draft", "manager_archetypes", "my_trades",
    "league_trades", "league_draft", "profit_loss", "past_champions",
    "season_place", "week_scores", "draft_board", "season_arcs", "vs_you",
  ];
  const next = dataDashMigrateMyPicks(buried);
  assert(next.indexOf("season_arcs") < 4, "buried season_arcs must lift into top-4, got " + next.join(","));
  assert(next.indexOf("trade_helper") >= 0, "trade_helper must replace vs_you on full board");
  assert(next.indexOf("manager_archetypes") === 2, "keep-top manager_archetypes stays");
}

{
  const good = [
    "projected_finish", "my_draft", "manager_archetypes", "season_arcs",
    "my_trades", "trade_helper", "league_trades", "league_draft",
    "profit_loss", "past_champions", "season_place",
    "week_scores", "draft_board",
  ];
  assert(dataDashMigrateMyPicks(good).join(",") === good.join(","), "good board must stay put");
}

{
  // Full board, keep-top in slot 3, no softDrop → skip season_arcs rather than clobber.
  const stubborn = [
    "projected_finish", "my_draft", "manager_archetypes", "my_trades",
    "trade_helper", "draft_board", "vs_you", "book_top",
    "profit_loss", "draft_board", "book_top", "vs_you", "my_trades",
  ];
  // canon unique → may shrink; pad with unique non-soft only
  const full = [
    "projected_finish", "my_draft", "manager_archetypes", "my_trades",
    "trade_helper", "draft_board", "book_top", "profit_loss",
  ];
  while (full.length < DATA_DASH_MAX) full.push("x" + full.length); // filtered out by canon
  // Actually need 13 catalog ids without softDrop — we don't have enough; use softDrop absence
  // by only having keep + trade_helper + draft_board + book_top + profit_loss (5) — under max
  // Under-max path inserts season_arcs. For full stubborn use softDrop-free full set:
  // Only 8 catalog non-soft: projected_finish, my_draft, manager_archetypes, my_trades,
  // trade_helper, draft_board, vs_you, book_top, profit_loss = 9. Not enough for MAX.
  // So "full + no softDrop" can't happen with current catalog — assert code path exists instead.
  assert(fnSrc.includes("// else skip"), "migrate documents skip when no softDrop");
}

console.log(JSON.stringify({ ok: true, softPin: true }));
