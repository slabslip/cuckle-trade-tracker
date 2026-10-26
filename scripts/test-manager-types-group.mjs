#!/usr/bin/env node
/**
 * Manager type door groups seats by archetype label — never Top/Bottom 5 ranks.
 */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "managerTypesGroup20261026"')
  || !gen.includes('const DATA_V = "managerTypesGroup20261026"')
  || !sw.includes("chuckle-shell-v290-manager-types-group")) {
  fail("manager types group ship must bust DATA_V and SW");
}

for (const need of [
  "Manager type: group by archetype",
  "Seats grouped by the same manager type",
  "(by type)",
  "typeLab",
  "typeId",
]) {
  if (!page.includes(need)) fail("missing in index.html: " + need);
}

function sliceFn(name) {
  const re = new RegExp("function " + name + "\\([\\s\\S]*?\\n    function ");
  const m = page.match(re);
  if (!m) fail("could not slice " + name);
  return m[0].replace(/\n    function $/, "\n");
}

const arch = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/manager-archetypes.json", "utf8"),
);
const seats = arch.seats || [];
if (seats.length < 6) fail("need enough archetype seats to group");

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
  "var managerArchetypesBook = " + JSON.stringify(arch) + ";",
  "var projectedFinishBook = null;",
  "var seasonArcsBook = null;",
  "var receiptListSlice = \"\";",
  "var receiptListWho = \"\";",
  "function receiptDoorCanon(id){ return id; }",
  "function dataListRowWrap(id, item, inner){ return '<div class=\"list-row\">' + inner + '</div>'; }",
  "function dataTileShareBtn(){ return ''; }",
  "function seatLabel(name){ return String(name || ''); }",
  "function nth(n){ return (" + nth.toString() + ")(n); }",
  "function esc(s){ return (" + esc.toString() + ")(s); }",
].join("\n");

const body = [
  sliceFn("dataListItems"),
  sliceFn("dataListPickSlice"),
  sliceFn("dataListBandsHtml"),
  "return { dataListItems, dataListBandsHtml };",
].join("\n");

const api = new Function(prelude + "\n" + body)();
const items = api.dataListItems("manager_archetypes");
if (!items.length) fail("manager type list empty");
if (items.some((r) => r.rank != null)) fail("manager type rows must not carry rank");
if (!items.every((r) => r.typeId && r.typeLab)) fail("manager type rows need typeId + typeLab");

const html = api.dataListBandsHtml("manager_archetypes", items, function (r) {
  return '<div class="names">' + esc(r.name) + "</div>";
});

if (html.includes(">Top 5<") || html.includes(">Bottom 5<") || html.includes(">Also<")) {
  fail("manager type bands must not use Top/Bottom/Also rank labels");
}
if (html.includes('data-share-slice="top"') || html.includes('data-share-slice="bot"')) {
  fail("manager type type-bands must not offer top/bot share slices");
}

const labs = [...new Set(items.map((r) => r.typeLab))];
for (const lab of labs) {
  if (!html.includes(">" + lab + "<") && !html.includes(">" + esc(lab) + "<")) {
    fail("missing type band for " + lab);
  }
}

const race = items.filter((r) => r.typeId === "win_now_race");
if (race.length >= 2) {
  // All race favorites must sit under one band block, not split by rank.
  const re = /data-list-band="win_now_race"[\s\S]*?<\/div>\s*(?=<div class="list-band"|$)/;
  const m = html.match(re);
  if (!m) fail("Race favorite band missing");
  for (const r of race) {
    if (!m[0].includes(r.name)) fail("Race favorite seat not under type band: " + r.name);
  }
}

const design = "design-manager-types-group.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const htmlDes = fs.readFileSync(design, "utf8");
  if (!htmlDes.includes('cuckle.auth.v2') || htmlDes.includes('cuckle.auth.v1')) {
    fail(design + " must seed cuckle.auth.v2");
  }
  if (htmlDes.includes('setItem("cuckle.pending.who"')
    || /[&?]who=/.test(htmlDes)) {
    fail(design + " must open the full type board (no who filter)");
  }
  if (htmlDes.includes("src=share")) {
    fail(design + " must not use src=share");
  }
}

console.log(JSON.stringify({
  ok: true,
  seats: items.length,
  types: labs.length,
  type_labs: labs,
  DATA_V: "managerTypesGroup20261026",
}));
