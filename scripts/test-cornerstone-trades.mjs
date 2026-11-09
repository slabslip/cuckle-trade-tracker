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
  "const DATA_DASH_MAX = 16",
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
if (Number(book.v) < 2 || book.pricing !== "trade_day_flatten"
  || !Array.isArray(book.trades) || book.trades.length !== 10) {
  fail("cornerstone-trades book missing v2 day-of flatten top-10");
}
if (!book.trades.every((t) => t.rank && t.asset && t.value != null && t.date
  && t.transaction_id && Array.isArray(t.sides) && t.sides.length >= 2
  && t.priced_as && t.priced_as <= t.date)) {
  fail("each cornerstone row needs asset/value/date/tx/sides/priced_as<=date");
}
if (book.trades.some((t) => t.kind !== "player")) {
  fail("cornerstone board must be players only");
}
if (book.trades.some((t) => /Davante Adams/i.test(t.asset || ""))) {
  fail("Davante Adams 2019 trade must not invent a 2020 first_snap price");
}
const lead = book.trades[0];
if (!/CeeDee Lamb/i.test(lead.asset || "") || lead.value < 8000 || lead.value > 9000) {
  fail("expected CeeDee Lamb as lead cornerstone (~8529 flatten), got "
    + lead.asset + "@" + lead.value);
}
// Recent trades must not use 30-day lookback (Caleb lookback was 7802; day-of ~7603).
const caleb = book.trades.find((t) => /Caleb Williams/i.test(t.asset || ""));
if (caleb && caleb.value >= 7800) {
  fail("Caleb Williams should be day-of flatten (~7603), not lookback 7802; got " + caleb.value);
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
  doors: 16,
  lead: lead.asset,
  value: lead.value,
  date: lead.date,
}));
