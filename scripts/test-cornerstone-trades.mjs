#!/usr/bin/env node
/**
 * Cornerstone trades door: top 10 highest-value players at time of trade.
 */
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
  fail("cornerstone trades must keep DATA_V and SW cache");
}
if (!build.includes("build-cornerstone-trades.mjs")) {
  fail("build.mjs must run build-cornerstone-trades.mjs");
}
for (const need of [
  'id: "cornerstone_trades"',
  'lab: "Cornerstone trades"',
  "function cornerstoneTradesDetailHtml(",
  'data-cornerstone-trades-open="',
  'closest("[data-cornerstone-trades-open]")',
  'getLeagueJson("cornerstone-trades.json")',
  "cornerstoneTradesOpenKey",
  "Cornerstone trades: one flat top-10",
  "day they traded",
  "const DATA_DASH_MAX = 15",
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  const doorIds = [...doors.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (doorIds.length !== 15 || defIds.length !== 15) {
    fail("DATA_DOORS / DEFAULT must be 15 tiles, got " + doorIds.length + "/" + defIds.length);
  }
  if (doorIds[11] !== "cornerstone_trades" || defIds[11] !== "cornerstone_trades") {
    fail("Cornerstone trades must be door tile 12");
  }
  const research = (page.match(/const DATA_DASH_RESEARCH = \[([\s\S]*?)\];/) || [])[1] || "";
  if (!research.includes('"cornerstone_trades"')) {
    fail("Cornerstone trades must sit on DATA_DASH_RESEARCH");
  }
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/cornerstone-trades.json", "utf8"),
);
if (Number(book.v) < 1 || book.pricing !== "trade_meter_t0"
  || !Array.isArray(book.trades) || book.trades.length !== 10) {
  fail("cornerstone-trades book missing top-10 t0 board");
}
if (!book.trades.every((t) => t.rank && t.asset && t.value != null && t.date
  && t.transaction_id && Array.isArray(t.sides) && t.sides.length >= 2)) {
  fail("each cornerstone row needs asset/value/date/tx/sides");
}
if (book.trades.some((t) => t.kind !== "player")) {
  fail("cornerstone board must be players only");
}
const lead = book.trades[0];
if (!/CeeDee Lamb/i.test(lead.asset || "") || lead.value < 7000) {
  fail("expected CeeDee Lamb as lead cornerstone (~8518), got "
    + lead.asset + "@" + lead.value);
}
if (!lead.sides.some((s) => (s.got || []).some((g) => /CeeDee/i.test(g.label || "")))) {
  fail("lead trade sides must include CeeDee in a got bag");
}

const design = "design-cornerstone-trades.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (html.includes("src=share")) fail(design + " must not use src=share");
  if (!html.includes("cornerstone_trades")) fail(design + " must open cornerstone_trades");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Cornerstone trades",
  doors: 15,
  lead: lead.asset,
  value: lead.value,
  date: lead.date,
}));
