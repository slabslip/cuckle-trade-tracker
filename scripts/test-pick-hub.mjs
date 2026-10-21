#!/usr/bin/env node
/** Unused 2027+ hub: Mine / League / Tape, Early last → 1.01, Late champ → 1.10. */
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

function need(src, label, strs) {
  const missing = strs.filter((s) => !src.includes(s));
  if (missing.length) throw new Error(label + " missing: " + missing.join(", "));
}

need(page, "index.html", [
  "function pickHubSoonestYear(",
  "function pickHubApplyScope(",
  "function pickHubProject(",
  "function receiptPickHubHtml(",
  "function pickHubDeal(",
  'data-pick-hub-scope="mine">Mine<',
  'data-pick-hub-scope="league">League<',
  'data-pick-hub-scope="tape">Tape<',
  "rank2027",
  "1.01",
  "Get it back",
  "3-way:",
  "Early 1sts",
  "lab: \"Draft picks\"",
  "pick-hub-scopes",
  "pick-hub-menus",
]);
need(gen, "generate-page.mjs", [
  "function pickHubSoonestYear(",
  "function pickHubApplyScope(",
  "function pickHubProject(",
  "function receiptPickHubHtml(",
  "function pickHubDeal(",
  'data-pick-hub-scope="mine">Mine<',
  'data-pick-hub-scope="league">League<',
  'data-pick-hub-scope="tape">Tape<',
  "rank2027",
  "1.01",
  "Get it back",
  "3-way:",
  "Early 1sts",
  "pick-hub-menus",
]);
need(mem, "MEMORY_SDD", [
  "unused 2027",
  "Early / Mid / Late",
  "origin seat's 2026",
  "last-place 2026 window is 1.01",
  "3-way line",
]);

if (!fnSrc(page, "pickHubProject").includes("rank2027")
  || !fnSrc(gen, "pickHubProject").includes("rank2027")) {
  throw new Error("pickHubProject must rank 2027 from the 2026 window");
}
if (!fnSrc(page, "receiptPickHubHtml").includes("1.01")
  || !fnSrc(gen, "receiptPickHubHtml").includes("1.01")) {
  throw new Error("hub caption must say last place is the 1.01");
}
if (!fnSrc(page, "pickHubDeal").includes("3-way:")
  || !fnSrc(gen, "pickHubDeal").includes("3-way:")) {
  throw new Error("stuck 2-way must offer a 3-way line");
}
if (fnSrc(page, "pickHubSoonestYear").includes("return yb - ya")
  || fnSrc(page, "pickHubUnusedRows").includes("return Number(b.parts.season)")) {
  throw new Error("unused hub must list 2027 before later years");
}

const clickSrc = page.slice(
  page.indexOf('document.getElementById("app").addEventListener("click"'),
  page.indexOf('document.getElementById("app").addEventListener("change"'),
);
const changeSrc = page.slice(page.indexOf('document.getElementById("app").addEventListener("change"'));
if (!clickSrc.includes("pickHubApplyScope(") || !clickSrc.includes("data-pick-hub-scope")) {
  throw new Error("Mine / League / Tape chips must switch on click, not change");
}
if (changeSrc.includes("data-pick-hub-scope")) {
  throw new Error("hub scope buttons do not fire change");
}

const ctx = {};
vm.runInNewContext([
  fnSrc(page, "pickHubWindowPts"),
  fnSrc(page, "pickHubDirPts"),
  fnSrc(page, "pickHubTier"),
  "function pickHubTeamsN() { return 10; }",
].join("\n"), ctx);

if (ctx.pickHubTier(1, 10) !== "Early") throw new Error("slot 1 must be Early");
if (ctx.pickHubTier(4, 10) !== "Early") throw new Error("slot 4 must be Early");
if (ctx.pickHubTier(5, 10) !== "Mid") throw new Error("slot 5 must be Mid");
if (ctx.pickHubTier(7, 10) !== "Mid") throw new Error("slot 7 must be Mid");
if (ctx.pickHubTier(8, 10) !== "Late") throw new Error("slot 8 must be Late");
if (ctx.pickHubTier(10, 10) !== "Late") throw new Error("slot 10 must be Late");

if (ctx.pickHubWindowPts("hard-tank") !== 1) throw new Error("hard-tank window pts");
if (ctx.pickHubWindowPts("win-now") !== 9) throw new Error("win-now window pts");
if (ctx.pickHubDirPts("Hard rebuild") !== 1.6) throw new Error("hard rebuild dir pts");
if (ctx.pickHubDirPts("Win-now") !== 8.2) throw new Error("win-now dir pts");

function score2027(now, kind, dir) {
  return now * 0.62 + ctx.pickHubWindowPts(kind) * 0.24 + ctx.pickHubDirPts(dir) * 0.14;
}

const champ = score2027(8.8, "win-now", "Win-now");
const tank = score2027(2.1, "hard-tank", "Hard rebuild");
if (!(champ > tank)) throw new Error("2026 champ look must outrank a tank for 2027 quality");

const seats = [
  { name: "Champ", score: champ },
  { name: "MidA", score: 5.4 },
  { name: "MidB", score: 5.1 },
  { name: "MidC", score: 4.8 },
  { name: "MidD", score: 4.4 },
  { name: "MidE", score: 4.0 },
  { name: "MidF", score: 3.6 },
  { name: "MidG", score: 3.2 },
  { name: "MidH", score: 2.8 },
  { name: "Tank", score: tank },
].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

const n = seats.length;
const ranked = {};
seats.forEach((s, i) => {
  const finish = i + 1;
  ranked[s.name] = { finish, slot: n - finish + 1 };
});
if (ranked.Champ.finish !== 1 || ranked.Champ.slot !== 10) {
  throw new Error("title window must project 1.10 Late, got " + JSON.stringify(ranked.Champ));
}
if (ranked.Tank.finish !== 10 || ranked.Tank.slot !== 1) {
  throw new Error("last-place window must project 1.01 Early, got " + JSON.stringify(ranked.Tank));
}
if (ctx.pickHubTier(ranked.Champ.slot, 10) !== "Late") throw new Error("champ first is Late");
if (ctx.pickHubTier(ranked.Tank.slot, 10) !== "Early") throw new Error("tank first is Early");

console.log(JSON.stringify({
  ok: true,
  champ: ranked.Champ,
  tank: ranked.Tank,
  bands: { 1: "Early", 5: "Mid", 10: "Late" },
}, null, 2));
