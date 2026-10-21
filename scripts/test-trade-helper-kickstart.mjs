#!/usr/bin/env node
/** Trade helper: plain search placeholder + kickstart ideas before search. */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!page.includes('const DATA_V = "tradeHelperKick20261021"')
  || !gen.includes('const DATA_V = "tradeHelperKick20261021"')
  || !sw.includes("chuckle-shell-v339-trade-helper-kick")) {
  fail("trade helper kickstart must bust DATA_V and SW");
}

if (page.includes("Travis Etienne or TipsUp") || page.includes("e.g. Travis")) {
  fail("search box must not ship example suggestions");
}
if (!page.includes('placeholder="Search for player or trade partner"')) {
  fail("missing plain search placeholder");
}
for (const need of [
  "function tradeHelperKickstartHtml(",
  "function tradeHelperKickstartCards(",
  "function tradeHelperIdeaLogic(",
  "Kickstart ideas",
  'data-trade-helper-seed="',
  'closest("[data-trade-helper-seed]")',
]) {
  if (!page.includes(need)) fail("missing: " + need);
}

// Cumulative: prior queue items still present on this branch.
if (page.includes('lab: "Who has firsts"') || page.includes('data-dash-open="firsts_held"')) {
  fail("Who has firsts must stay off Data");
}
if (page.includes("your bag") || page.includes(" · Bag ") || page.includes("Reload bag")) {
  fail("bag copy must stay replaced by team");
}

console.log(JSON.stringify({
  ok: true,
  DATA_V: "tradeHelperKick20261021",
  also: ["no-firsts-held", "bag-to-team"],
}));
