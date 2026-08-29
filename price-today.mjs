/** Today-only pricing: retired=0, else 0.40 flatten + 0.60 KTC when a snap exists. */
import fs from "node:fs";
import { DATA, pickTier, readJson } from "./lib.mjs";

export const TODAY_FLAT_W = 0.40;
export const TODAY_KTC_W = 0.60;
export const TEAMS = 10;
export const TINY_RAW_MAX = 10;
export const TINY_FLAT_MAX = 1200;

/** Done names missing from KTC. Hill (3321) is on KTC — do not list him. */
export const RETIRED_SLEEPER_IDS = new Set([
  "3164", // Ezekiel Elliott
  "4018", // Joe Mixon
  "4988", // Nick Chubb
]);

export function normName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\b(jr|sr|iii|ii|iv)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function listKtcSnaps() {
  const dir = `${DATA}/ktc`;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

/** Latest committed KTC file with as_of <= day. No file → null (flatten-only). */
export function loadKtcAsOf(day) {
  const dates = listKtcSnaps().filter((d) => d <= day);
  if (dates.length) return readJson(`ktc/${dates[dates.length - 1]}.json`);
  const latest = readJson("ktc/latest.json", null);
  if (latest?.as_of && latest.as_of <= day) return latest;
  return null;
}

export function buildKtcIndexes(snap) {
  const bySleeper = new Map();
  const byPick = new Map();
  const byName = new Map();
  for (const p of snap?.players || []) {
    if (p.pick_key) byPick.set(p.pick_key, p);
    if (p.sleeper_id) bySleeper.set(String(p.sleeper_id), p);
    const n = normName(p.name);
    if (n && !byName.has(n)) byName.set(n, p);
  }
  return { bySleeper, byPick, byName, as_of: snap?.as_of || null };
}

export function loadNflPlayers() {
  return readJson("players.nfl.json", {}) || {};
}

export function nflNameIndex(players) {
  const byName = new Map();
  for (const [id, p] of Object.entries(players)) {
    const n = normName(p.full_name);
    if (n && !byName.has(n)) byName.set(n, id);
  }
  return byName;
}

export function sleeperIdFromLeg(leg, nameToId) {
  const key = String(leg?.asset_key || "");
  const m = key.match(/^player:(\d+)$/);
  if (m) return m[1];
  const became = leg?.became || (leg?.kind === "player" ? leg.label : null);
  if (became && nameToId) return nameToId.get(normName(became)) || null;
  return null;
}

export function pickvalKey(leg) {
  if (!leg || leg.became) return null;
  const key = String(leg.asset_key || "");
  const m = key.match(/^pick:(\d{4}):(\d+):(\d+)$/);
  if (!m) return null;
  const [, year, round, slot] = m;
  let tier = pickTier(Number(slot), TEAMS);
  const flag = String(leg.flag || "");
  if (/priced_as_early/i.test(flag)) tier = "Early";
  else if (/priced_as_late/i.test(flag)) tier = "Late";
  else if (/priced_as_mid/i.test(flag)) tier = "Mid";
  return `pickval:${year}:${round}:${tier}`;
}

function hasNflTeam(player) {
  const team = player?.team || player?.team_abbr;
  if (!team || team === "FA" || team === "None") return false;
  return true;
}

function onKtcBoard(leg, idx, sid) {
  if (sid && idx.bySleeper.has(sid)) return true;
  const name = normName(leg?.became || (leg?.kind === "player" ? leg.label : ""));
  return !!(name && idx.byName.has(name));
}

export function isRetired(leg, ctx, flattenValue) {
  if (!leg) return false;
  if (leg.kind === "pick" && !leg.became) return false;
  const sid = sleeperIdFromLeg(leg, ctx.nameToId);
  if (sid && RETIRED_SLEEPER_IDS.has(sid)) return true;
  if (onKtcBoard(leg, ctx.ktc, sid)) return false;
  const nfl = sid ? ctx.players[sid] : null;
  const noTeam = !hasNflTeam(nfl);
  const raw = leg.raw;
  const tinyRaw = raw != null && Number.isFinite(raw) && raw > 0 && raw <= TINY_RAW_MAX;
  const flat = flattenValue != null ? flattenValue : leg.value;
  const tinyFlat = flat != null && Number.isFinite(flat) && flat > 0 && flat <= TINY_FLAT_MAX;
  return noTeam || tinyRaw || tinyFlat;
}

export function ktcValue(leg, ktcBySleeper, ktcByPick, nameToId) {
  if (!leg) return null;
  if (leg.kind === "pick" && !leg.became) {
    const key = pickvalKey(leg);
    if (!key || !ktcByPick.has(key)) return null;
    const v = ktcByPick.get(key).value;
    return Number.isFinite(v) ? v : null;
  }
  const sid = sleeperIdFromLeg(leg, nameToId);
  if (!sid || !ktcBySleeper.has(sid)) return null;
  const v = ktcBySleeper.get(sid).value;
  return Number.isFinite(v) ? v : null;
}

export function priceTodayValue(flattenValue, leg, ctx) {
  if (flattenValue == null || !Number.isFinite(flattenValue)) return flattenValue;
  if (isRetired(leg, ctx, flattenValue)) return 0;
  const ktc = ktcValue(leg, ctx.ktc.bySleeper, ctx.ktc.byPick, ctx.nameToId);
  if (ktc == null) return flattenValue;
  return Math.round(TODAY_FLAT_W * flattenValue + TODAY_KTC_W * ktc);
}

export function repriceTodayLegs(legs, ctx) {
  return (legs || []).map((l) => {
    const flat = l.value_flat != null ? l.value_flat : l.value;
    if (flat == null || !Number.isFinite(flat)) return l;
    const priced = { ...l, value: flat };
    return { ...l, value_flat: flat, value: priceTodayValue(flat, priced, ctx) };
  });
}

export function makeTodayPrice(asOf) {
  const snap = loadKtcAsOf(asOf);
  const players = loadNflPlayers();
  return {
    as_of: asOf,
    ktc: buildKtcIndexes(snap),
    players,
    nameToId: nflNameIndex(players),
    hasKtc: !!snap,
  };
}
