#!/usr/bin/env node
/**
 * In-depth today-book / ingest audit. Prints a report and exits 1 on hard errors.
 * Does not scrape. Does not write the book.
 */
import { readJson } from "./lib.mjs";
import {
  RETIRED_SLEEPER_IDS,
  TODAY_DD_W,
  TODAY_FC_W,
  TODAY_FLAT_W,
  TODAY_KTC_W,
  buildMarketIndexes,
  isRetired,
  makeTodayPrice,
  marketValue,
  priceTodayValue,
  scaleToFlat,
} from "./price-today.mjs";

const hard = [];
const warn = [];
function fail(msg) { hard.push(msg); }
function note(msg) { warn.push(msg); }

function finitePos(v) {
  return Number.isFinite(v) && v > 0;
}

const calc = readJson("ui/calculator.json", { players: [], picks: [] });
const pe = readJson("ui/pe.json", { players: {} });
const ktc = readJson("ktc/latest.json", { players: [] });
const fc = readJson("fc/latest.json", { players: [] });
const dd = readJson("dd/latest.json", { players: [] });
const today = calc.as_of || new Date().toISOString().slice(0, 10);
const ctx = makeTodayPrice(today);

function dupIds(snap, label) {
  const seen = new Map();
  const dups = [];
  for (const p of snap.players || []) {
    if (!p.sleeper_id) continue;
    const id = String(p.sleeper_id);
    if (seen.has(id)) dups.push({ id, a: seen.get(id), b: p.name, va: seen.get(id + ":v"), vb: p.value });
    else {
      seen.set(id, p.name);
      seen.set(id + ":v", p.value);
    }
  }
  if (dups.length) fail(`${label} duplicate sleeper_ids: ${dups.slice(0, 8).map((d) => d.id).join(",")}`);
  return { n: seen.size / 2, dups };
}

const ktcD = dupIds(ktc, "ktc");
const fcD = dupIds(fc, "fc");
const ddD = dupIds(dd, "dd");

function zeros(snap, label) {
  const rows = (snap.players || []).filter((p) => Number.isFinite(p.value) && p.value <= 0);
  return { label, n: rows.length, sample: rows.slice(0, 12).map((p) => `${p.name}:${p.value}`) };
}
const ddZero = zeros(dd, "dd");
const fcZero = zeros(fc, "fc");
const ktcZero = zeros(ktc, "ktc");
if (ddZero.n) note(`dd has ${ddZero.n} quotes <= 0 (must miss the blend): ${ddZero.sample.join("; ")}`);
if (fcZero.n) note(`fc has ${fcZero.n} quotes <= 0`);
if (ktcZero.n) note(`ktc has ${ktcZero.n} quotes <= 0`);

const peRows = Object.entries(pe.players || {}).map(([id, r]) => ({ id, ...r }));
const peHot = peRows.filter((r) => r.pe != null && (r.pe > 8 || r.pe < 0.08 || (r.signal && r.ffpg < 4)));
if (peHot.length) {
  note(`pe outliers / thin-ffpg signals: ${peHot.length}`);
}

const roster = calc.players || [];
const picks = calc.picks || [];
const flattenOnly = [];
const gapRows = [];
const retiredWrong = [];
const hill = [];
const repriceDrift = [];
const nameFallbackHits = [];

