#!/usr/bin/env node
/** Trade FIRSTS door: seat picker → deals where that seat sent a first. */
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
  fail("trade firsts must keep DATA_V and SW cache");
}
if (!build.includes("build-trade-firsts.mjs")) {
  fail("build.mjs must run build-trade-firsts.mjs");
}
for (const need of [
  'id: "trade_firsts"',
  'lab: "Trade FIRSTS"',
  "function tradeFirstsPortalHtml(",
  'data-trade-firsts-seat="',
  'data-trade-firsts-back="',
  'closest("[data-trade-firsts-seat]")',
  'getLeagueJson("trade-firsts.json")',
  "receiptTradeFirstsSeat",
  "const DATA_DASH_MAX = 26",
  'src.splice(after + 1, 0, "trade_firsts")',
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  const doorIds = [...doors.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const defIds = [...def.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (doorIds.length !== 26 || defIds.length !== 26) {
    fail("DATA_DOORS / DEFAULT must be 26 tiles, got " + doorIds.length + "/" + defIds.length);
  }
  if (doorIds[25] !== "trade_firsts" || defIds[25] !== "trade_firsts") {
    fail("Trade FIRSTS must be door tile 26");
  }
  if (doorIds[24] !== "ass_denominator") fail("must not displace Ass denominator");
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/trade-firsts.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.seats) || book.seats.length < 2) {
  fail("trade-firsts book missing seats");
}
if (book.n !== book.seats.length) fail("n must match seats length");
const lead = book.seats[0];
if (!(lead && lead.n_firsts > 0 && Array.isArray(lead.trades) && lead.trades.length)) {
  fail("top seat needs firsts + trades");
}
if (!lead.trades.every((t) => t.transaction_id && Array.isArray(t.firsts_out) && t.firsts_out.length)) {
  fail("each trade needs transaction_id and firsts_out");
}
const design = "design-trade-firsts.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (!html.includes("trade_firsts")) fail(design + " must open trade_firsts");
}

console.log(JSON.stringify({
  ok: true,
  lab: "Trade FIRSTS",
  doors: 26,
  n: book.n,
  top: book.seats.slice(0, 3).map((s) => ({
    rank: s.rank,
    name: s.name,
    n_firsts: s.n_firsts,
    n_trades: s.n_trades,
  })),
}, null, 2));
