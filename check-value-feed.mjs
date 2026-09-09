#!/usr/bin/env node
/**
 * Standing book + applyVa feed check.
 * Extracts applyVa from generated index.html (not generate-page.mjs) and
 * compares it to value-adjust.mjs on every shipped side.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, leagueUiDir } from "./lib.mjs";
import { applyToSide } from "./value-adjust.mjs";

const hard = [];
function fail(msg) { hard.push(msg); }

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function close(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-6;
}

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
const src = scripts.find((s) => s.includes("function applyVa(s, noVa)")) || "";
if (!src) throw new Error("index.html missing app script");
const start = src.indexOf("function applyVa(s, noVa) {");
if (start < 0) throw new Error("generated page lost applyVa");
if (!src.includes("/^pick:\\d{4}:4:/")) {
  throw new Error("generated applyVa lost the 4th-round half-weight regex");
}
let i = start + "function applyVa(s, noVa) {".length;
let depth = 1;
while (i < src.length && depth) {
  const ch = src[i++];
  if (ch === "{") depth += 1;
  else if (ch === "}") depth -= 1;
}
const fnSrc = src.slice(start, i);
let applyVa;
try {
  applyVa = new Function("return (" + fnSrc + ")")();
} catch (err) {
  throw new Error("could not eval generated applyVa: " + (err && err.message));
}

const ui = leagueUiDir();
const meDir = path.join(ui, "me");
const files = fs.existsSync(meDir)
  ? fs.readdirSync(meDir).filter((f) => f.endsWith(".json"))
  : [];
if (files.length !== 10) fail("expected 10 seat files, found " + files.length);

let sides = 0;
let vaMismatch = 0;
let storeMismatch = 0;
let nanN = 0;
const pair = new Map();

for (const f of files) {
  const seat = JSON.parse(fs.readFileSync(path.join(meDir, f), "utf8"));
  for (const t of seat.trades || []) {
    const noVa = (t.others || []).length > 1;
    const bags = [t.even, ...Object.values(t.windows || {})].filter(Boolean);
    for (const side of bags) {
      sides += 1;
      const stored = side;
      if (![stored.today, stored.sent_today, stored.today_delta, stored.value_adjust]
        .every((n) => n == null || Number.isFinite(Number(n)))) {
        nanN += 1;
      }
      const live = applyToSide(clone(side), { noVa: noVa || !!side.incomplete });
      const browser = applyVa(clone(side), noVa || !!side.incomplete);
      if (!close(live.today, browser.today) || !close(live.sent_today, browser.sent_today)
        || !close(live.value_adjust, browser.value_adjust)
        || !close(live.today_delta, browser.today_delta)) {
        vaMismatch += 1;
      }
      if (stored.today != null && stored.sent_today != null) {
        if (!close(stored.today, live.today) || !close(stored.sent_today, live.sent_today)
          || !close(stored.value_adjust || 0, live.value_adjust || 0)) {
          storeMismatch += 1;
        }
      }
    }
    if (t.even && t.even.today_delta != null && (t.others || []).length === 1 && !t.incomplete) {
      const k = t.transaction_id;
      if (!pair.has(k)) pair.set(k, []);
      pair.get(k).push(t.even.today_delta);
    }
  }
}

let zeroBreaks = 0;
for (const ds of pair.values()) {
  if (ds.length === 2 && Math.abs(ds[0] + ds[1]) >= 1) zeroBreaks += 1;
}

{
  const star = [{ value: 8585, asset_key: "player:1", became: true }];
  const pile = [
    { value: 5773, asset_key: "pick:2027:1:mid" },
    { value: 2215, asset_key: "player:2", became: true },
    { value: 1800, asset_key: "pick:2028:2:mid" },
  ];
  const gotStar = applyToSide({ legs: star, sent: pile });
  const gotPile = applyToSide({ legs: pile, sent: star });
  if (Math.round(gotStar.value_adjust) !== 2576) {
    fail("worked example VA should be 2576, got " + Math.round(gotStar.value_adjust));
  }
  if (Math.round(gotStar.today) !== 11161) {
    fail("worked example star receive should be 11161, got " + Math.round(gotStar.today));
  }
  if (Math.round(gotPile.today) !== 9788) {
    fail("worked example pile receive should stay 9788, got " + Math.round(gotPile.today));
  }
  const br = applyVa({ legs: star, sent: pile }, false);
  if (!close(br.today, gotStar.today)) fail("browser applyVa missed the worked example");
}

if (vaMismatch) fail("inline applyVa != value-adjust.mjs on " + vaMismatch + " sides");
if (storeMismatch) fail("stored today != fresh applyToSide on " + storeMismatch + " sides");
if (nanN) fail("NaN/Infinity on " + nanN + " sides");
if (zeroBreaks) fail("zero-sum breaks on " + zeroBreaks + " two-team trades");
if (sides < 3000) fail("too few sides: " + sides);

const report = {
  sides,
  va_mismatch: vaMismatch,
  store_mismatch: storeMismatch,
  nan: nanN,
  zero_sum_breaks: zeroBreaks,
  two_team_pairs: pair.size,
  hard,
};
console.log(JSON.stringify(report, null, 2));
if (hard.length) {
  console.error("check-value-feed: " + hard.length + " hard error(s)");
  process.exit(1);
}
console.error("check-value-feed: ok " + sides + " sides");
