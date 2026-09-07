#!/usr/bin/env node
/**
 * Daily market pulls. One dead API must not skip the day.
 * Exits 0 when DynastyProcess (fresh or committed) plus at least one other source landed.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readJson } from "./lib.mjs";
import { reuseLatestSnap, todayStamp } from "./market-snap.mjs";

function run(script, args = []) {
  const r = spawnSync(process.execPath, [new URL(script, import.meta.url).pathname, ...args], {
    stdio: "inherit",
  });
  return r.status === 0;
}

function hasCurve() {
  const curve = readJson("value_curve.json", null);
  return Array.isArray(curve) && curve.length > 0;
}

function hasSnap(dir) {
  const latest = readJson(`${dir}/latest.json`, null);
  return Array.isArray(latest?.players) && latest.players.length > 0;
}

const asOf = todayStamp();
const ok = { dp: false, ktc: false, fc: false, dd: false, pe: false };

ok.dp = run("value-snapshot.mjs", ["--latest-only"]);
if (!ok.dp) {
  ok.dp = hasCurve();
  console.error("value-snapshot failed; reusing committed curve:", ok.dp);
}

ok.ktc = run("ktc-snapshot.mjs");
if (!ok.ktc) ok.ktc = !!reuseLatestSnap("ktc", asOf, "ktc fetch failed") || hasSnap("ktc");

ok.fc = run("fantasycalc-snapshot.mjs");
if (!ok.fc) ok.fc = !!reuseLatestSnap("fc", asOf, "fantasycalc fetch failed") || hasSnap("fc");

ok.dd = run("dynastydealer-snapshot.mjs");
if (!ok.dd) ok.dd = !!reuseLatestSnap("dd", asOf, "dynastydealer fetch failed") || hasSnap("dd");

ok.pe = run("stats-snapshot.mjs");
if (!ok.pe) console.error("stats-snapshot failed; Desk will omit P/E chips");

const market = [ok.ktc, ok.fc, ok.dd].filter(Boolean).length;
const summary = { as_of: asOf, ...ok, market };
console.log(JSON.stringify(summary, null, 2));
if (!ok.dp || market < 1) {
  console.error("need DynastyProcess plus at least one market source");
  process.exit(1);
}
