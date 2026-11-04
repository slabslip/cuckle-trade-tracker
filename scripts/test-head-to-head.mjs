#!/usr/bin/env node
/**
 * Head to head door: two-seat picker + all-time W-L book.
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
  fail("head to head must keep DATA_V and SW cache");
}
if (!build.includes("build-head-to-head.mjs")) {
  fail("build.mjs must run build-head-to-head.mjs");
}
for (const need of [
  'id: "head_to_head"',
  'lab: "Head to head"',
  "function headToHeadCompareHtml(",
  "function headToHeadPickerHtml(",
  'data-h2h-pick="',
  'closest("[data-h2h-pick]")',
  'data-h2h-back="',
  ">Clear</button>",
  'getLeagueJson("head-to-head.json")',
  "receiptH2hA",
  "receiptH2hB",
  'src[placeAt] = "head_to_head"',
  "Pick two seats",
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const start = page.indexOf("function receiptWhoListHtml(");
  const end = page.indexOf("\n    function ", start + 10);
  const who = start >= 0 ? page.slice(start, end < 0 ? start + 8000 : end) : "";
  if (!who.includes(">Clear</button>") || who.includes(">← Teams</button>")) {
    fail("Head to head must use Clear, not stepped ← Teams");
  }
}
{
  const clickStart = page.indexOf('const h2hBackBtn = e.target.closest("[data-h2h-back]")');
  const clickEnd = page.indexOf("const h2hPickBtn", clickStart);
  const clickBlock = clickStart >= 0 && clickEnd > clickStart
    ? page.slice(clickStart, clickEnd) : "";
  if (!clickBlock.includes('receiptH2hA = ""') || !clickBlock.includes('receiptH2hB = ""')
    || /if \(receiptH2hB\)/.test(clickBlock)) {
    fail("Clear must wipe both seats in one tap");
  }
}
{
  const reportStart = page.indexOf("const DATA_REPORTS = [");
  const reportEnd = page.indexOf("];", reportStart);
  const reports = page.slice(reportStart, reportEnd);
  if (!reports.includes('lab: "Head to head"') || reports.includes("HEAD TO HEAD")) {
    fail("lab must stay sentence case Head to head");
  }
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  if (doors.includes('"head_to_head"')) {
    fail("Head to head stays off the locked 13 default doors (library + soft-pin)");
  }
  const research = (page.match(/const DATA_DASH_RESEARCH = \[([\s\S]*?)\];/) || [])[1] || "";
  if (!research.includes('"head_to_head"')) {
    fail("Head to head must sit on DATA_DASH_RESEARCH");
  }
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/biggest-choker.json".replace("biggest-choker", "head-to-head"), "utf8"),
);
if (Number(book.v) < 1 || !book.pairs || !Array.isArray(book.seats) || book.seats.length < 8) {
  fail("head-to-head book missing seats/pairs");
}
if (Object.keys(book.pairs).length < 20) fail("expected many career pairs");
const named = book.seats.every((s) => s.name && !/^\d{10,}$/.test(s.name));
if (!named) fail("seat names must be display names, not raw user ids");
const sample = book.pairs[Object.keys(book.pairs)[0]];
if (!sample || sample.games < 1 || !Array.isArray(sample.by_season)) {
  fail("pair rows need games + by_season");
}

const design = "design-head-to-head.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (html.includes("src=share")) fail(design + " must not use src=share");
  if (!html.includes("head_to_head")) fail(design + " must open head_to_head");
}

console.log(JSON.stringify({
  ok: true,
  n_seats: book.seats.length,
  n_pairs: Object.keys(book.pairs).length,
  sample_games: sample.games,
}));
