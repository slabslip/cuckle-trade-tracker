#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { CUCKLE_LEAGUE_ID, loadProviders, setLeagueId, writeJson } from "./lib.mjs";

/**
 * Rebuild one league's meter book.
 *
 *   node build.mjs                         # CuckleChunckle (default)
 *   node build.mjs <sleeper_league_id>     # any registered league
 *
 * Shared DynastyProcess curve/KTC stay under data/; league tape + UI go to
 * data/leagues/<id>/{raw,ui}/. Cuckle UI is dual-written to data/ui.
 */
const argv = process.argv.slice(2);
const skipSnapshot = argv.includes("--skip-snapshot");
const skipEspn = argv.includes("--skip-espn");
const skipPage = argv.includes("--skip-page");
const skipFinishes = argv.includes("--skip-finishes");
const allowRevalueFail = argv.includes("--allow-revalue-fail");
const leagueArg = argv.find((a) => /^\d{6,64}$/.test(a));
const leagueId = setLeagueId(leagueArg);
{
  const extra = String(process.env.SLEEPER_EXTRA_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{6,64}$/.test(s) && s !== String(leagueId));
  const espn = String(process.env.ESPN_LEAGUE_ID || "").trim();
  const yahoo = String(process.env.YAHOO_LEAGUE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (extra.length || espn || yahoo.length) {
    const cur = loadProviders(leagueId);
    writeJson("providers.json", {
      ...cur,
      sleeper_league_id: String(leagueId),
      sleeper_extra_ids: extra.length ? extra : (cur.sleeper_extra_ids || []),
      espn_league_id: espn || cur.espn_league_id || null,
      yahoo_league_ids: yahoo.length ? yahoo : (cur.yahoo_league_ids || []),
    });
    console.log("providers.json", extra.join(",") || "—", espn || cur.espn_league_id || "—", yahoo.join(",") || "—");
  }
}
const steps = [
  ["sleeper-sync.mjs", leagueId],
  ...(skipEspn ? [] : [["espn-sync.mjs", leagueId]]),
  ["yahoo-sync.mjs", leagueId],
  ["merge-provider-history.mjs", leagueId],
  ["draft-resolve.mjs", leagueId],
  ["ensure-1qb-curve.mjs"],
  ...(skipSnapshot ? [] : [["value-snapshot.mjs"]]),
  ["revalue.mjs", leagueId],
  ["title-path.mjs", leagueId],
  ...(skipFinishes ? [] : [["build-finishes.mjs", leagueId]]),
  ["weekly-scores.mjs", leagueId],
  ["apply-value-adjust.mjs", leagueId],
  ["build-cuffs.mjs", leagueId],
  ["build-calculator.mjs", leagueId],
  ["build-seat-direction.mjs", leagueId],
  ["build-cosmetics.mjs", leagueId],
];

// Shared shell + Cuckle tape audit. A second league must not rewrite index.html
// or run check-value-feed against Cuckle's 10-seat book. Nightly tape jobs pass
// --skip-page so a value-book check cannot smash the committed shell.
if (leagueId === CUCKLE_LEAGUE_ID && !skipPage) steps.push(["generate-page.mjs"]);

for (const [script, ...args] of steps) {
  console.log(`\n== ${script} (${leagueId}) ==`);
  const r = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname, ...args], {
    stdio: "inherit",
    env: { ...process.env, LEAGUE_ID: leagueId },
  });
  if (!r.status) continue;
  if (allowRevalueFail && script === "revalue.mjs") {
    console.warn("revalue self-check failed; keeping written meter so new Sleeper trades still ship.");
    continue;
  }
  process.exit(r.status);
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
