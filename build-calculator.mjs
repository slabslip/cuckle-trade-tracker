#!/usr/bin/env node
/**
 * League calculator catalog: rostered players + still-held picks on the today book
 * (flatten + 40/60 KTC). Same flatten constants as revalue.mjs.
 */
import { existsSync, readFileSync } from "node:fs";
import { leagueUiDir, pickTier, readJson, setLeagueId, writeUi } from "./lib.mjs";
import { makeTodayPrice, priceTodayValue } from "./price-today.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

const FLAT_SCALE = 10000;
const FLAT_EXP = 0.3;
const FLAT_TOP_MIX = 0.5;
const TEAMS = Number((readJson("leagues.json", [])[0] || {}).total_rosters
  || (readJson("members.json", []) || []).length || 10);

function flatten(v, top) {
  if (v == null) return null;
  if (v <= 0) return 0;
  const t = v / top;
  const w = t ** FLAT_TOP_MIX;
  return Math.round(FLAT_SCALE * (w * t + (1 - w) * (t ** FLAT_EXP)));
}

function indexCurve(curve) {
  const map = new Map();
  for (const r of curve) {
    if (!r?.asset_key) continue;
    if (!map.has(r.asset_key)) map.set(r.asset_key, []);
    map.get(r.asset_key).push(r);
  }
  for (const rows of map.values()) rows.sort((a, b) => a.as_of.localeCompare(b.as_of));
  return map;
}

function indexVmax(curve) {
  const by = new Map();
  for (const r of curve) {
    if (r.value == null) continue;
    const prev = by.get(r.as_of) || 0;
    if (r.value > prev) by.set(r.as_of, r.value);
  }
  return { by, dates: [...by.keys()].sort() };
}

function vmaxAt(idx, asOf) {
  let v = null;
  for (const d of idx.dates) {
    if (d <= asOf) v = idx.by.get(d);
  }
  if (v == null && idx.dates.length) v = idx.by.get(idx.dates[0]);
  return v || FLAT_SCALE;
}

function latestAsOf(curve) {
  let d = "";
  for (const r of curve) if (r.as_of && r.as_of > d) d = r.as_of;
  return d || new Date().toISOString().slice(0, 10);
}

function asofRowNear(index, key, asOf) {
  const rows = index.get(key);
  if (!rows) return null;
  let best = null;
  for (const row of rows) if (row.as_of <= asOf) best = row;
  return best || rows[0] || null;
}

function playerValue(index, key, asOf) {
  const rows = index.get(key);
  if (!rows?.length) return { value: null };
  let at = null;
  let lastPos = null;
  for (const row of rows) {
    if (row.as_of > asOf) break;
    at = row;
    if (row.value > 0) lastPos = row;
  }
  if (lastPos) return { value: lastPos.value };
  const firstPos = rows.find((r) => r.value > 0);
  if (firstPos) return { value: firstPos.value };
  if (at) return { value: at.value };
  return { value: rows[0].value };
}

function pickValueAt(index, year, round, slot, asOf) {
  const y = String(year);
  const r = Number(round);
  if (slot) {
    const exactKey = `pickval:${y}:${r}:${Number(slot)}`;
    const exact = asofRowNear(index, exactKey, asOf);
    if (exact) return { value: exact.value };
    const wanted = pickTier(slot, TEAMS);
    const tier = asofRowNear(index, `pickval:${y}:${r}:${wanted}`, asOf);
    if (tier) return { value: tier.value };
    return { value: null };
  }
  const mid = asofRowNear(index, `pickval:${y}:${r}:Mid`, asOf);
  return { value: mid ? mid.value : null };
}

let _pickYears = null;
let _pickMaxRound = null;
function pickBoardYears(index) {
  if (_pickYears) return _pickYears;
  const ys = new Set();
  let maxR = 0;
  for (const key of index.keys()) {
    if (!key.startsWith("pickval:")) continue;
    const p = key.split(":");
    ys.add(Number(p[1]));
    maxR = Math.max(maxR, Number(p[2]) || 0);
  }
  _pickYears = [...ys].sort((a, b) => a - b);
  _pickMaxRound = maxR || 4;
  return _pickYears;
}

