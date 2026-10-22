#!/usr/bin/env node
/** Trade helper Clear space: unclean multi-piece + pick toppers, soft rel. */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "tradeHelperShareSec20261022"')
  || !gen.includes('const DATA_V = "tradeHelperShareSec20261022"')
  || !sw.includes("chuckle-shell-v349-trade-helper-share-sec")) {
  fail("clear-space ship must bust DATA_V and SW");
}

const buyPk = page.slice(
  page.indexOf("function tradeHelperPackages("),
  page.indexOf("function tradeHelperSellPackages("),
);
if (!buyPk.includes("ratioLo") || !buyPk.includes("0.52") || !buyPk.includes("1.72")) {
  fail("buy clear packages must widen ratio window");
}
if (!buyPk.includes("rel > 0.55") || !buyPk.includes("gap > 3200")) {
  fail("buy clear packages must soften rel/gap (not 0.22/900)");
}
if (!buyPk.includes("3plusPick") || !buyPk.includes("2 + pick topper — not book-even")) {
  fail("buy clear must prefer pick toppers and label unclean deals");
}
if (buyPk.includes("if (rel > 0.22 && gap > 900) return;") && !buyPk.includes("if (clear)")) {
  fail("buy clear must not keep the even-book rel gate as sole path");
}

const consol = page.slice(
  page.indexOf("function tradeHelperConsolidatePackages("),
  page.indexOf("function tradeHelperInterest("),
);
if (!consol.includes("0.52") || !consol.includes("1.72")) {
  fail("consolidate must widen ratio");
}
if (!consol.includes("rel > 0.55") || !consol.includes("gap > 3200")) {
  fail("consolidate must soft-rel, not book-even");
}
if (!consol.includes("3plusPick") || !consol.includes("2 + pick topper")) {
  fail("consolidate must surface pick toppers");
}

if (!page.includes("No workable multi-piece (+ pick topper)")
  || !page.includes("No workable 2/3-for-1 (+ pick)")) {
  fail("empty copy must stop saying clean-only for clear space");
}

// Prior factors test still needs update — keep class markers present.
for (const need of ["Clear space", "2plusPick", "3plusPick", "tradeHelperCanSendFiller"]) {
  if (!page.includes(need)) fail("missing: " + need);
}

console.log(JSON.stringify({
  ok: true,
  DATA_V: "tradeHelperShareSec20261022",
  CACHE: "chuckle-shell-v349-trade-helper-share-sec",
}));
