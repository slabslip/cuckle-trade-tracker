/**
 * Week-by-week starter tape → who actually put a player in the lineup.
 * Pipeline uses this as the belief / "use" signal.
 */

export const PLAYER_STARTS_V = 1;

function assetKeyOf(pid) {
  const id = String(pid || "").replace(/^player:/, "");
  return id ? `player:${id}` : "";
}

/**
 * Index a player_starts book for Pipeline scoring.
 * @returns {Map<string, { byUser: Map<string, number>, first: object|null, max: number }>}
 */
export function indexPlayerStarts(book) {
  const out = new Map();
  const byPlayer = book && book.by_player;
  if (byPlayer && typeof byPlayer === "object") {
    for (const [key, row] of Object.entries(byPlayer)) {
      if (!key || !row) continue;
      const byUser = new Map();
      const src = row.starts_by_user || {};
      let max = 0;
      for (const [uid, n] of Object.entries(src)) {
        const c = Number(n) || 0;
        if (c <= 0) continue;
        byUser.set(String(uid), c);
        if (c > max) max = c;
      }
      out.set(String(key), {
        byUser,
        first: row.first_start || null,
        max,
      });
    }
    return out;
  }
  // Fallback: aggregate raw rows
  for (const r of (book && book.rows) || []) {
    if (!r || r.player_id == null || !r.user_id) continue;
    const key = assetKeyOf(r.player_id);
    if (!key) continue;
    if (!out.has(key)) out.set(key, { byUser: new Map(), first: null, max: 0 });
    const slot = out.get(key);
    const uid = String(r.user_id);
    const next = (slot.byUser.get(uid) || 0) + 1;
    slot.byUser.set(uid, next);
    if (next > slot.max) slot.max = next;
    const cand = {
      user_id: uid,
      season: String(r.season || ""),
      week: Number(r.week) || 0,
      league_id: r.league_id != null ? String(r.league_id) : null,
    };
    if (!slot.first) slot.first = cand;
    else {
      const a = `${slot.first.season}-${String(slot.first.week).padStart(2, "0")}`;
      const b = `${cand.season}-${String(cand.week).padStart(2, "0")}`;
      if (b < a) slot.first = cand;
    }
  }
  return out;
}

export function startsForSeat(index, assetKey, userId) {
  const slot = index && index.get(String(assetKey || ""));
  if (!slot) return { starts: 0, max: 0, is_first_starter: false, first: null };
  const uid = String(userId || "");
  const starts = slot.byUser.get(uid) || 0;
  const firstUid = slot.first && slot.first.user_id != null ? String(slot.first.user_id) : "";
  return {
    starts,
    max: slot.max || 0,
    is_first_starter: !!firstUid && firstUid === uid,
    first: slot.first || null,
  };
}

/** Build by_player aggregate from start rows. */
export function aggregateStartsByPlayer(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (!r || r.player_id == null || !r.user_id) continue;
    const key = assetKeyOf(r.player_id);
    if (!key) continue;
    if (!by.has(key)) {
      by.set(key, {
        starts_by_user: {},
        first_start: null,
        n_starts: 0,
      });
    }
    const slot = by.get(key);
    const uid = String(r.user_id);
    slot.starts_by_user[uid] = (slot.starts_by_user[uid] || 0) + 1;
    slot.n_starts += 1;
    const cand = {
      user_id: uid,
      season: String(r.season || ""),
      week: Number(r.week) || 0,
      league_id: r.league_id != null ? String(r.league_id) : null,
    };
    if (!slot.first_start) slot.first_start = cand;
    else {
      const a = `${slot.first_start.season}-${String(slot.first_start.week).padStart(2, "0")}`;
      const b = `${cand.season}-${String(cand.week).padStart(2, "0")}`;
      if (b < a) slot.first_start = cand;
    }
  }
  const out = {};
  for (const [key, row] of by) out[key] = row;
  return out;
}
