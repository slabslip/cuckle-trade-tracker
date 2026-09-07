#!/usr/bin/env node
/** Second-pass edge audit: tape vs calc, windows, VA, retirees, NaNs. */
import { readdirSync, readFileSync } from "node:fs";
import { leagueUiDir, setLeagueId } from "./lib.mjs";
import {
  RETIRED_SLEEPER_IDS,
  isRetired,
  makeTodayPrice,
  priceTodayValue,
  sleeperIdFromLeg,
} from "./price-today.mjs";
import { valueAdjustment } from "./value-adjust.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID || "1315431339301806080");
const UI = leagueUiDir();
const hard = [];
const warn = [];
const fail = (m) => hard.push(m);
const note = (m) => warn.push(m);

const calc = JSON.parse(readFileSync(`${UI}/calculator.json`, "utf8"));
const league = JSON.parse(readFileSync(`${UI}/league.json`, "utf8"));
const ctx = makeTodayPrice(calc.as_of || league.today || "2026-09-01");
const calcBySid = new Map((calc.players || []).map((p) => [String(p.sleeper_id), p]));

const nanish = [];
const missingFlat = [];
const tapeVsCalc = [];
const windowBlend = [];
const liveRetirees = [];
const falseRetire = [];
const oneForOneVa = [];
const nwayVa = [];
const zeroBreaks = [];
let evenLegs = 0;
let windowZeke = null;

for (const f of readdirSync(`${UI}/me`).filter((x) => x.endsWith(".json"))) {
  const me = JSON.parse(readFileSync(`${UI}/me/${f}`, "utf8"));
  for (const t of me.trades || []) {
    const even = t.even || {};
    const nway = (t.others || []).length > 1;
    if (nway && Math.round(even.value_adjust || 0) !== 0) {
      nwayVa.push(t.transaction_id);
    }
    const got = (even.legs || []).filter((l) => l.value != null && Number.isFinite(l.value));
    const sent = (even.sent || []).filter((l) => l.value != null && Number.isFinite(l.value));
    if (got.length === 1 && sent.length === 1 && Math.round(even.value_adjust || 0) !== 0) {
      oneForOneVa.push({ tx: t.transaction_id, va: even.value_adjust });
    }
    for (const l of [...(even.legs || []), ...(even.sent || [])]) {
      evenLegs += 1;
      if (l.value != null && !Number.isFinite(Number(l.value))) nanish.push({ where: "even", t: t.transaction_id, l });
      if (l.value != null && Number.isFinite(l.value) && l.value_flat == null) {
        missingFlat.push({ tx: t.transaction_id, label: l.became || l.label, v: l.value });
      }
      const sid = sleeperIdFromLeg(l, ctx.nameToId);
      if (sid && calcBySid.has(sid) && l.value != null && Number.isFinite(l.value)) {
        const c = calcBySid.get(sid);
        if (c.value != null && Math.abs(c.value - l.value) > 1) {
          tapeVsCalc.push({
            name: c.name, sid, tape: l.value, flat: l.value_flat, calc: c.value, calcFlat: c.value_flat, tx: t.transaction_id,
          });
        }
      }
      if (sid && RETIRED_SLEEPER_IDS.has(sid) && l.value !== 0) {
        liveRetirees.push({ name: l.became || l.label, sid, v: l.value });
      }
      const retired = isRetired(l, ctx);
      if (retired && l.value !== 0 && l.value != null) {
        liveRetirees.push({ name: l.became || l.label, sid, v: l.value, why: "isRetired" });
      }
      if (!retired && l.value === 0 && sid && !RETIRED_SLEEPER_IDS.has(sid)) {
        const nfl = ctx.players[sid];
        falseRetire.push({ name: l.became || l.label, sid, team: nfl?.team, pos: nfl?.position });
      }
    }
    for (const [k, w] of Object.entries(t.windows || {})) {
      for (const l of [...(w.legs || []), ...(w.sent || [])]) {
        if (l.value != null && !Number.isFinite(Number(l.value))) nanish.push({ where: k, t: t.transaction_id });
        if ((l.became || "").includes("Ezekiel Elliott") && k === "all") windowZeke = l.value;
        // Windows must stay flatten: a retired name should still have a historical flatten > 0
        // when the window has them. Today even is 0.
        if ((l.became || "").includes("Ezekiel Elliott") && k === "all" && l.value === 0) {
          windowBlend.push({ tx: t.transaction_id, lens: k, name: "Zeke", v: l.value });
        }
      }
    }
  }
}

