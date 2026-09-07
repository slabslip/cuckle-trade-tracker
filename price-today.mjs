/** Today-only pricing: retired=0, else a renormalized multi-source blend. */
import { pickTier, readJson } from "./lib.mjs";
import { listSnapDates, loadLatestSnap, loadSnapAsOf } from "./market-snap.mjs";

export const TODAY_FLAT_W = 0.25;
export const TODAY_KTC_W = 0.30;
export const TODAY_FC_W = 0.25;
export const TODAY_DD_W = 0.20;
export const TEAMS = 10;
/** Treat a market board as already ~10k when its max sits in this band. */
const SCALE_LO = 8000;
const SCALE_HI = 12000;
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
  return listSnapDates("ktc");
}

/** Latest committed KTC file with as_of <= day. No file → null (flatten-only). */
export function loadKtcAsOf(day) {
  return loadSnapAsOf("ktc", day);
}

export function buildKtcIndexes(snap) {
  return buildMarketIndexes(snap);
}

export function buildMarketIndexes(snap) {
  const bySleeper = new Map();
  const byPick = new Map();
  const byName = new Map();
  const values = [];
  for (const p of snap?.players || []) {
    if (p.pick_key) byPick.set(p.pick_key, p);
    if (p.sleeper_id) bySleeper.set(String(p.sleeper_id), p);
    const n = normName(p.name);
    if (n && !byName.has(n)) byName.set(n, p);
    if (Number.isFinite(p.value) && p.value > 0) values.push(p.value);
  }
  return { bySleeper, byPick, byName, as_of: snap?.as_of || null, vmax: vmaxOf(values) };
}

/** A 0 quote is a miss, not a price. DynastyDealer ships hundreds of placeholder zeros. */
export function marketQuote(v) {
  return Number.isFinite(v) && v > 0 ? v : null;
}

function vmaxOf(values) {
  let mx = 0;
  for (const v of values) if (v > mx) mx = v;
  return mx || null;
}

export function scaleToFlat(v, vmax) {
  if (v == null || !Number.isFinite(v)) return null;
  if (!vmax || (vmax >= SCALE_LO && vmax <= SCALE_HI)) return v;
  return Math.round(10000 * v / vmax);
}

export function loadNflPlayers() {
  return readJson("players.nfl.json", {}) || {};
}

/** DynastyProcess Superflex prices offence only, so an offensive namesake wins a tie. */
export const SKILL_POS = new Set(["QB", "RB", "WR", "TE"]);

/**
 * 357 Sleeper names collide. First-id-wins handed "Kenneth Walker" to a retired WR
 * instead of the KC back, which then missed KTC and priced flatten-only.
 * Rank candidates: on the Superflex board, on a roster, still active.
 *
 * Exported because news-match.mjs faces the same 357 collisions from the other direction — a
 * headline naming "Josh Allen" has to pick between the Bills quarterback and a Jaguars
 * linebacker — and a second ranking function would be a second thing to keep in agreement.
 */
export function nameCandidateScore(p) {
  let score = 0;
  if (SKILL_POS.has(String(p?.position || "").toUpperCase())) score += 8;
  if (hasNflTeam(p)) score += 4;
  if (p?.active) score += 2;
  return score;
}

export function nflNameIndex(players) {
  const best = new Map();
  for (const [id, p] of Object.entries(players)) {
    const n = normName(p.full_name);
    if (!n) continue;
    const score = nameCandidateScore(p);
    const prev = best.get(n);
    // Equal score: prefer the higher id, i.e. the more recent player.
    if (!prev || score > prev.score || (score === prev.score && Number(id) > Number(prev.id))) {
      best.set(n, { id, score });
    }
  }
  const byName = new Map();
  for (const [n, v] of best) byName.set(n, v.id);
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

/** Off the KTC Superflex board *and* off an NFL roster. A cheap rostered QB2 is not retired. */
export function isRetired(leg, ctx) {
  if (!leg) return false;
  if (leg.kind === "pick" && !leg.became) return false;
  const sid = sleeperIdFromLeg(leg, ctx.nameToId);
  if (sid && RETIRED_SLEEPER_IDS.has(sid)) return true;
  if (onKtcBoard(leg, ctx.ktc, sid)) return false;
  const players = ctx.players || {};
  // Empty NFL dict (gitignore / cache miss) must not retire the off-KTC board.
  if (!Object.keys(players).length) return false;
  return !hasNflTeam(sid ? players[sid] : null);
}

export function marketValue(leg, idx, nameToId) {
  if (!leg || !idx) return null;
  if (leg.kind === "pick" && !leg.became) {
    const key = pickvalKey(leg);
    if (!key) return null;
    let row = idx.byPick.get(key);
    if (!row) {
      const mid = key.replace(/:(Early|Late)$/, ":Mid");
      if (mid !== key) row = idx.byPick.get(mid);
    }
    return marketQuote(row?.value);
  }
  const sid = sleeperIdFromLeg(leg, nameToId);
  if (sid) {
    if (!idx.bySleeper.has(sid)) return null;
    return marketQuote(idx.bySleeper.get(sid).value);
  }
  const name = normName(leg.became || (leg.kind === "player" ? leg.label : ""));
  const row = name ? idx.byName.get(name) : null;
  return marketQuote(row?.value);
}

export function ktcValue(leg, ktcBySleeper, ktcByPick, nameToId, ktcByName) {
  return marketValue(leg, {
    bySleeper: ktcBySleeper,
    byPick: ktcByPick,
    byName: ktcByName || new Map(),
  }, nameToId);
}

function scaledMarket(leg, idx, nameToId) {
  return scaleToFlat(marketValue(leg, idx, nameToId), idx?.vmax);
}

/**
 * retired → 0
 * else today = sum(w_i * scale_i(source_i)) / sum(w_i of sources that hit)
 * Flatten-only when every market source misses. Do not invent a DP row from FC/DD.
 */
export function priceTodayValue(flattenValue, leg, ctx) {
  if (flattenValue == null || !Number.isFinite(flattenValue)) return flattenValue;
  if (isRetired(leg, ctx)) return 0;
  const parts = [
    { w: TODAY_FLAT_W, v: flattenValue },
    { w: TODAY_KTC_W, v: scaledMarket(leg, ctx.ktc, ctx.nameToId) },
    { w: TODAY_FC_W, v: scaledMarket(leg, ctx.fc, ctx.nameToId) },
    { w: TODAY_DD_W, v: scaledMarket(leg, ctx.dd, ctx.nameToId) },
  ].filter((p) => p.v != null && Number.isFinite(p.v));
  if (parts.length <= 1) return flattenValue;
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  if (!wsum) return flattenValue;
  return Math.round(parts.reduce((s, p) => s + p.w * p.v, 0) / wsum);
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
  const ktcSnap = loadLatestSnap("ktc") || loadSnapAsOf("ktc", asOf);
  const fcSnap = loadLatestSnap("fc") || loadSnapAsOf("fc", asOf);
  const ddSnap = loadLatestSnap("dd") || loadSnapAsOf("dd", asOf);
  const players = loadNflPlayers();
  return {
    as_of: asOf,
    ktc: buildMarketIndexes(ktcSnap),
    fc: buildMarketIndexes(fcSnap),
    dd: buildMarketIndexes(ddSnap),
    players,
    nameToId: nflNameIndex(players),
    hasKtc: !!ktcSnap,
    hasFc: !!fcSnap,
    hasDd: !!ddSnap,
  };
}
