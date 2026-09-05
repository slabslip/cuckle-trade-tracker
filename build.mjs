#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { CUCKLE_LEAGUE_ID, setLeagueId } from "./lib.mjs";

/**
 * Rebuild one league's meter book.
 *
 *   node build.mjs                         # CuckleChunckle (default)
 *   node build.mjs <sleeper_league_id>     # any registered league
 *
 * Shared DynastyProcess curve/KTC stay under data/; league tape + UI go to
 * data/leagues/<id>/{raw,ui}/. Cuckle UI is dual-written to data/ui.
 */
const leagueArg = process.argv[2] && /^\d{6,64}$/.test(process.argv[2])
  ? process.argv[2]
  : CUCKLE_LEAGUE_ID;
const leagueId = setLeagueId(leagueArg);
const isCuckle = leagueId === CUCKLE_LEAGUE_ID;

const steps = [
  ["sleeper-sync.mjs", leagueId],
  ["draft-resolve.mjs", leagueId],
  ["value-snapshot.mjs"],
  ["revalue.mjs", leagueId],
  ["title-path.mjs", leagueId],
  ["apply-value-adjust.mjs", leagueId],
  ["build-cuffs.mjs", leagueId],
  ["build-calculator.mjs", leagueId],
  ["build-cosmetics.mjs", leagueId],
];

// Site shell is Cuckle-hosted; only regenerate index.html for the default league.
if (isCuckle) steps.push(["generate-page.mjs"]);

for (const [script, ...args] of steps) {
  console.log(`\n== ${script} (${leagueId}) ==`);
  const r = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname, ...args], {
    stdio: "inherit",
    env: { ...process.env, LEAGUE_ID: leagueId },
  });
  if (r.status) process.exit(r.status);
}

console.log(`\n== mark-league-ready (${leagueId}) ==`);
const mark = spawnSync(
  process.execPath,
  [new URL("mark-league-ready.mjs", import.meta.url).pathname, leagueId],
  { stdio: "inherit", env: { ...process.env, LEAGUE_ID: leagueId } },
);
if (mark.status && mark.status !== 0) {
  console.warn("mark-league-ready skipped or failed (set SUPABASE_SERVICE_ROLE_KEY to flip status).");
}
