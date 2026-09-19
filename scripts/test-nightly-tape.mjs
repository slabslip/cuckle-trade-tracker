#!/usr/bin/env node
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const build = fs.readFileSync(`${ROOT}build.mjs`, "utf8");
const nightly = fs.readFileSync(`${ROOT}.github/workflows/league-nightly.yml`, "utf8");
const daily = fs.readFileSync(`${ROOT}.github/workflows/values-daily.yml`, "utf8");
const sync = fs.readFileSync(`${ROOT}.github/workflows/league-sync.yml`, "utf8");
const trades = JSON.parse(
  fs.readFileSync(`${ROOT}data/leagues/1315431339301806080/raw/trades.json`, "utf8"),
);

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

need(build.includes('--skip-page') && build.includes('--skip-espn') && build.includes('--skip-finishes') && build.includes('--allow-revalue-fail'),
  "build.mjs must accept skip-page, skip-espn, skip-finishes, allow-revalue-fail");
need(build.includes('allowRevalueFail && script === "revalue.mjs"'),
  "revalue self-check must not abort a tape ship");
need(!/if \(leagueId === CUCKLE_LEAGUE_ID\) steps.push\(\["generate-page.mjs"\]\)/.test(build),
  "Cuckle generate-page must stay gated on !skipPage");

need(nightly.includes('cron: "10 8 * * *"'), "league-nightly must run every morning");
need(nightly.includes("--skip-snapshot --skip-page --skip-espn --skip-finishes --allow-revalue-fail"),
  "nightly must refresh Sleeper tape without espn, generate-page, or a dynasty finishes rewrite");
need(!nightly.includes("node generate-page.mjs"), "nightly must never run generate-page.mjs");

need(daily.includes("--skip-snapshot --skip-page --skip-finishes --allow-revalue-fail"),
  "values-daily must still ship trades when revalue checks fail");
need(!/node generate-page\.mjs/.test(daily), "values-daily must not execute generate-page.mjs");

need(sync.includes("--skip-page --allow-revalue-fail"),
  "manual league-sync must not die on a blend check");

const missing = trades.find((t) => String(t.transaction_id) === "1406421860110843904");
need(missing, "Cuckle tape must include the 2026-09-17 Truman ↔ Ducks trade");
need(missing.date === "2026-09-17", "Truman ↔ Ducks trade date");

const truman = JSON.parse(fs.readFileSync(
  `${ROOT}data/leagues/1315431339301806080/ui/me/458342725222133760.json`, "utf8"));
const names = JSON.stringify(truman.trades || []);
need(/Justin Jefferson|Marvin Harrison/.test(names),
  "Truman seat must list the Jefferson / Harrison trade");

console.log("nightly tape ok", { trades: trades.length, newest: missing.date });
