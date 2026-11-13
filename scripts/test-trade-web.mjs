#!/usr/bin/env node
/** Trade web door: search a player → full league lineage web. */
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
  fail("trade web must keep DATA_V and SW cache");
}
if (!build.includes("build-trade-web.mjs")) fail("build.mjs must run build-trade-web.mjs");
for (const need of [
  'id: "trade_web"',
  'lab: "Trade web"',
  "function tradeWebPortalHtml(",
  "function tradeWebPlayerHtml(",
  "function tradeWebGraphSvg(",
  "function tradeWebBuildGraph(",
  "function tradeWebPnlStrip(",
  "function tradeWebShareNow(",
  "function tradeWebZoomBy(",
  "function tradeWebEnsureFull(",
  "function tradeWebActiveWeb(",
  "tradeWebFocusKey",
  'data-trade-web-q',
  'data-trade-web-pick="',
  "data-trade-web-zoom=",
  "data-trade-web-share=",
  "data-trade-web-stage",
  "data-trade-web-focus=",
  "data-trade-web-open=",
  'getLeagueJson("trade-web.json")',
  "tradeWebPickKey",
  "Number(tradeWebRaw.v) >= 3",
  "const DATA_DASH_MAX = 22",
  'src.splice(after + 1, 0, "trade_web")',
  "trade-web-svg",
  "Copy full web",
  "Building full web",
  "data-trade-web-full-w=",
  "pinch to zoom",
  "function tradeWebDealDate(",
  "function tradeWebDealLabel(",
  "tw-node-date",
  "date on the deal",
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
if (!gen.includes("maxGraph")
  || !gen.includes("data-trade-web-full-w")
  || !gen.includes("data-trade-web-full-h")
  || !gen.includes("Full trade web — pinch to zoom")) {
  fail("share must fit the full SVG viewBox into the export (not the on-screen viewport)");
}
// Deal hubs must carry date on the bubble — not as the main label between assets.
if (gen.includes('label: (node.exit && node.exit.date) || "trade"')
  || gen.includes("label: web.date || \"trade\"")
  || gen.includes("label: (rn.exit && rn.exit.date) || web.date || \"trade\"")) {
  fail("trade hubs must not use raw ISO dates as the bubble label");
}
if (!gen.includes('lab: ""') || !gen.includes("tradeWebDealLabel(")) {
  fail("deal edges should stay unlabeled; date/destination live on the trade bubble");
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  const doorIds = [...doors.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (doorIds.length !== 22 || defIds.length !== 22) {
    fail("DATA_DOORS / DEFAULT must be 22 tiles, got " + doorIds.length + "/" + defIds.length);
  }
  if (doorIds[19] !== "trade_web" || defIds[19] !== "trade_web") {
    fail("Trade web must be door tile 20");
  }
  if (doorIds[18] !== "ring_leaders") fail("must not displace Ring leaders");
}

const leagueUi = "data/leagues/1315431339301806080/ui";
const book = JSON.parse(fs.readFileSync(leagueUi + "/trade-web.json", "utf8"));
if (Number(book.v) < 3 || !Array.isArray(book.players) || book.players.length < 10) {
  fail("trade-web book missing players (v3+)");
}
const golden = book.players.find((p) => String(p.player_id) === "12501"
  || String(p.name).toLowerCase().includes("matthew golden"));
if (!golden || !golden.full) fail("Matthew Golden index/full path missing");
if (golden.origin_lab !== "TrumanCooper") fail("Golden origin should be TrumanCooper");
if (golden.now_lab !== "SF69erss") fail("Golden now should be SF69erss");

const fullPath = leagueUi + "/" + golden.full;
if (!fs.existsSync(fullPath)) fail("missing full Golden web " + fullPath);
const full = JSON.parse(fs.readFileSync(fullPath, "utf8"));
const web = full.web;
if (!web || !web.root_node) fail("Golden full web missing root_node");
if (web.origin?.seat !== "TrumanCooper") fail("Golden exit should be TrumanCooper");
if (web.now?.seat !== "SF69erss") fail("Golden now should be SF69erss");
const branches = web.branches || (web.root_node && web.root_node.children) || [];
if (!branches.some((b) => /Ridley/i.test(b.label))) fail("Golden bag should include Ridley");
if (!branches.some((b) => /Bell/i.test(b.label))) fail("Golden bag should include Bell");
if (web.gave_value == null || web.got_value == null) fail("Golden web needs deal values");
if (web.deal_pnl == null) fail("Golden web needs deal_pnl");
if (web.graph) fail("trade-web book must omit graph (rebuild in UI)");
if (!branches.some((b) => b.value_in != null)) {
  fail("Golden branches need value_in on connectors");
}

const bucky = book.players.find((p) => String(p.player_id) === "11584"
  || String(p.name).toLowerCase().includes("bucky irving"));
if (!bucky || !bucky.full) fail("Bucky Irving index/full path missing");
if (Number(bucky.n_hops) < 2) fail("Bucky should have 2+ hops across managers");
if (bucky.origin_lab !== "BubbaCuckShremp") fail("Bucky origin should be BubbaCuckShremp");
if (bucky.now_lab !== "DarkWingDucks2023") fail("Bucky now should be DarkWingDucks2023");
const buckyFull = JSON.parse(fs.readFileSync(leagueUi + "/" + bucky.full, "utf8")).web;
if (!buckyFull?.spine || buckyFull.spine.length < 3) fail("Bucky spine should show Bubba→Truman→DarkWing");
if (!(buckyFull.root_node?.children || []).length) fail("Bucky full package tree missing");

const design = "design-trade-web.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("trade_web")) fail(design + " must open trade_web");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Trade web",
  doors: 22,
  n_players: book.n_players,
  golden: {
    origin: web.origin?.seat,
    now: web.now?.seat,
    n_hops: web.n_hops,
    gave_value: web.gave_value,
    got_value: web.got_value,
    deal_pnl: web.deal_pnl,
    trail_pnl: web.trail_pnl,
    branches: branches.map((b) => ({
      label: b.label,
      status: b.status,
      value_in: b.value_in,
      mark_pnl: b.mark_pnl,
    })),
  },
  bucky: {
    origin: buckyFull.origin?.seat,
    now: buckyFull.now?.seat,
    n_hops: buckyFull.n_hops,
    spine: (buckyFull.spine || []).map((s) => s.seat),
    package_kids: (buckyFull.root_node?.children || []).length,
  },
}));
