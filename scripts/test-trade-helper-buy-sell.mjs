#!/usr/bin/env node
/** Trade helper: buy external players + sell your own team. */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "tradeHelperThpickFix20261022"')
  || !gen.includes('const DATA_V = "tradeHelperThpickFix20261022"')
  || !sw.includes("chuckle-shell-v344-trade-helper-thpick")) {
  fail("buy/sell trade helper must bust DATA_V and SW");
}

for (const need of [
  "function tradeHelperIsMine(",
  "function tradeHelperSellPackages(",
  "function tradeHelperInterest(",
  "function tradeHelperSellAlts(",
  "function tradeHelperApplyPendingPick(",
  "function clearTradeHelperPending(",
  "Sell — trade him out",
  "Buy — trade for him",
  "What they might give",
  "Who might want him",
  "Maybe sell this instead",
  "Loading player…",
  "trade-helper-side",
  "trade-helper-mode",
]) {
  if (!page.includes(need)) fail("missing: " + need);
}

const openReport = page.slice(
  page.indexOf("function dataDashOpenReport("),
  page.indexOf("function dataDashOpenReport(") + 1800,
);
if (!openReport.includes("tradeHelperApplyPendingPick")) {
  fail("dataDashOpenReport must restore thpick via tradeHelperApplyPendingPick");
}
if (openReport.includes('tradeHelperTargetId = ""')
  && !openReport.includes("if (!pending)")) {
  fail("dataDashOpenReport must not always wipe tradeHelperTargetId");
}

const searchFn = page.slice(
  page.indexOf("function tradeHelperSearchHits("),
  page.indexOf("function tradeHelperLegNames("),
);
if (searchFn.includes("owner_id) === mine) return false")) {
  fail("search must include your own team players");
}

const anal = page.slice(
  page.indexOf("function tradeHelperAnalysis("),
  page.indexOf("function tradeHelperKickstartCards("),
);
if (!anal.includes('mode: "sell"') || !anal.includes('mode: "buy"')) {
  fail("analysis must branch buy vs sell");
}

console.log(JSON.stringify({
  ok: true,
  DATA_V: "tradeHelperThpickFix20261022",
  CACHE: "chuckle-shell-v344-trade-helper-thpick",
}));
