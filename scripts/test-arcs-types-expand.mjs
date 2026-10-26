#!/usr/bin/env node
/**
 * Season arcs + Manager types rows must expand with plain English,
 * scorecards, and full explanations anyone can finish: "so this means ___".
 */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "') || !sw.includes("chuckle-shell-v")) {
  fail("arcs/types expand page must keep DATA_V and SW cache");
}

for (const need of [
  "function seasonArcsDetailHtml(",
  "function seasonArcsVerdict(",
  "function seasonArcsUse(",
  "function seasonArcsMeaning(",
  "function managerArchetypesDetailHtml(",
  'data-season-arcs-open="',
  'data-manager-arch-open="',
  'closest("[data-season-arcs-open]")',
  'closest("[data-manager-arch-open]")',
  "In plain English",
  "Every season",
  "Numbers behind the label",
  "All manager types",
  "Tap a seat for plain English",
  "Tap a seat for what the label means",
]) {
  if (!page.includes(need)) fail("missing in index.html: " + need);
}

const arcs = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/season-arcs.json", "utf8"),
);
const arch = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/manager-archetypes.json", "utf8"),
);
const tip = (arcs.seats || [])[0];
const archSeat = (arch.seats || [])[0];
if (!tip || !archSeat) fail("books missing seats");
if (!archSeat.plain || !archSeat.use) fail("archetype seats need plain + use fields");

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
  "var seasonArcsBook = " + JSON.stringify(arcs) + ";",
  "var managerArchetypesBook = " + JSON.stringify(arch) + ";",
  "function nth(n){ return (" + nth.toString() + ")(n); }",
  "function esc(s){ return (" + esc.toString() + ")(s); }",
].join("\n");

const body = [
  sliceFn("seasonArcsArcLab"),
  sliceFn("seasonArcsPlaceLab"),
  sliceFn("seasonArcsYearRows"),
  sliceFn("seasonArcsVerdict"),
  sliceFn("seasonArcsUse"),
  sliceFn("seasonArcsMeaning"),
  sliceFn("seasonArcsDetailHtml"),
  sliceFn("managerArchetypesDetailHtml"),
  "return { seasonArcsVerdict, seasonArcsDetailHtml, seasonArcsYearRows, managerArchetypesDetailHtml };",
].join("\n");

const api = new Function(prelude + "\n" + body)();
const verdict = api.seasonArcsVerdict(tip);
const years = api.seasonArcsYearRows(tip);
const arcsHtml = api.seasonArcsDetailHtml(tip);
const archHtml = api.managerArchetypesDetailHtml(archSeat);

if (!verdict || verdict.indexOf(tip.name) < 0) fail("verdict should name the seat: " + verdict);
if (!years.length) fail("expected year rows");
if (arcsHtml.indexOf("In plain English") < 0 || arcsHtml.indexOf("Every season") < 0
  || arcsHtml.indexOf("So what:") < 0) {
  fail("season arcs detail missing plain sections");
}
if (archHtml.indexOf("In plain English") < 0 || archHtml.indexOf("Numbers behind the label") < 0
  || archHtml.indexOf("All manager types") < 0 || archHtml.indexOf(archSeat.lab) < 0) {
  fail("manager type detail missing sections");
}
// Stranger test: expand copy must not lean on opaque internals alone.
for (const bad of ["Δ≥", "t0", "adj_pyth", "μ_full"]) {
  if (arcsHtml.includes(bad) || archHtml.includes(bad)) {
    fail("opaque token leaked into expand HTML: " + bad);
  }
}

console.log(JSON.stringify({
  ok: true,
  arcs_seat: tip.name,
  arch_seat: archSeat.name,
  arch_lab: archSeat.lab,
  years: years.length,
  verdict_chars: verdict.length,
}));
