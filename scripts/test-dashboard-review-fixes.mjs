#!/usr/bin/env node
/**
 * Dashboard review fixes: soft migrate pins, shared desk memo, crash guards.
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
  fail("review fixes page must keep DATA_V and SW cache");
}

for (const need of [
  "function homeDeskScoredRows(",
  "function homeDeskIdeaCacheKey(",
  "dataDashBandHitsCache",
  "Array.isArray(membersRaw)",
  "rows[i] && !rows[i].cuff_owned",
  "esc(String(fig",
  "softDrop",
]) {
  if (!page.includes(need)) fail("missing: " + need);
}

if (page.includes('src[src.length - 1] = "trade_helper"')) {
  fail("migrate must not clobber the last door for trade_helper");
}
if (page.includes('homeDeskTalk(myBag, theirBag, "")')) {
  fail("kickstart must not run a second open homeDeskTalk pass");
}
if (gen.includes('if (id === "firsts_held") {\n        return dataDashHead(spec, String(dataDashFirstsHeld())')) {
  fail("firsts_held tile branch should stay retired");
}
if (!fnIncludes(gen, "tradeHelperKickstartCards", "homeDeskScoredRows(")) {
  fail("kickstart must reuse homeDeskScoredRows");
}

function fnIncludes(src, name, needle) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) return false;
  const end = src.indexOf("\n    function ", start + 10);
  return src.slice(start, end > start ? end : start + 4000).includes(needle);
}

const start = page.indexOf("function dataDashMigrateMyPicks(");
const end = page.indexOf("\n    function dataDashBoardTiles(", start);
if (start < 0 || end < 0) fail("missing dataDashMigrateMyPicks");
const fnSrc = page.slice(start, end);

const DATA_DASH_MAX = 13;
const catalog = new Set([
  "projected_finish", "my_draft", "manager_archetypes", "season_arcs",
  "my_trades", "trade_helper", "league_trades", "league_draft",
  "profit_loss", "past_champions", "season_place",
  "week_scores", "best_ball_hype", "draft_board", "vs_you", "book_top", "firsts_held",
]);
function dataDashById(id) { return catalog.has(id) ? { id } : null; }
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
const migrate = new Function(
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
  const next = migrate(old);
  assert(next.indexOf("firsts_held") < 0, "firsts_held stripped");
  assert(next.indexOf("season_arcs") === 3, "season_arcs in top-4, got " + next.join(","));
  assert(next.indexOf("trade_helper") > next.indexOf("my_trades"),
    "trade_helper after my_trades, got " + next.join(","));
}

{
  const good = [
    "projected_finish", "my_draft", "manager_archetypes", "season_arcs",
    "my_trades", "trade_helper", "league_trades", "league_draft",
    "profit_loss", "past_champions", "season_place",
    "week_scores", "best_ball_hype",
  ];
  assert(migrate(good).join(",") === good.join(","), "good board must stay put");
}

{
  const legacy = [
    "projected_finish", "my_draft", "manager_archetypes", "season_arcs",
    "my_trades", "trade_helper", "league_trades", "league_draft",
    "profit_loss", "past_champions", "season_place",
    "week_scores", "draft_board",
  ];
  const next = migrate(legacy);
  assert(next[12] === "best_ball_hype", "legacy draft_board door becomes Best Ball Hype");
}

{
  const buried = [
    "projected_finish", "my_draft", "manager_archetypes", "my_trades",
    "league_trades", "league_draft", "profit_loss", "past_champions",
    "season_place", "week_scores", "draft_board", "season_arcs", "vs_you",
  ];
  const next = migrate(buried);
  assert(next.indexOf("season_arcs") < 4, "buried arcs lift into top-4 when soft slot exists");
  assert(next.indexOf("trade_helper") >= 0, "vs_you becomes trade_helper");
  assert(next.indexOf("manager_archetypes") === 2, "keep-top slot 2 stays");
}

{
  // Full board with softDrop below top-4: pin without wiping keep-top.
  const full = [
    "projected_finish", "my_draft", "manager_archetypes", "my_trades",
    "trade_helper", "league_trades", "league_draft", "profit_loss",
    "past_champions", "season_place", "week_scores", "draft_board", "book_top",
  ];
  const next = migrate(full);
  assert(next.indexOf("season_arcs") >= 0 && next.indexOf("season_arcs") < 4,
    "full softDrop board pins season_arcs in top-4, got " + next.join(","));
  assert(next[0] === "projected_finish" && next[1] === "my_draft" && next[2] === "manager_archetypes",
    "keep-top prefix preserved, got " + next.join(","));
}

console.log(JSON.stringify({ ok: true, softPin: true, deskMemo: true }));
