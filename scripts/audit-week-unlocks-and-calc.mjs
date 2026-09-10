#!/usr/bin/env node
/** Tape unlocks + trade/VA/calc edge walk. Fail on mismatch. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { applyToSide } from "../value-adjust.mjs";
import { cuffMove, cuffInsurance, cuffTeammateAdds } from "../cuff-formula.mjs";

const hard = [];
function fail(msg) { hard.push(msg); }

const tape = JSON.parse(readFileSync("data/leagues/1315431339301806080/raw/weekly_scores.json", "utf8"));
const cos = JSON.parse(readFileSync("data/ui/cosmetics.json", "utf8"));
const members = JSON.parse(readFileSync("data/ui/members.json", "utf8"));
const meDir = "data/ui/me";
const list = [];
for (const f of readdirSync(meDir)) {
  if (!f.endsWith(".json")) continue;
  const seat = JSON.parse(readFileSync(`${meDir}/${f}`, "utf8"));
  for (const t of seat.trades || []) list.push(t);
}

const BANDS = [
  ["week_under40", 0, 40], ["week_40", 40, 50], ["week_50", 50, 60], ["week_60", 60, 70],
  ["week_70", 70, 80], ["week_80", 80, 90], ["week_90", 90, 100], ["week_100", 100, 110],
  ["week_110", 110, 120], ["week_120", 120, 130], ["week_130", 130, 140], ["week_140", 140, 150],
  ["week_150", 150, 160], ["week_160", 160, 170], ["week_170", 170, 180], ["week_180", 180, 190],
  ["week_190", 190, 200], ["week_200", 200, 210], ["week_210", 210, 220],
  ["week_220", 220, 230], ["week_230", 230, 240], ["week_240", 240, 250],
  ["week_250", 250, 260], ["week_260", 260, Infinity],
];
function bandOf(p) {
  for (const [id, lo, hi] of BANDS) if (p >= lo && p < hi) return id;
  return null;
}

if (Number(tape.v) < 2) fail("weekly_scores must be v2 with phase");
if (tape.n !== (tape.scores || []).length) fail("weekly_scores n != scores.length");
if ((tape.n_regular || 0) + (tape.n_playoff || 0) !== tape.n) {
  fail("n_regular + n_playoff != n");
}
if (tape.scores.some((s) => s.phase !== "regular" && s.phase !== "playoff")) {
  fail("tape row missing regular|playoff phase");
}
if (tape.scores.some((s) => s.season === "2026" && s.week === 1 && s.points < 20)) {
  fail("2026 W1 partial slate leaked into tape");
}
const byWeek = {};
for (const s of tape.scores) {
  const k = `${s.season}:${s.week}`;
  byWeek[k] = (byWeek[k] || 0) + 1;
}
for (const [k, n] of Object.entries(byWeek)) {
  if (n < 8) fail(`thin week ${k} has ${n} scored seats`);
}

const pwsBySeason = {};
for (const row of tape.seasons || []) {
  pwsBySeason[String(row.season)] = Number(row.playoff_week_start);
}
if (!Object.keys(pwsBySeason).length) fail("tape seasons missing playoff_week_start");

const expect = {};
for (const s of tape.scores) {
  if (s.phase !== "regular") continue;
  const b = bandOf(s.points);
  if (!b) { fail(`unbanded score ${s.points}`); continue; }
  (expect[s.user_id] || (expect[s.user_id] = new Set())).add(b);
}
for (const m of members) {
  const uid = String(m.user_id);
  const got = Object.keys(cos.unlocks[uid] || {}).filter((k) => /^week_\w+$/.test(k) && !k.endsWith("_mark"));
  const exp = [...(expect[uid] || [])];
  for (const id of exp) {
    if (!got.includes(id)) fail(`${m.name} missing ${id}`);
    if (!cos.unlocks[uid][id + "_mark"]) fail(`${m.name} missing ${id} mark`);
  }
  for (const id of got) if (!exp.includes(id)) fail(`${m.name} extra ${id}`);
  for (const id of got) {
    const rec = String((cos.unlocks[uid][id] || ""));
    const hit = rec.match(/^(\d{4}) W(\d+)/);
    if (!hit) { fail(`${m.name} ${id} receipt not a week: ${rec}`); continue; }
    const season = hit[1];
    const week = Number(hit[2]);
    const pws = pwsBySeason[season];
    if (!Number.isFinite(pws) || week >= pws) {
      fail(`${m.name} ${id} receipt is playoff ${rec}`);
    }
  }
}
for (const c of cos.catalog.filter((x) => /^week_/.test(x.id))) {
  if (!/regular-season/.test(String(c.how || ""))) {
    fail(`catalog ${c.id} how must say regular-season`);
  }
}

const titles = cos.catalog.filter((c) => c.kind === "title");
const emblems = cos.catalog.filter((c) => c.kind === "emblem");
if (titles.length !== 68 || emblems.length !== 68) fail(`catalog ${titles.length}/${emblems.length} not 68/68`);
for (const c of titles) {
  if (!existsSync(`data/ui/cosmetics/title-${c.id}.png`)) fail(`missing title ${c.id}`);
}
for (const c of emblems) {
  if (!existsSync(`data/ui/cosmetics/emblem-${c.id}.png`)) fail(`missing emblem ${c.id}`);
}

let vaNan = 0;
let twoTeam = 0;
let twoBreak = 0;
for (const t of list) {
  if (!t || !t.sides) continue;
  const sides = Object.values(t.sides);
  for (const s of sides) {
    const before = { today: s.today, sent_today: s.sent_today, today_delta: s.today_delta };
    applyToSide(s, { noVa: sides.length !== 2 });
    if ([s.today, s.sent_today, s.today_delta, s.value_adjust].some((n) => n != null && Number.isNaN(n))) vaNan++;
    if (s.today != null && before.today != null && Math.abs(s.today - before.today) > 0.02) {
      fail(`VA rewrite drift ${t.id || t.transaction_id}`);
    }
  }
  if (sides.length === 2 && !t.incomplete) {
    twoTeam++;
    const a = sides[0].today_delta;
    const b = sides[1].today_delta;
    if (a != null && b != null && Math.abs(a + b) > 0.05) twoBreak++;
  }
}
if (vaNan) fail(`NaN VA on ${vaNan} sides`);
if (twoBreak) fail(`zero-sum breaks ${twoBreak} / ${twoTeam}`);

// Cuff edges: no teammate, committee, WR (weight 0), missing week.
const meta = {
  "1": { value: 9000, pos: "RB", team: "ATL" },
  "2": { value: 1500, pos: "RB", team: "ATL" },
  "3": { value: 8000, pos: "WR", team: "ATL" },
  "4": { value: 4500, pos: "RB", team: "ATL" },
};
const adds = cuffTeammateAdds({
  recv: { "2": 1500 },
  haveAfter: { "1": true, "2": true },
  hadStarter: { "1": true },
  meta,
  week: 3,
});
if (!Number.isFinite(adds) || adds <= 0) fail("cuff teammate add should be a positive number");
const none = cuffTeammateAdds({ recv: {}, haveAfter: {}, meta, week: 3 });
if (none) fail("empty recv still produced a cuff move");
const wr = cuffMove({ starter: 9000, cuff: 1500, pos: "WR", week: 3, weeksOut: 6 });
if (wr !== 0) fail(`WR cuff should be 0, got ${wr}`);
const cheap = cuffInsurance({ starter: 9000, cuff: 200, pos: "RB", week: 3, weeksOut: 6 });
if (!Number.isFinite(cheap) || cheap < 0) fail("cheap insurance bad");
const committee = cuffTeammateAdds({
  recv: { "4": 4500 },
  haveAfter: { "1": true, "4": true },
  hadStarter: { "1": true },
  meta,
  week: 3,
});
if (committee) fail("committee (cuff/lead >= 0.5) should not cuff");

if (hard.length) {
  console.error(hard.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  tape: tape.n,
  catalog: cos.catalog.length,
  unlocks: Object.values(cos.unlocks).reduce((a, m) => a + Object.keys(m).length, 0),
  two_team: twoTeam,
  two_breaks: twoBreak,
}, null, 2));