function pickValue(index, year, round, slot, asOf) {
  const y0 = Number(year);
  const r0 = Number(round);
  const years = pickBoardYears(index).slice().sort((a, b) => {
    const d = Math.abs(a - y0) - Math.abs(b - y0);
    return d || a - b;
  });
  const tryRound = (r) => {
    const useSlot = r === r0 ? slot : null;
    for (const y of years) {
      const hit = pickValueAt(index, y, r, useSlot, asOf);
      if (hit.value == null) continue;
      return hit;
    }
    return null;
  };
  return tryRound(r0) || tryRound(_pickMaxRound) || { value: null };
}

function pricePlayer(sid, name, ownerId, ownerName, curveIdx, vmax, today, todayPrice) {
  const key = `player:${sid}`;
  const raw = playerValue(curveIdx, key, today).value;
  const flat = raw == null ? null : flatten(raw, vmax);
  const value = priceTodayValue(flat, {
    kind: "player",
    asset_key: key,
    label: name,
    raw,
    value: flat,
  }, todayPrice);
  return {
    id: key,
    kind: "player",
    sleeper_id: String(sid),
    name,
    owner_id: ownerId,
    owner: ownerName,
    value: value == null ? null : Math.round(value),
    value_flat: flat,
  };
}

function pricePick(key, row, ownerId, ownerName, curveIdx, vmax, today, todayPrice) {
  const parts = String(key).split(":");
  const year = parts[1];
  const round = Number(parts[2]);
  const slot = parts[3] ? Number(parts[3]) : null;
  const raw = pickValue(curveIdx, year, round, slot, today).value;
  const flat = raw == null ? null : flatten(raw, vmax);
  const value = priceTodayValue(flat, {
    kind: "pick",
    asset_key: key,
    label: row.label,
    value: flat,
  }, todayPrice);
  return {
    id: key,
    kind: "pick",
    name: row.label || key,
    year,
    round,
    slot,
    owner_id: ownerId,
    owner: ownerName,
    value: value == null ? null : Math.round(value),
    value_flat: flat,
  };
}

function hopOwner(row) {
  const hops = row.hops || [];
  if (!hops.length) return null;
  return hops[hops.length - 1].to || hops[hops.length - 1].from || null;
}

const curve = readJson("value_curve.json", []);
const members = readJson("members.json", []) || [];
const rosters = readJson("rosters_now.json", []) || [];
const playersNfl = readJson("players.nfl.json", {}) || {};
const ktcSnap = readJson("ktc/latest.json", {}) || {};
const ktcNameBySid = Object.fromEntries(
  (ktcSnap.players || []).filter((p) => p.sleeper_id && p.name)
    .map((p) => [String(p.sleeper_id), p.name]),
);
const picksPath = `${leagueUiDir()}/picks.json`;
const picks = existsSync(picksPath)
  ? JSON.parse(readFileSync(picksPath, "utf8"))
  : {};

const nameById = Object.fromEntries(members.map((m) => [String(m.user_id), m.name || m.canonical_name]));
const idByName = Object.fromEntries(members.map((m) => [m.name || m.canonical_name, String(m.user_id)]));

const today = latestAsOf(curve);
const curveIdx = indexCurve(curve);
const vmax = vmaxAt(indexVmax(curve), today);
const todayPrice = makeTodayPrice(today);

const players = [];
for (const r of rosters) {
  const ownerId = String(r.owner_id || "");
  const ownerName = nameById[ownerId] || ownerId;
  for (const pid of r.players || []) {
    const p = playersNfl[String(pid)] || {};
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ")
      || ktcNameBySid[String(pid)] || String(pid);
    players.push(pricePlayer(pid, name, ownerId, ownerName, curveIdx, vmax, today, todayPrice));
  }
}

const picksOut = [];
for (const [key, row] of Object.entries(picks)) {
  if (!row || !row.still_pick) continue;
  const ownerName = hopOwner(row);
  const ownerId = ownerName ? (idByName[ownerName] || "") : "";
  picksOut.push(pricePick(key, row, ownerId, ownerName || "", curveIdx, vmax, today, todayPrice));
}

players.sort((a, b) => (b.value || 0) - (a.value || 0) || a.name.localeCompare(b.name));
picksOut.sort((a, b) => (b.value || 0) - (a.value || 0) || a.name.localeCompare(b.name));

const book = {
  v: 1,
  as_of: today,
  book: "even",
  players,
  picks: picksOut,
};

writeUi("calculator.json", book);
console.log(`calculator.json ${players.length} players, ${picksOut.length} picks, as_of ${today}`);
