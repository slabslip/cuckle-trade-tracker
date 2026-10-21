#!/usr/bin/env node
/**
 * Season arcs rows must expand with scorecard, meaning, and year-by-year arcs.
 */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "dashboardReviewFixes20261021"')
  || !gen.includes('const DATA_V = "dashboardReviewFixes20261021"')
  || !sw.includes("chuckle-shell-v342-dashboard-review")) {
  fail("season arcs expand must bust DATA_V and SW");
}

for (const need of [
  "function seasonArcsDetailHtml(",
  "function seasonArcsMeaning(",
  "function seasonArcsYearRows(",
  'data-season-arcs-open="',
  'closest("[data-season-arcs-open]")',
  "What this means",
  "Year by year",
  "Tap a team for the scorecard",
]) {
  if (!page.includes(need)) fail("missing in index.html: " + need);
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/season-arcs.json", "utf8"),
);
const tip = (book.seats || [])[0];
if (!tip) fail("season-arcs book missing seats");

// Smoke the meaning + year helpers via Function extract.
function sliceFn(name) {
  const re = new RegExp("function " + name + "\\([\\s\\S]*?\\n    function ");
  const m = page.match(re);
  if (!m) fail("could not slice " + name);
  return m[0].replace(/\n    function $/, "\n");
}

const nth = (n) => {
  const v = Number(n);
  if (!v) return String(n);
  const m = v % 100;
  if (m >= 11 && m <= 13) return v + "th";
  return v + ({ 1: "st", 2: "nd", 3: "rd" }[v % 10] || "th");
};
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const prelude = [
  "var seasonArcsBook = " + JSON.stringify(book) + ";",
  "function nth(n){ return (" + nth.toString() + ")(n); }",
  "function esc(s){ return (" + esc.toString() + ")(s); }",
].join("\n");

const body = [
  sliceFn("seasonArcsArcLab"),
  sliceFn("seasonArcsPlaceLab"),
  sliceFn("seasonArcsYearRows"),
  sliceFn("seasonArcsMeaning"),
  sliceFn("seasonArcsDetailHtml"),
  "return { seasonArcsMeaning, seasonArcsDetailHtml, seasonArcsYearRows };",
].join("\n");

const api = new Function(prelude + "\n" + body)();
const meaning = api.seasonArcsMeaning(tip);
const years = api.seasonArcsYearRows(tip);
const html = api.seasonArcsDetailHtml(tip);

if (!meaning || meaning.indexOf("completed seasons") < 0) {
  fail("meaning should mention completed seasons: " + meaning);
}
if (!years.length) fail("expected year rows for lead seat");
if (html.indexOf("Scorecard") < 0 || html.indexOf("What this means") < 0
  || html.indexOf("Year by year") < 0 || html.indexOf("Slow burn") < 0) {
  fail("detail html missing sections");
}
if (html.indexOf(String(years[0].season)) < 0) {
  fail("detail html missing first year");
}

console.log(JSON.stringify({
  ok: true,
  seat: tip.name,
  years: years.length,
  meaning_chars: meaning.length,
  DATA_V: "seasonArcsExpand20261021",
}));
