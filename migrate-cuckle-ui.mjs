#!/usr/bin/env node
/**
 * One-time (idempotent) copy of legacy data/ui → data/leagues/<cuckle>/ui.
 * Prefer a full `node build.mjs` afterward so raw + ui stay in sync.
 */
import fs from "node:fs";
import path from "node:path";
import { CUCKLE_LEAGUE_ID, DATA, leagueUiDir, setLeagueId } from "./lib.mjs";

setLeagueId(CUCKLE_LEAGUE_ID);
const src = path.join(DATA, "ui");
const dest = leagueUiDir(CUCKLE_LEAGUE_ID);

if (!fs.existsSync(src)) {
  console.error("Missing data/ui — nothing to migrate.");
  process.exit(1);
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, ent.name);
    const b = path.join(to, ent.name);
    if (ent.isDirectory()) copyTree(a, b);
    else fs.copyFileSync(a, b);
  }
}

copyTree(src, dest);
console.log(`Copied ${src} → ${dest}`);
