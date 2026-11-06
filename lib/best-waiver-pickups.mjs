/**
 * Waiver winners — dynasty-value lift on original waiver / FA claims only.
 *
 * A pickup counts only when that claim is the player's first roster entry in
 * the league (never drafted / traded / commissioner-added before). Drafted
 * then dropped then claimed does not count.
 *
 * Two boards (top N each):
 *   to_today — pickup value → today's curve value
 *   to_peak  — pickup value → highest curve value on/after pickup
 */

export const WAIVER_BOOK_V = 3;
export const WAIVER_TOP_N = 10;
export const WAIVER_TYPES = new Set(["waiver", "free_agent"]);

export function indexCurve(curve) {
  const map = new Map();
  for (const r of curve || []) {
    if (!r?.asset_key) continue;
    if (!map.has(r.asset_key)) map.set(r.asset_key, []);
    map.get(r.asset_key).push(r);
  }
  for (const rows of map.values()) rows.sort((a, b) => a.as_of.localeCompare(b.as_of));
  return map;
}

export function latestAsOf(curve) {
  let d = "";
  for (const r of curve || []) if (r.as_of && r.as_of > d) d = r.as_of;
  return d || new Date().toISOString().slice(0, 10);
}

/** Last positive value with as_of <= date; else first positive / last row. */
export function playerValue(index, key, asOf) {
  const rows = index.get(key);
  if (!rows?.length) return { value: null, as_of: null, source: null };
  let at = null;
  let lastPos = null;
  for (const row of rows) {
    if (row.as_of > asOf) break;
    at = row;
    if (row.value > 0) lastPos = row;
  }
  if (lastPos) return { value: lastPos.value, as_of: lastPos.as_of, source: "at_or_before" };
  const firstPos = rows.find((r) => r.value > 0);
  if (firstPos) return { value: firstPos.value, as_of: firstPos.as_of, source: "first_snap" };
  if (at) return { value: at.value, as_of: at.as_of, source: "at_or_before" };
  return { value: rows[0].value, as_of: rows[0].as_of, source: "first_row" };
}

/** Highest positive curve value on/after pickupDate. */
export function peakAfterPickup(index, key, pickupDate) {
  const rows = index.get(key) || [];
  let peak = null;
  for (const row of rows) {
    if (row.as_of < pickupDate) continue;
    if (row.value == null || row.value <= 0) continue;
    if (!peak || row.value > peak.value) peak = row;
  }
  return peak ? { value: peak.value, as_of: peak.as_of } : { value: null, as_of: null };
}

/**
 * First roster entry per player across draft picks + every move add.
 * Draft events sort before same-day moves (ord 0).
 * @returns {Map<string, { player_id, source, date, season, created }>}
 */
export function firstLeagueEntries(moves, draftPicks) {
  const events = [];
  for (const p of draftPicks || []) {
    const pid = p?.player_id != null ? String(p.player_id) : "";
    if (!pid || pid === "0") continue;
    events.push({
      player_id: pid,
      source: "draft",
      date: String(p.as_of || ""),
      season: String(p.season || ""),
      ord: 0,
      created: 0,
    });
  }
  for (const m of moves || []) {
    if (!m) continue;
    const adds = m.adds && typeof m.adds === "object" ? m.adds : null;
    if (!adds) continue;
    const date = String(m.date || "");
    const season = String(m.season || "");
    const created = Number(m.created || 0) || 0;
    const source = String(m.type || "unknown");
    for (const pid of Object.keys(adds)) {
      if (!pid || pid === "0") continue;
      events.push({
        player_id: String(pid),
        source,
        date,
        season,
        ord: 1,
        created,
      });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date)
    || a.ord - b.ord
    || a.created - b.created
    || a.player_id.localeCompare(b.player_id));
  const first = new Map();
  for (const e of events) {
    if (first.has(e.player_id)) continue;
    first.set(e.player_id, {
      player_id: e.player_id,
      source: e.source,
      date: e.date,
      season: e.season,
      created: e.created,
    });
  }
  return first;
}

/**
 * Expand moves into waiver/FA pickup legs.
 * @param {object} [opts]
 * @param {boolean} [opts.originalOnly] — only the player's first league entry,
 *   and only when that entry was waiver/FA (drafted-then-dropped claims out).
 * @returns {Array<{ transaction_id, type, date, season, week, roster_id, player_id }>}
 */
export function extractPickups(moves, draftPicks, opts = {}) {
  const originalOnly = !!opts.originalOnly;
  const firstBy = originalOnly ? firstLeagueEntries(moves, draftPicks) : null;
  const out = [];
  for (const m of moves || []) {
    if (!m || !WAIVER_TYPES.has(String(m.type || ""))) continue;
    const adds = m.adds && typeof m.adds === "object" ? m.adds : null;
    if (!adds) continue;
    for (const [pid, rid] of Object.entries(adds)) {
      if (!pid || pid === "0") continue;
      const rosterId = Number(rid);
      if (!Number.isFinite(rosterId)) continue;
      const playerId = String(pid);
      if (originalOnly) {
        const first = firstBy.get(playerId);
        if (!first || !WAIVER_TYPES.has(first.source)) continue;
        // Must be the original claim — same day + type as first league entry.
        if (String(m.date || "") !== first.date) continue;
        if (String(m.type) !== first.source) continue;
      }
      out.push({
        transaction_id: String(m.transaction_id || ""),
        type: String(m.type),
        date: String(m.date || ""),
        season: String(m.season || ""),
        week: m.week != null ? Number(m.week) : null,
        roster_id: rosterId,
        player_id: playerId,
      });
    }
  }
  return out;
}

