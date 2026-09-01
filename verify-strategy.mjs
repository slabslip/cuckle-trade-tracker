#!/usr/bin/env node
/**
 * Strategy gate — asserts Wave 0–4 artifacts exist on this branch.
 * Run: node verify-strategy.mjs
 * Does not apply SQL or deploy Edge (operator desktop).
 */
import fs from "node:fs";
import { ROOT } from "./lib.mjs";

const need = [
  "db/phase1-seat-auth.sql",
  "db/multi-league-app.sql",
  "db/commissioner-invites.sql",
  "db/wave1-invite-hardening.sql",
  "db/wave2-vote-identity.sql",
  "db/wave2b-vote-unique.sql",
  "db/wave5-invite-plain.sql",
  "supabase/functions/join-league/index.ts",
  "build.mjs",
  "lib.mjs",
  "sleeper-sync.mjs",
  "mark-league-ready.mjs",
  "manifest.webmanifest",
  "sw.js",
  "data/ui/icon-192.png",
  "data/ui/icon-512.png",
  "data/leagues/1315431339301806080/ui/members.json",
  ".github/workflows/league-sync.yml",
  "docs/DESKTOP_CHECKLIST.md",
  "docs/APP_SDD.md",
  "docs/VOTES_SDD.md",
  "docs/CUSTOM_DOMAIN.md",
];

let failed = 0;
for (const rel of need) {
  const path = ROOT + rel;
  if (!fs.existsSync(path)) {
    console.error("MISSING", rel);
    failed++;
  }
}

const seed = fs.readFileSync(ROOT + "seed-seat-auth.mjs", "utf8");
if (!seed.includes("--force-legacy") || !seed.includes("process.exit(1)")) {
  console.error("seed-seat-auth.mjs must refuse default CUCK seeding");
  failed++;
}

const join = fs.readFileSync(ROOT + "supabase/functions/join-league/index.ts", "utf8");
for (const action of ["create", "list_invites", "redeem", "claim_seat", "rotate_seat", "reissue_seat", "transfer_commissioner"]) {
  if (!join.includes(`action === "${action}"`)) {
    console.error("join-league missing action", action);
    failed++;
  }
}

const page = fs.readFileSync(ROOT + "index.html", "utf8");
for (const needStr of [
  "manifest.webmanifest",
  "serviceWorker.register",
  "on_conflict=sleeper_league_id,transaction_id,voter",
  "function renderInvites()",
  "async function openLeagueDashboard(",
  'view = "home"',
  "data/leagues/",
]) {
  if (!page.includes(needStr)) {
    console.error("index.html missing", needStr);
    failed++;
  }
}

const lib = fs.readFileSync(ROOT + "lib.mjs", "utf8");
if (!lib.includes("leagueUiDir") || !lib.includes("leagueRawDir") || !lib.includes("setLeagueId")) {
  console.error("lib.mjs missing scoped league helpers");
  failed++;
}

if (failed) {
  console.error(`verify-strategy: ${failed} failure(s)`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checked: need.length }, null, 2));