const pair = new Map();
for (const r of (league.trade_boards?.sides || [])) {
  const k = r.transaction_id;
  if (!pair.has(k)) pair.set(k, []);
  pair.get(k).push(r);
}
// sides in shipped league.json no longer carry today_delta — skip if absent

if (nanish.length) fail(`non-finite values: ${nanish.length}`);
if (missingFlat.length) fail(`even legs missing value_flat: ${missingFlat.length} e.g. ${missingFlat[0]?.label}`);
if (oneForOneVa.length) fail(`1-for-1 has VA: ${oneForOneVa.slice(0, 3).map((x) => x.tx).join(",")}`);
if (nwayVa.length) fail(`N-way has VA: ${nwayVa.slice(0, 3).join(",")}`);
if (liveRetirees.length) fail(`retired not 0: ${liveRetirees.slice(0, 6).map((x) => x.name + "=" + x.v).join(", ")}`);
if (windowBlend.length) fail(`windows look blended/retired: ${JSON.stringify(windowBlend[0])}`);
if (windowZeke != null && windowZeke <= 0) fail(`zeke window all is ${windowZeke} (must stay flatten > 0)`);

const uniqueMismatch = [];
const seenMis = new Set();
for (const row of tapeVsCalc) {
  const k = row.sid + ":" + row.tape + ":" + row.calc;
  if (seenMis.has(k)) continue;
  seenMis.add(k);
  uniqueMismatch.push(row);
}
if (uniqueMismatch.length) {
  note(`tape vs calculator today mismatch on ${uniqueMismatch.length} player-price pairs`);
}

// Roster retirees
for (const p of calc.players || []) {
  const leg = { kind: "player", asset_key: `player:${p.sleeper_id}`, label: p.name, value: p.value_flat };
  if (RETIRED_SLEEPER_IDS.has(String(p.sleeper_id)) && p.value !== 0) {
    fail(`calc retiree ${p.name} is ${p.value}`);
  }
  if (p.value != null && !Number.isFinite(p.value)) fail(`calc NaN ${p.name}`);
  if (p.value < 0) fail(`calc negative ${p.name}=${p.value}`);
  const rec = priceTodayValue(p.value_flat, { ...leg, value: p.value_flat }, ctx);
  if (p.value != null && rec != null && Math.abs(p.value - rec) > 1) {
    fail(`calc drift ${p.name} booked=${p.value} recomputed=${rec}`);
  }
  if (isRetired(leg, ctx) && p.value !== 0) fail(`calc isRetired but ${p.name}=${p.value}`);
}

// Mixon/Chubb must stay 0 even though FC/DD quote them
for (const sid of RETIRED_SLEEPER_IDS) {
  const p = calcBySid.get(String(sid));
  if (p && p.value !== 0) fail(`${p.name} on retire list but calc ${p.value}`);
}

// VA math sanity on a 2-for-1
const va = valueAdjustment(
  [{ value: 8585 }],
  [{ value: 5773 }, { value: 2215 }, { value: 1800 }],
);
if (Math.round(va.got) !== 2576) fail(`VA worked example got ${va.got} want 2576`);
if (Math.round(va.sent) !== 0) fail(`VA 3-for-1 sent should be 0, got ${va.sent}`);

const hill = calcBySid.get("3321");
if (!hill || hill.value === 0 || hill.value === 2892) fail(`Hill calc bad ${hill?.value}`);
if (hill && (hill.value < 1400 || hill.value > 1900)) fail(`Hill calc out of band ${hill.value}`);

const report = {
  even_legs: evenLegs,
  missing_flat: missingFlat.length,
  tape_vs_calc_unique: uniqueMismatch.length,
  tape_vs_calc: uniqueMismatch.slice(0, 15),
  false_retire: falseRetire.slice(0, 15),
  false_retire_n: falseRetire.length,
  live_retirees: liveRetirees,
  window_zeke_all: windowZeke,
  one_for_one_va: oneForOneVa,
  nway_va: nwayVa,
  nanish: nanish.length,
  hill: hill ? { today: hill.value, flat: hill.value_flat } : null,
  va_example: { got: Math.round(va.got), sent: Math.round(va.sent) },
  hard,
  warn,
};
console.log(JSON.stringify(report, null, 2));
if (hard.length) {
  console.error(`audit-pass2: ${hard.length} hard`);
  process.exit(1);
}
console.error(`audit-pass2: ok with ${warn.length} note(s)`);
