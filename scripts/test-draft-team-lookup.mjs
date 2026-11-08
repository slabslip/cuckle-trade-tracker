#!/usr/bin/env node
/** Draft picks League: team search → year groups + who owns them. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");

function fnSrc(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing function " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

for (const src of [page, gen]) {
  for (const name of [
    "pickHubTeamSearchHits",
    "pickHubApplyTeam",
    "receiptPickHubTeamHtml",
    "pickHubOwnerLine",
  ]) {
    if (!src.includes("function " + name + "(")) {
      throw new Error("missing " + name);
    }
  }
  if (!fnSrc(src, "receiptPickHubHtml").includes("pickHubTeamSearchHtml(")) {
    throw new Error("League idle must offer team search");
  }
  if (!fnSrc(src, "receiptDoorFilterHtml").includes("Their originals")) {
    throw new Error("Team look needs Their originals / They hold");
  }
}

const ctx = {
  pickHubTeam: "all",
  pickHubTeamLook: "origin",
  pickHubTeamQ: "",
  receiptPickYearFilter: "all",
  receiptPickRoundFilter: "all",
  pickIntelOpen: null,
  members: [
    { name: "TrumanCooper" },
    { name: "KingHenryXXVI" },
    { name: "TipsUp" },
  ],
  picks: {
    "pick:2027:1:5": {
      label: "2027 1st (KingHenryXXVI)",
      became: null,
      used_by: null,
      still_pick: true,
      hops: [{ from: "KingHenryXXVI", to: "TrumanCooper", exit: "held" }],
      holder: "TrumanCooper",
    },
    "pick:2026:1:3": {
      label: "2026 1st (KingHenryXXVI)",
      became: "Ashton Jeanty",
      used_by: "TrumanCooper",
      still_pick: false,
      hops: [{ from: "KingHenryXXVI", to: "TrumanCooper", exit: "drafted" }],
    },
    "pick:2028:2:5": {
      label: "2028 2nd (KingHenryXXVI)",
      became: null,
      used_by: null,
      still_pick: true,
      hops: [],
      holder: "KingHenryXXVI",
    },
  },
};

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

vm.runInNewContext([
  "var pickHubTeam = this.pickHubTeam;",
  "var pickHubTeamLook = this.pickHubTeamLook;",
  "var pickHubTeamQ = this.pickHubTeamQ;",
  "var receiptPickYearFilter = this.receiptPickYearFilter;",
  "var receiptPickRoundFilter = this.receiptPickRoundFilter;",
  "var pickIntelOpen = this.pickIntelOpen;",
  "var members = this.members;",
  "var picks = this.picks;",
  "function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }",
  "function pickKeyParts(key) {",
  "  var m = /^pick:(\\d{4}):(\\d+):(\\d+)$/.exec(String(key||''));",
  "  return m ? { season: m[1], round: Number(m[2]), slot: Number(m[3]) } : null;",
  "}",
  "function pickOriginName(entry) {",
  "  if (!entry) return '';",
  "  var hops = entry.hops || [];",
  "  if (hops.length) return hops[0].from || '';",
  "  var m = /\\(([^)]+)\\)\\s*$/.exec(String(entry.label||''));",
  "  return m ? m[1] : '';",
  "}",
  "function pickOwnerName(entry) {",
  "  if (!entry) return '';",
  "  if (entry.holder) return entry.holder;",
  "  var hops = entry.hops || [];",
  "  if (hops.length) return hops[hops.length-1].to || hops[hops.length-1].from || '';",
  "  return pickOriginName(entry);",
  "}",
  "function stillPickEntries() {",
  "  return Object.keys(picks).filter(function(k){ return picks[k] && picks[k].still_pick; })",
  "    .map(function(k){ return { key:k, entry:picks[k] }; });",
  "}",
  "function receiptPickYear(p, key) {",
  "  var parts = pickKeyParts(key);",
  "  return parts ? parts.season : '';",
  "}",
  "function receiptPickPrint(p, seat) {",
  "  if (p && p.became) return 'USED';",
  "  var owner = pickOwnerName(p);",
  "  if (seat && owner && owner !== seat) return 'SOLD';",
  "  if (p && p.still_pick) return 'HELD';",
  "  return 'HELD';",
  "}",
  "function receiptPickRowKeep(row) {",
  "  if (receiptPickYearFilter && receiptPickYearFilter !== 'all') {",
  "    if (String(receiptPickYear(row.p, row.key)||'') !== String(receiptPickYearFilter)) return false;",
  "  }",
  "  if (receiptPickRoundFilter && receiptPickRoundFilter !== 'all') {",
  "    var parts = pickKeyParts(row.key);",
  "    if (!parts || String(parts.round) !== String(receiptPickRoundFilter)) return false;",
  "  }",
  "  return true;",
  "}",
  "function receiptOriginPicksForSeat(seat) {",
  "  return Object.keys(picks).filter(function(k){ return pickOriginName(picks[k]) === seat; })",
  "    .map(function(k){ return { key:k, p:picks[k] }; });",
  "}",
  "function pickHubSoonestYear() { return '2027'; }",
  fnSrc(page, "pickHubTeamName"),
  fnSrc(page, "pickHubTeamSearchHits"),
  fnSrc(page, "pickHubApplyTeam"),
  fnSrc(page, "pickHubOwnerLine"),
  fnSrc(page, "receiptPickHubTeamHtml"),
].join("\n"), ctx);

const hits = ctx.pickHubTeamSearchHits("king");
if (hits.length !== 1 || hits[0] !== "KingHenryXXVI") {
  throw new Error("team search should hit KingHenryXXVI, got " + JSON.stringify(hits));
}

ctx.pickHubApplyTeam("KingHenryXXVI");
if (ctx.pickHubTeam !== "KingHenryXXVI" || ctx.receiptPickYearFilter !== "all") {
  throw new Error("apply team should clear year to all");
}

ctx.pickHubTeamLook = "origin";
const originHtml = ctx.receiptPickHubTeamHtml("KingHenryXXVI", "");
if (!originHtml.includes("2027") || !originHtml.includes("Held by TrumanCooper")) {
  throw new Error("origin look must show who owns the 2027 1st: " + originHtml.slice(0, 400));
}
if (!originHtml.includes("Used · became Ashton Jeanty")) {
  throw new Error("origin look must show used picks by year");
}
if (!originHtml.includes("data-sec-h\">2026") || !originHtml.includes("data-sec-h\">2027")
  || !originHtml.includes("data-sec-h\">2028")) {
  throw new Error("origin look must group by year");
}

ctx.pickHubTeamLook = "held";
const heldHtml = ctx.receiptPickHubTeamHtml("KingHenryXXVI", "");
if (!heldHtml.includes("2028 2nd") || !heldHtml.includes("Was KingHenryXXVI")) {
  throw new Error("held look must list picks they still hold: " + heldHtml.slice(0, 400));
}
if (heldHtml.includes("2027 1st")) {
  throw new Error("held look must not list picks they sold");
}

console.log(JSON.stringify({
  ok: true,
  search: hits,
  origin_has_owner: originHtml.includes("Held by TrumanCooper"),
  held_n: (heldHtml.match(/class="row"/g) || []).length,
}));