for (const row of roster) {
  const sid = String(row.sleeper_id || "");
  const leg = { kind: "player", asset_key: `player:${sid}`, label: row.name, value: row.value_flat };
  const flat = row.value_flat;
  const ktcV = scaleToFlat(marketValue(leg, ctx.ktc, ctx.nameToId), ctx.ktc.vmax);
  const fcV = scaleToFlat(marketValue(leg, ctx.fc, ctx.nameToId), ctx.fc.vmax);
  const ddV = scaleToFlat(marketValue(leg, ctx.dd, ctx.nameToId), ctx.dd.vmax);
  const hits = [flat, ktcV, fcV, ddV].filter((v) => v != null && Number.isFinite(v));
  const marketHits = [ktcV, fcV, ddV].filter((v) => v != null && Number.isFinite(v));
  const retired = isRetired(leg, ctx);
  const recomputed = priceTodayValue(flat, { ...leg, value: flat }, ctx);
  if (sid && RETIRED_SLEEPER_IDS.has(sid) && row.value !== 0) {
    retiredWrong.push({ name: row.name, sid, value: row.value });
  }
  if (retired && row.value !== 0) retiredWrong.push({ name: row.name, sid, value: row.value, why: "isRetired" });
  if (sid === "3321") hill.push({ name: row.name, value: row.value, retired, ktcV, fcV, ddV, flat });
  if (flat != null && marketHits.length === 0 && (flat || 0) >= 2200) {
    flattenOnly.push({ name: row.name, sid, flat, today: row.value, pos: row.pos });
  }
  const posQuotes = [flat, ktcV, fcV, ddV].filter(finitePos);
  if (posQuotes.length >= 2) {
    const mx = Math.max(...posQuotes);
    const mn = Math.min(...posQuotes);
    if (mx >= 1500 && (mx - mn) / mx >= 0.35) {
      gapRows.push({
        name: row.name, sid, flat, ktc: ktcV, fc: fcV, dd: ddV, today: row.value, spread: Math.round(100 * (mx - mn) / mx),
      });
    }
  }
  if (recomputed != null && row.value != null && Math.abs(recomputed - row.value) > 1) {
    repriceDrift.push({ name: row.name, booked: row.value, recomputed, flat, ktcV, fcV, ddV });
  }
  // Name-only join when sleeper id missed a board.
  if (sid && !ctx.ktc.bySleeper.has(sid) && ctx.ktc.byName.has(String(row.name || "").toLowerCase().replace(/[.'’]/g, "").replace(/\b(jr|sr|iii|ii|iv)\b\.?/g, "").replace(/\s+/g, " ").trim())) {
    nameFallbackHits.push({ name: row.name, sid, src: "ktc" });
  }
}

const pickMiss = [];
for (const row of picks) {
  const parts = String(row.id || "").split(":");
  const leg = {
    kind: "pick",
    asset_key: row.id,
    label: row.name,
    value: row.value_flat,
  };
  const ktcV = marketValue(leg, ctx.ktc, ctx.nameToId);
  const fcV = marketValue(leg, ctx.fc, ctx.nameToId);
  const ddV = marketValue(leg, ctx.dd, ctx.nameToId);
  const marketHits = [ktcV, fcV, ddV].filter((v) => v != null && Number.isFinite(v) && v > 0);
  if ((row.value_flat || 0) >= 1800 && marketHits.length === 0) {
    pickMiss.push({ name: row.name, id: row.id, flat: row.value_flat, today: row.value });
  }
}

const blendUnit = (() => {
  const ctx2 = {
    ktc: { vmax: 9998, bySleeper: new Map([["1", { value: 9000 }]]), byPick: new Map(), byName: new Map() },
    fc: { vmax: 10346, bySleeper: new Map([["1", { value: 8500 }]]), byPick: new Map(), byName: new Map() },
    dd: { vmax: 10000, bySleeper: new Map([["1", { value: 8800 }]]), byPick: new Map(), byName: new Map() },
    players: { 1: { position: "RB", team: "DET", active: true } },
    nameToId: new Map(),
  };
  const all = priceTodayValue(8000, { kind: "player", asset_key: "player:1", label: "Unit" }, ctx2);
  const want = Math.round((0.25 * 8000 + 0.30 * 9000 + 0.25 * 8500 + 0.20 * 8800) / 1);
  const flatKtc = priceTodayValue(8000, { kind: "player", asset_key: "player:1", label: "Unit" }, {
    ...ctx2,
    fc: { vmax: 10346, bySleeper: new Map(), byPick: new Map(), byName: new Map() },
    dd: { vmax: 10000, bySleeper: new Map(), byPick: new Map(), byName: new Map() },
  });
  const want2 = Math.round((0.25 * 8000 + 0.30 * 9000) / 0.55);
  const zeroDd = priceTodayValue(8000, { kind: "player", asset_key: "player:2", label: "Zero" }, {
    ...ctx2,
    ktc: { vmax: 9998, bySleeper: new Map(), byPick: new Map(), byName: new Map() },
    fc: { vmax: 10346, bySleeper: new Map(), byPick: new Map(), byName: new Map() },
    dd: { vmax: 10000, bySleeper: new Map([["2", { value: 0 }]]), byPick: new Map(), byName: new Map() },
    players: { 2: { position: "WR", team: "MIA", active: true } },
  });
  return { all, want, flatKtc, want2, zeroDd };
})();

if (blendUnit.all !== blendUnit.want) fail(`all-four blend ${blendUnit.all} != ${blendUnit.want}`);
if (blendUnit.flatKtc !== blendUnit.want2) fail(`flat+ktc blend ${blendUnit.flatKtc} != ${blendUnit.want2}`);
if (blendUnit.zeroDd !== 8000) fail(`DD 0 entered the blend (today=${blendUnit.zeroDd}, want flatten-only 8000)`);
if (!ctx.hasFc || !ctx.hasDd) fail("today book missing FantasyCalc or DynastyDealer latest snap");
if (ctx.fc.vmax == null || ctx.dd.vmax == null) fail("fc/dd vmax missing — snaps not loaded into today book");
if (peHot.length) fail(`pe thin-ffpg or extreme signals: ${peHot.length}`);

if (retiredWrong.length) fail(`retired not 0: ${retiredWrong.map((r) => r.name + "=" + r.value).join(", ")}`);
if (hill[0] && hill[0].value === 0) fail("Hill priced 0 — he is on KTC and must stay live");
if (repriceDrift.length) {
  note(`booked vs recomputed drift on ${repriceDrift.length} roster rows (rerun apply/calculator)`);
}

const report = {
  as_of: {
    calculator: calc.as_of,
    ktc: ktc.as_of,
    fc: fc.as_of,
    dd: dd.as_of,
    pe: pe.as_of,
  },
  weights: { flat: TODAY_FLAT_W, ktc: TODAY_KTC_W, fc: TODAY_FC_W, dd: TODAY_DD_W },
  snaps: {
    ktc_players: (ktc.players || []).length,
    fc_players: (fc.players || []).length,
    dd_players: (dd.players || []).length,
    ktc_mapped: ktcD.n,
    fc_mapped: fcD.n,
    dd_mapped: ddD.n,
    ktc_unmatched: (ktc.unmatched || []).length,
  },
  zeros: { dd: ddZero, fc: fcZero, ktc: ktcZero },
  roster: {
    n: roster.length,
    flatten_only_startable: flattenOnly.sort((a, b) => (b.flat || 0) - (a.flat || 0)).slice(0, 20),
    flatten_only_n: flattenOnly.length,
    source_gap_ge_35: gapRows.sort((a, b) => b.spread - a.spread).slice(0, 20),
    source_gap_n: gapRows.length,
    retired_wrong: retiredWrong,
    hill,
    reprice_drift_n: repriceDrift.length,
    reprice_drift: repriceDrift.slice(0, 12),
    name_fallback: nameFallbackHits.slice(0, 12),
  },
  picks: {
    n: picks.length,
    flatten_only_startable: pickMiss.slice(0, 20),
    flatten_only_n: pickMiss.length,
  },
  pe: {
    n: peRows.length,
    with_signal: peRows.filter((r) => r.signal).length,
    outliers: peHot.sort((a, b) => (b.pe || 0) - (a.pe || 0)).slice(0, 20).map((r) => ({
      id: r.id, pos: r.pos, ffpg: r.ffpg, gp: r.gp, pe: r.pe, signal: r.signal,
    })),
  },
  blend_unit: blendUnit,
  board_max: { ktc: ctx.ktc.vmax, fc: ctx.fc.vmax, dd: ctx.dd.vmax },
  hard,
  warn,
};

console.log(JSON.stringify(report, null, 2));
if (hard.length) {
  console.error(`audit-values: ${hard.length} hard error(s)`);
  process.exit(1);
}
console.error(`audit-values: ok with ${warn.length} note(s)`);
