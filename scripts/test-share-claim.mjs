#!/usr/bin/env node
/** Smoke: share icon is tiny; unsigned share links claim a remaining team first. */
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

function need(src, label, strs) {
  const missing = strs.filter((s) => !src.includes(s));
  if (missing.length) throw new Error(label + " missing: " + missing.join(", "));
}

need(page, "index.html", [
  "function shareAccessPending(",
  "function rememberPendingDataTile(",
  "function readPendingDataTile(",
  "function dataTileSeatReady(",
  "function honorPendingDataTile(",
  "claim <b>your</b> remaining team to open it",
  "Claim the remaining team that is yours",
  "Create account to open this view",
  "function leagueNameForId(",
  "cuckle.pending.tile",
  "right: 6px; bottom: 6px",
]);
need(gen, "generate-page.mjs", [
  "function shareAccessPending(",
  "function dataTileSeatReady(",
  "claim <b>your</b> remaining team to open it",
  "Create account to open this view",
]);

if (fnSrc(page, "dataTileShareBtn").includes("<span>Share</span>")
  || fnSrc(gen, "dataTileShareBtn").includes("<span>Share</span>")) {
  throw new Error("share button must be icon-only");
}

const honor = fnSrc(page, "honorPendingDataTile");
if (!honor.includes("dataTileSeatReady(") || !honor.includes("readPendingDataTile(")) {
  throw new Error("honorPendingDataTile must persist the tile and wait for a claimed seat");
}

const claim = fnSrc(page, "renderClaimTeam");
if (!claim.includes("remaining") || !claim.includes("!s.claimed")) {
  throw new Error("claim picker must list remaining (unclaimed) teams only");
}
const guess = fnSrc(page, "claimGuessSeat");
if (guess.includes("pendingDataWho")) {
  throw new Error("group-share who= must not preselect the shared line as the clicker's team");
}
if (!page.includes("this link is not a seat invite")
  || !page.includes("Open the shared view")
  || !page.includes("function claimShareAboutName(")) {
  throw new Error("group share must say the line is not their seat and open the tile after claim");
}

const gate = fnSrc(page, "onGateSubmit");
if (!gate.includes("already") || !gate.includes("openClaimPick(") || !gate.includes("openLeagueDashboard(")) {
  throw new Error("after account, share links must claim remaining team or open if already seated");
}

if (!page.includes('const DATA_V = "claimdrop20260919220000"')
  || !sw.includes("chuckle-shell-v299-claim-drop")) {
  throw new Error("share-claim must bust DATA_V and SW");
}

if (!mem.includes("remaining") || !mem.includes("dataTileSeatReady()")) {
  throw new Error("MEMORY_SDD must lock share-claim before the tile");
}

console.log(JSON.stringify({ ok: true, paths: ["icon", "signup", "remaining-team", "tile"] }, null, 2));
