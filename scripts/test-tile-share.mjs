#!/usr/bin/env node
/** Smoke: data-tile share chip, group-text URL, open-from-share. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
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

const need = [
  "function dataTileCanon(",
  "function dataTileOpenId(",
  "function dataTileShareUrl(",
  "function dataTileShareTextFor(",
  "function dataTileShareBtn(",
  "function honorPendingDataTile(",
  "data-tile-share",
  'q.set("view", "data")',
  'q.set("tile", tile)',
  "Share this view",
  "Chuckle data",
  "pendingDataTile",
  "startView === \"data\"",
  "button.tile-share",
  "tile-share-row",
];
const missing = need.filter((s) => !page.includes(s));
if (missing.length) {
  throw new Error("index.html missing tile-share pieces: " + missing.join(", "));
}
const genMissing = need.filter((s) => !gen.includes(s));
if (genMissing.length) {
  throw new Error("generate-page.mjs missing tile-share pieces: " + genMissing.join(", "));
}

const tileHtml = fnSrc(page, "dataDashTileHtml");
if (!tileHtml.includes("dataTileShareBtn(") || !tileHtml.includes("data-dash-open")) {
  throw new Error("data board doors must keep open + Share as sibling controls");
}
if (tileHtml.includes("data-tile-share") && tileHtml.includes('class="door') && tileHtml.includes("data-dash-open=\"")
  && /<button type="button" class="door/.test(tileHtml)
  && tileHtml.indexOf("dataTileShareBtn") < 0) {
  throw new Error("Share must not live inside a single door button");
}

const homeDoors = fnSrc(page, "homeTopDoorsHtml");
if (!homeDoors.includes("dataTileShareBtn(") || !homeDoors.includes("data-home-door")) {
  throw new Error("home top doors must ship a Share chip next to the open control");
}

const shareUrl = fnSrc(page, "dataTileShareUrl");
if (!shareUrl.includes('q.set("league"') || shareUrl.includes('q.set("r"')) {
  throw new Error("data tile URL must be league + view=data + tile, not a receipt r=");
}

const honor = fnSrc(page, "honorPendingDataTile");
if (!honor.includes('homeTab = "history"') || !honor.includes("dataDashOpenReport")) {
  throw new Error("shared tile links must open that door on the data board");
}

if (!page.includes("if (e.target && e.target.closest && e.target.closest(\"[data-tile-share]\")) return;")) {
  throw new Error("tile Share must not start a door drag");
}

if (page.includes('const DATA_V = "tileshare20260918154500"')
  || !page.includes('const DATA_V = "shareclaim20260918143500"')
  || !sw.includes("chuckle-shell-v275-share-claim")) {
  throw new Error("tile share must bust DATA_V and the shell cache");
}

const shareBtn = fnSrc(page, "dataTileShareBtn");
if (shareBtn.includes("<span>Share</span>") || shareBtn.includes(">Share<")) {
  throw new Error("tile share must be icon-only — no Share word");
}
if (!fnSrc(page, "honorPendingDataTile").includes("dataTileSeatReady(")) {
  throw new Error("shared tiles must wait for a claimed seat");
}

if (!mem.includes("view=data&tile=") || !mem.includes("honorPendingDataTile")) {
  throw new Error("MEMORY_SDD must lock the data-tile share contract");
}

// Receipt tickets stay on r= and must not be rewritten as view=data.
const receiptUrl = fnSrc(page, "receiptShareUrl");
if (!receiptUrl.includes('q.set("r"') || receiptUrl.includes('q.set("view", "data")')) {
  throw new Error("receipt share URLs must stay on r=");
}

console.log(JSON.stringify({ ok: true, checks: need.length }, null, 2));
