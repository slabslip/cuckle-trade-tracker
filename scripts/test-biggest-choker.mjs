#!/usr/bin/env node
/**
 * Biggest choker door: top 10 season chokes (playoff miss / title loss).
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
  fail("biggest choker must keep DATA_V and SW cache");
}
if (!build.includes("build-biggest-choker.mjs")) {
  fail("build.mjs must run build-biggest-choker.mjs");
}
for (const need of [
  'id: "biggest_choker"',
  'lab: "Biggest choker"',
  "function biggestChokerDetailHtml(",
  'data-biggest-choker-open="',
  'closest("[data-biggest-choker-open]")',
  'getLeagueJson("biggest-choker.json")',
  "biggestChokerOpenKey",
  "Top 10 season chokes",
  "Biggest choker: one flat top-10",
  ".list-row > .row-x",
  "position: static; flex: 0 0 auto; margin-top: 12px",
  'src[champAt] = "biggest_choker"',
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const src = page.includes("function dataListBandsHtml(") ? page : gen;
  const start = src.indexOf("function dataListBandsHtml(");
  const end = src.indexOf("\n    function ", start + 10);
  const bands = src.slice(start, end < 0 ? start + 4000 : end);
  if (!bands.includes("Biggest choker: one flat top-10")
    || bands.includes('band("Biggest each year"')
    || bands.includes('band("Also choked"')) {
    fail("Biggest choker must stay one flat list — no year / also-choked bands");
  }
  const itemsStart = src.indexOf("function dataListItems(");
  const itemsEnd = src.indexOf("\n    function ", itemsStart + 10);
  const items = src.slice(itemsStart, itemsEnd < 0 ? itemsStart + 8000 : itemsEnd);
  const chokeAt = items.indexOf('canon === "biggest_choker"');
  const chokeBlock = chokeAt >= 0 ? items.slice(chokeAt, chokeAt + 900) : "";
  if (!chokeBlock || chokeBlock.includes('band: s.year_biggest ? "top" : "bot"')) {
    fail("biggest_choker list items must not set top/bot bands");
  }
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  if (!doors.includes('"biggest_choker"') || !def.includes('"biggest_choker"')) {
    fail("Biggest choker must sit on DATA_DOORS + DATA_DASH_DEFAULT");
  }
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/biggest-choker.json", "utf8"),
);
if (Number(book.v) < 2 || !Array.isArray(book.seats) || book.seats.length < 5) {
  fail("biggest-choker book missing seats");
}
if (book.seats.length > 10) fail("top list must be at most 10");
if (!book.seats.every((s) => s.rank && s.season && s.name && s.kind && s.thesis && s.score != null)) {
  fail("each choke row needs rank/season/name/kind/thesis/score");
}
const kinds = new Set(book.seats.map((s) => s.kind));
if (!kinds.has("playoff_miss") || !kinds.has("title_loss")) {
  fail("book should include playoff_miss and title_loss rows");
}
const titleRows = book.seats.filter((s) => s.kind === "title_loss");
if (!titleRows.length || !titleRows.every((s) => Array.isArray(s.went_off) && s.went_off.length)) {
  fail("title_loss rows need went_off scorers");
}
{
  const start = page.indexOf("function biggestChokerDetailHtml(");
  const end = page.indexOf("\n    function ", start + 10);
  const detail = start >= 0 ? page.slice(start, end < 0 ? start + 2500 : end) : "";
  if (!detail || detail.includes("Score ranks how locked")) {
    fail("choke summaries must not keep the score-rank caption");
  }
  if (!detail.includes("Went off for the winner")) {
    fail("detail must surface winner went-off scorers");
  }
}
const yearLeaders = book.seats.filter((s) => s.year_biggest);
if (yearLeaders.length < 3) fail("expected several year-biggest rows");
if (!book.seats.slice(0, yearLeaders.length).every((s) => s.year_biggest)) {
  fail("year leaders must list first");
}

const design = "design-biggest-choker.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (html.includes("src=share")) fail(design + " must not use src=share");
}

const lead = book.seats[0];
console.log(JSON.stringify({
  ok: true,
  n: book.seats.length,
  lead: lead.name,
  season: lead.season,
  kind: lead.kind,
  score: lead.score,
  year_biggest_n: yearLeaders.length,
}));
