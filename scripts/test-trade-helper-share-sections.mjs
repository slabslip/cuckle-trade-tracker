#!/usr/bin/env node
/** Trade helper: per-section image share (packages / interest / alts). */
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
  fail("trade helper section share must bust DATA_V and SW");
}

for (const need of [
  "function tradeHelperShareNow(",
  "function tradeHelperShareDraw(",
  "function tradeHelperShareSectionHead(",
  'data-trade-helper-share="',
  "What they might give",
  "navigator.canShare",
  "cuckle-",
]) {
  if (!page.includes(need)) fail("missing: " + need);
}

const htmlFn = page.slice(
  page.indexOf("function dataDashTradeHelperHtml("),
  page.indexOf("function dataDashHuntRowHtml("),
);
if (!htmlFn.includes('tradeHelperShareSectionHead("packages"')
  || !htmlFn.includes('tradeHelperShareSectionHead("alts"')) {
  fail("helper target view must head packages + alts with share buttons");
}
if (!htmlFn.includes('tradeHelperShareSectionHead("interest"')) {
  fail("sell view must head interest with share button");
}

const shareFn = page.slice(
  page.indexOf("function tradeHelperShareNow("),
  page.indexOf("function dataDashTradeHelperHtml("),
);
if (!shareFn.includes("image/png") || !shareFn.includes("ClipboardItem")) {
  fail("share now must produce a PNG (share / clipboard / download)");
}

console.log(JSON.stringify({
  ok: true,
  DATA_V: "tradeHelperShareSec20261022",
  CACHE: "chuckle-shell-v349-trade-helper-share-sec",
}));
