/**
 * GM ESPN window that must land on every live Sleeper seat, and the
 * Sleeper years that ESPN must never overwrite.
 */
export const ESPN_HISTORY_YEARS = ["2020", "2021", "2022", "2023", "2024"];
export const SLEEPER_KEEP_YEARS = ["2025", "2026"];

export function yearsBySeat(espnSeats, franchiseMap) {
  const out = {};
  for (const s of espnSeats || []) {
    if (!s || s.roster_id == null || s.season == null) continue;
    const uid = franchiseMap && franchiseMap[String(s.roster_id)];
    if (!uid) continue;
    const y = String(s.season);
    if (!out[uid]) out[uid] = new Set();
    out[uid].add(y);
  }
  return out;
}

export function liveSeatsMissingHistory(liveUids, bySeat, years = ESPN_HISTORY_YEARS) {
  const missing = [];
  for (const uid of liveUids || []) {
    const have = bySeat[uid] || bySeat[String(uid)] || new Set();
    const gap = years.filter((y) => !have.has(String(y)));
    if (gap.length) missing.push({ uid: String(uid), gap });
  }
  return missing;
}

/** One-for-one parked → new Sleeper seat so next year inherits the ESPN slot. */
export function inheritParkedToLive(franchise, sleeperSeats) {
  const bySeason = new Map();
  for (const s of sleeperSeats || []) {
    if (!s || !s.owner_id || s.season == null) continue;
    const y = String(s.season);
    if (!bySeason.has(y)) bySeason.set(y, new Set());
    bySeason.get(y).add(String(s.owner_id));
  }
  const years = [...bySeason.keys()].sort();
  const out = { ...(franchise || {}) };
  for (let i = 1; i < years.length; i++) {
    const prior = bySeason.get(years[i - 1]);
    const live = bySeason.get(years[i]);
    const parked = [...prior].filter((id) => !live.has(id));
    const newcomers = [...live].filter((id) => !prior.has(id));
    if (parked.length !== 1 || newcomers.length !== 1) continue;
    const from = parked[0];
    const to = newcomers[0];
    for (const [team, uid] of Object.entries(out)) {
      if (String(uid) === from) out[team] = to;
    }
  }
  return out;
}
