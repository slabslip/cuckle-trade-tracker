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
  "claim a remaining team to open it",
  "Confirm league",
  "Your Sleeper username",
  "Sign in to open",
  "function leagueNameForId(",
  "cuckle.pending.tile",
  "right: 6px; bottom: 6px",
]);
need(gen, "generate-page.mjs", [
  "function shareAccessPending(",
  "function dataTileSeatReady(",
  "claim a remaining team to open it",
  "Confirm league",
  "Sign in to open",
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
if (!claim.includes("claimSleeperUser") || !claim.includes("Find my team")
  || !claim.includes("Confirm league") || !claim.includes("Yes — this is my team")
  || claim.includes("data-claim-pick=") || claim.includes("Or pick from the league list")) {
  throw new Error("claim flow must confirm league then require Sleeper username (no team list)");
}
const welcome = fnSrc(page, "renderJoinWelcome");
if (!welcome.includes("Crowning achievements") || !welcome.includes(">Next</button>")
  || !welcome.includes("data-join-enter-dash=")) {
  throw new Error("after claim, welcome must show achievements then Next into the dashboard");
}

const afterAuth = fnSrc(page, "routeAfterAuth");
if (!afterAuth.includes("already") || !afterAuth.includes("openClaimPick(")
  || !afterAuth.includes("openLeagueDashboard(")) {
  throw new Error("after account, share links must claim remaining team or open if already seated");
}

if (!/const DATA_V = "[^"]+"/.test(page) || !/^const CACHE = "chuckle-shell-v\d+/m.test(sw)) {
  throw new Error("share-claim must keep DATA_V and versioned SW CACHE");
}

if (!mem.includes("remaining") || !mem.includes("dataTileSeatReady()")) {
  throw new Error("MEMORY_SDD must lock share-claim before the tile");
}

console.log(JSON.stringify({ ok: true, paths: ["icon", "signup", "remaining-team", "tile"] }, null, 2));
