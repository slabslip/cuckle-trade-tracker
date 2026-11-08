#!/usr/bin/env node
/** Draft picks League: Team dropdown (A–Z) → year groups + who owns them. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");
const mem = fs.readFileSync(path.join(ROOT, "docs/MEMORY_SDD.md"), "utf8");

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
    "pickHubTeamSelectHtml",
    "pickHubApplyTeam",
    "receiptPickHubTeamHtml",
    "pickHubOwnerLine",
  ]) {
    if (!src.includes("function " + name + "(")) {
      throw new Error("missing " + name);
    }
  }
  if (/function\s+pickHubTeamSearchHtml\s*\(/.test(src)
    || /function\s+pickHubTeamSearchHits\s*\(/.test(src)
    || src.includes("data-pick-hub-team-q")
    || src.includes("data-pick-hub-team-pick")
    || src.includes("Type a team name")) {
    throw new Error("type-ahead team search must be gone — Team dropdown only");
  }
  if (!fnSrc(src, "pickHubTeamSelectHtml").includes("sensitivity")
    || !fnSrc(src, "pickHubTeamSelectHtml").includes("localeCompare")) {
    throw new Error("Team dropdown must sort A–Z case-insensitive");
  }
  if (!fnSrc(src, "receiptDoorFilterHtml").includes("Their originals")) {
    throw new Error("Team look needs Their originals / They hold");
  }
  if (!fnSrc(src, "receiptPickHubHtml").includes("Pick a team from the dropdown")) {
    throw new Error("League idle caption must point at the Team dropdown");
  }
}

if (!mem.includes("Team dropdown (A–Z)") || !mem.includes("No type-in")) {
  throw new Error("MEMORY_SDD must lock Team dropdown only (no type-in)");
}

const ctx = {
  pickHubTeam: "all",
  pickHubTeamLook: "origin",
  receiptPickYearFilter: "all",
  receiptPickRoundFilter: "all",
  pickIntelOpen: null,
  members: [
    { name: "TrumanCooper" },
    { name: "KingHenryXXVI" },
    { name: "TipsUp" },
    { name: "ARae" },
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

vm.runInNewContext([
  "var pickHubTeam = this.pickHubTeam;",
  "var pickHubTeamLook = this.pickHubTeamLook;",
  "var receiptPickYearFilter = this.receiptPickYearFilter;",
  "var receiptPickRoundFilter = this.receiptPickRoundFilter;",
  "var pickIntelOpen = this.pickIntelOpen;",
  "var members = this.members;",
  "var picks = this.picks;",
  "function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }",
  "function receiptLookSelect(lab, attr, opts, cur) {",
  "  var want = (cur == null || cur === '') ? 'all' : String(cur);",
  "  return '<label class=\"receipt-look\"><span>' + esc(lab) + '</span><select ' + attr + '=\"1\">'",
  "    + (opts||[]).map(function(o){ return '<option value=\"'+esc(o[0])+'\">' + esc(o[1]) + '</option>'; }).join('')",
  "    + '</select></label>';",
  "}",
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
  fnSrc(page, "pickHubTeamSelectHtml"),
  fnSrc(page, "pickHubApplyTeam"),
  fnSrc(page, "pickHubOwnerLine"),
  fnSrc(page, "receiptPickHubTeamHtml"),
].join("\n"), ctx);

const menu = ctx.pickHubTeamSelectHtml();
const opts = [...menu.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]);
if (opts[0] !== "all") throw new Error("first option must be All teams");
const seats = opts.slice(1);
const sorted = seats.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
if (seats.join("|") !== sorted.join("|")) {
  throw new Error("Team dropdown must be A–Z, got " + seats.join(", "));
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

ctx.pickHubTeamLook = "held";
const heldHtml = ctx.receiptPickHubTeamHtml("KingHenryXXVI", "");
if (!heldHtml.includes("2028 2nd") || heldHtml.includes("2027 1st")) {
  throw new Error("held look must list only picks they still hold");
}

console.log(JSON.stringify({
  ok: true,
  teams_az: seats,
  origin_has_owner: originHtml.includes("Held by TrumanCooper"),
  held_n: (heldHtml.match(/class="row"/g) || []).length,
}));
