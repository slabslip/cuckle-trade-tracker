/**
 * True best-ball weekly score: fill starter slots from the full roster's
 * players_points (starters + bench), not the set lineup.
 */

const BENCH_SLOTS = new Set(["BN", "IR", "TAXI", "RESERVE", "OE"]);

/** Map Sleeper fantasy positions onto slot labels. */
export function canonPlayerPos(pos) {
  const p = String(pos || "").toUpperCase();
  if (p === "FB") return "RB";
  if (p === "DEF" || p === "DST") return "DEF";
  return p;
}

export function starterSlots(rosterPositions) {
  return (rosterPositions || []).filter((p) => p && !BENCH_SLOTS.has(String(p).toUpperCase()));
}

function flexEligible(slot) {
  const s = String(slot || "").toUpperCase();
  if (s === "FLEX" || s === "WRRB_FLEX" || s === "REC_FLEX") {
    return new Set(["RB", "WR", "TE"]);
  }
  if (s === "SUPER_FLEX" || s === "QBFLEX") {
    return new Set(["QB", "RB", "WR", "TE"]);
  }
  if (s === "WRRBTE_FLEX") return new Set(["RB", "WR", "TE"]);
  return null;
}

function isFlexSlot(slot) {
  return !!flexEligible(slot);
}

/**
 * @param {Record<string, number>} playersPoints — Sleeper matchup.players_points
 * @param {Record<string, string>} posById — player_id → fantasy position
 * @param {string[]} rosterPositions — league.roster_positions
 * @returns {{ points: number, starters: Array<{id:string,pos:string,pts:number,slot:string}>, left: number }}
 */
export function optimalLineupFromPoints(playersPoints, posById, rosterPositions) {
  const slots = starterSlots(rosterPositions);
  const pool = [];
  for (const [id, raw] of Object.entries(playersPoints || {})) {
    if (!id || id === "0") continue;
    const pts = Number(raw);
    if (!Number.isFinite(pts)) continue;
    const pos = canonPlayerPos(posById[id] || posById[String(id)]);
    if (!pos) continue;
    pool.push({ id: String(id), pts, pos });
  }
  pool.sort((a, b) => b.pts - a.pts || a.id.localeCompare(b.id));

  const used = new Set();
  const starters = [];
  let points = 0;

  // Strict slots first (QB/RB/WR/TE/K/DEF).
  for (const slot of slots) {
    if (isFlexSlot(slot)) continue;
    const want = String(slot).toUpperCase();
    const hit = pool.find((p) => !used.has(p.id) && p.pos === want);
    if (!hit) continue;
    used.add(hit.id);
    points += hit.pts;
    starters.push({ id: hit.id, pos: hit.pos, pts: hit.pts, slot: want });
  }

  // Flex / Superflex from leftovers.
  for (const slot of slots) {
    const ok = flexEligible(slot);
    if (!ok) continue;
    const hit = pool.find((p) => !used.has(p.id) && ok.has(p.pos));
    if (!hit) continue;
    used.add(hit.id);
    points += hit.pts;
    starters.push({
      id: hit.id,
      pos: hit.pos,
      pts: hit.pts,
      slot: String(slot).toUpperCase(),
    });
  }

  const allPts = pool.reduce((s, p) => s + p.pts, 0);
  const left = Math.round((allPts - points) * 100) / 100;
  return {
    points: Math.round(points * 100) / 100,
    starters,
    left,
  };
}

/**
 * Pair matchup rows by matchup_id and decide W/L/T from a score getter.
 * @param {Array<object>} rows — Sleeper matchup rows for one week
 * @param {(row: object) => number} scoreOf
 * @returns {Map<number, { result: 'W'|'L'|'T', score: number, opp: number, opp_roster_id: number }>}
 */
export function weekResultsFromScores(rows, scoreOf) {
  const byM = new Map();
  for (const row of rows || []) {
    if (!row || row.matchup_id == null) continue;
    if (!byM.has(row.matchup_id)) byM.set(row.matchup_id, []);
    byM.get(row.matchup_id).push(row);
  }
  const out = new Map();
  for (const group of byM.values()) {
    if (group.length < 2) continue;
    const a = group[0];
    const b = group[1];
    const ap = Number(scoreOf(a)) || 0;
    const bp = Number(scoreOf(b)) || 0;
    const ra = Number(a.roster_id);
    const rb = Number(b.roster_id);
    if (!Number.isFinite(ra) || !Number.isFinite(rb)) continue;
    let aRes = "T";
    let bRes = "T";
    if (ap > bp) { aRes = "W"; bRes = "L"; }
    else if (bp > ap) { aRes = "L"; bRes = "W"; }
    out.set(ra, { result: aRes, score: Math.round(ap * 100) / 100, opp: Math.round(bp * 100) / 100, opp_roster_id: rb });
    out.set(rb, { result: bRes, score: Math.round(bp * 100) / 100, opp: Math.round(ap * 100) / 100, opp_roster_id: ra });
  }
  return out;
}

export function emptyRecord() {
  return { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, weeks: 0 };
}

export function applyResult(rec, result, score, opp) {
  if (result === "W") rec.wins += 1;
  else if (result === "L") rec.losses += 1;
  else rec.ties += 1;
  rec.pf = Math.round((rec.pf + (Number(score) || 0)) * 100) / 100;
  rec.pa = Math.round((rec.pa + (Number(opp) || 0)) * 100) / 100;
  rec.weeks += 1;
}

export function recordLabel(rec) {
  if (!rec) return "0-0";
  const base = `${rec.wins || 0}-${rec.losses || 0}`;
  return rec.ties ? `${base}-${rec.ties}` : base;
}