function money(n) {
  return Math.round(Number(n));
}

function scorePickup(pickup, curveIdx, todayAsOf, nameById, seatBy) {
  if (!pickup.date) return null;
  const key = `player:${pickup.player_id}`;
  const pickupVal = playerValue(curveIdx, key, pickup.date);
  if (pickupVal.value == null || pickupVal.value < 0) return null;
  const todayVal = playerValue(curveIdx, key, todayAsOf);
  const peakVal = peakAfterPickup(curveIdx, key, pickup.date);
  const seat = seatBy.get(`${pickup.season}:${pickup.roster_id}`)
    || seatBy.get(`*:${pickup.roster_id}`)
    || null;
  const deltaToday = todayVal.value != null ? money(todayVal.value - pickupVal.value) : null;
  const deltaPeak = peakVal.value != null ? money(peakVal.value - pickupVal.value) : null;
  return {
    player_id: pickup.player_id,
    player: nameById.get(pickup.player_id) || pickup.player_id,
    picker: seat?.name || null,
    user_id: seat?.user_id || null,
    roster_id: pickup.roster_id,
    date: pickup.date,
    season: pickup.season,
    week: pickup.week,
    type: pickup.type,
    transaction_id: pickup.transaction_id,
    pickup_value: money(pickupVal.value),
    pickup_as_of: pickupVal.as_of,
    today_value: todayVal.value != null ? money(todayVal.value) : null,
    today_as_of: todayVal.as_of || todayAsOf,
    peak_value: peakVal.value != null ? money(peakVal.value) : null,
    peak_as_of: peakVal.as_of,
    delta_today: deltaToday,
    delta_peak: deltaPeak,
  };
}

function rankList(rows, deltaKey, topN) {
  const sorted = rows
    .filter((r) => r && r[deltaKey] != null && r[deltaKey] > 0)
    .slice()
    .sort((a, b) => (b[deltaKey] - a[deltaKey])
      || String(a.date).localeCompare(String(b.date))
      || String(a.player).localeCompare(String(b.player)));

  // One row per player — keep the earliest pickup that still ranks with the best delta.
  const bestByPlayer = new Map();
  for (const row of sorted) {
    const prev = bestByPlayer.get(row.player_id);
    if (!prev) {
      bestByPlayer.set(row.player_id, row);
      continue;
    }
    if (row[deltaKey] > prev[deltaKey]) bestByPlayer.set(row.player_id, row);
    else if (row[deltaKey] === prev[deltaKey] && row.date < prev.date) {
      bestByPlayer.set(row.player_id, row);
    }
  }
  return [...bestByPlayer.values()]
    .sort((a, b) => (b[deltaKey] - a[deltaKey])
      || String(a.date).localeCompare(String(b.date)))
    .slice(0, topN)
    .map((r, i) => ({
      rank: i + 1,
      player_id: r.player_id,
      player: r.player,
      picker: r.picker,
      user_id: r.user_id,
      roster_id: r.roster_id,
      date: r.date,
      season: r.season,
      week: r.week,
      type: r.type,
      transaction_id: r.transaction_id,
      pickup_value: r.pickup_value,
      pickup_as_of: r.pickup_as_of,
      today_value: r.today_value,
      today_as_of: r.today_as_of,
      peak_value: r.peak_value,
      peak_as_of: r.peak_as_of,
      delta: r[deltaKey],
    }));
}

export function buildBestWaiverPickupsBook({
  leagueId,
  asOf,
  formatKey,
  curveName,
  curve,
  moves,
  draftPicks,
  nameById,
  seatBy,
  topN = WAIVER_TOP_N,
}) {
  const curveIdx = indexCurve(curve);
  const todayAsOf = latestAsOf(curve);
  const names = nameById || new Map();
  const seats = seatBy || new Map();
  const original = extractPickups(moves, draftPicks, { originalOnly: true });
  const anyClaim = extractPickups(moves, draftPicks, { originalOnly: false });
  const scoreAll = (legs) => {
    const scored = [];
    for (const p of legs) {
      const row = scorePickup(p, curveIdx, todayAsOf, names, seats);
      if (row) scored.push(row);
    }
    return scored;
  };
  const scoredOrig = scoreAll(original);
  const scoredAny = scoreAll(anyClaim);
  const toToday = rankList(scoredOrig, "delta_today", topN);
  const toPeak = rankList(scoredOrig, "delta_peak", topN);
  const toTodayAny = rankList(scoredAny, "delta_today", topN);
  return {
    v: WAIVER_BOOK_V,
    as_of: asOf || todayAsOf,
    league_id: String(leagueId || ""),
    format_key: formatKey || "2qb",
    curve: curveName || "value_curve.json",
    n_pickups: original.length,
    n_pickups_any: anyClaim.length,
    n_scored: scoredOrig.length,
    n_scored_any: scoredAny.length,
    top_n: topN,
    rule: {
      types: ["waiver", "free_agent"],
      origin: "Original boards: first roster entry must be waiver/FA — drafted-then-dropped claims are out.",
      any_claim: "Any claim → today: every waiver/FA add counts, including drafted-then-dropped reclamations.",
      metric_today: "today_value - pickup_value (DynastyProcess SF curve)",
      metric_peak: "peak_value_after_pickup - pickup_value",
      order: "Biggest lift first; one row per player.",
    },
    to_today: toToday,
    to_peak: toPeak,
    to_today_any: toTodayAny,
  };
}
