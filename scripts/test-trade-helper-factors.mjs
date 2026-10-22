#!/usr/bin/env node
/** Trade helper: factors, foundational marks, multi-piece + depth. */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "tradeHelperClearSpace20261022"')
  || !gen.includes('const DATA_V = "tradeHelperClearSpace20261022"')
  || !sw.includes("chuckle-shell-v348-trade-helper-clear-space")) {
  fail("factors ship must bust DATA_V and SW");
}

for (const need of [
  "function tradeHelperIsFoundational(",
  "function tradeHelperIsFoundationalUser(",
  "function tradeHelperClassOf(",
  "function tradeHelperIsRiser(",
  "function tradeHelperClassBadgesHtml(",
  "function tradeHelperCanSendFiller(",
  "function tradeHelperDepthOf(",
  "function tradeHelperConsolidatePackages(",
  "function tradeHelperFactorHtml(",
  "function seatFoundationalToggle(",
  "Clear space",
  "Foundational",
  "Riser",
  "Consolidate for a foundation",
  "Needs depth",
  "3for1",
  "2plusPick",
  "trade-helper-riser",
  'data-trade-helper-factor="',
  'data-trade-helper-found-toggle="',
  "cuckle.foundational.v1.",
]) {
  if (!page.includes(need)) fail("missing: " + need);
}

const buyPk = page.slice(
  page.indexOf("function tradeHelperPackages("),
  page.indexOf("function tradeHelperSellPackages("),
);
if (!buyPk.includes("3for1") || !buyPk.includes("tradeHelperCanSendFiller")) {
  fail("buy packages must build multi-piece offers without foundational fillers");
}

const sellPk = page.slice(
  page.indexOf("function tradeHelperSellPackages("),
  page.indexOf("function tradeHelperConsolidatePackages("),
);
if (!sellPk.includes('clear_space")') && !sellPk.includes("clear_space")) {
  fail("sell packages must branch clear_space → consolidate");
}

const consol = page.slice(
  page.indexOf("function tradeHelperConsolidatePackages("),
  page.indexOf("function tradeHelperInterest("),
);
if (!consol.includes("shallow") || !consol.includes("2plusPick")) {
  fail("consolidate must prefer shallow seats and pick toppers");
}

if (!consol.includes("0.52") || !consol.includes("3plusPick")) {
  fail("consolidate clear-space must allow unclean ratios + 3+pick");
}

console.log(JSON.stringify({
  ok: true,
  DATA_V: "tradeHelperClearSpace20261022",
  CACHE: "chuckle-shell-v348-trade-helper-clear-space",
}));
