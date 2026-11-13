/**
 * Most Shared — players who have been on the most different league seats
 * (draft + trades + waiver/FA). Tap a row for the seat list / stint tape.
 */

import { collectPlayerEvents, stintsFromEvents } from "./pipeline.mjs";

export const MOST_SHARED_BOOK_V = 1;
export const MOST_SHARED_TOP_N = 25;
export const MOST_SHARED_MIN_SEATS = 2;

function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function pidOf(key) {
  return String(key || "").replace(/^player:/, "");
}

function nameFromNfl(nflPlayers, pid) {
  const p = nflPlayers && nflPlayers[pid];
  if (!p || typeof p !== "object") return "";
  return cleanName([p.first_name, p.last_name].filter(Boolean).join(" ")
    || p.full_name || "");
}

/**
 * @param {object} opts
 * @returns {{ v, league_id, as_of, n, rule, players }}
 */
export function buildMostSharedBook(opts = {}) {
  const {
    leagueId = null,
    asOf = new Date().toISOString().slice(0, 10),
    members = [],
    draftPicks = [],
    tradeLegs = [],
    trades = [],
    moves = [],
    seats = [],
    rostersNow = [],
    nameHints = [],
    nflPlayers = {},
    topN = MOST_SHARED_TOP_N,
    minSeats = MOST_SHARED_MIN_SEATS,
  } = opts;

  const nameById = new Map();
  for (const m of members || []) {
    if (!m || m.user_id == null) continue;
    const nm = cleanName(m.name || m.canonical_name || m.display_name || "");
    if (nm) nameById.set(String(m.user_id), nm);
  }
  for (const h of nameHints || []) {
    if (!h || h.sleeper_id == null) continue;
    const nm = cleanName(h.name || "");
    if (nm) {
      // player name hints keyed later via labels — skip user map
    }
  }

  const { byPlayer, labels } = collectPlayerEvents({
    draftPicks,
    tradeLegs,
    trades,
    moves,
    seats,
    rostersNow,
    asOf,
  });

  const playerNameHints = new Map();
  for (const h of nameHints || []) {
    if (!h || h.sleeper_id == null) continue;
    const nm = cleanName(h.name || "");
    if (nm) playerNameHints.set(String(h.sleeper_id), nm);
  }

  const rows = [];
  for (const [key, events] of byPlayer) {
    const stints = stintsFromEvents(events, asOf, nameById);
    if (!stints.length) continue;

    const bySeat = new Map();
    for (const s of stints) {
      const uid = String(s.user_id || "");
      if (!uid) continue;
      if (!bySeat.has(uid)) {
        bySeat.set(uid, {
          user_id: uid,
          name: s.name || nameById.get(uid) || uid,
          days: 0,
          stint_n: 0,
          still_holds: false,
          first_start: s.start || null,
          last_end: s.end || null,
        });
      }
      const bag = bySeat.get(uid);
      bag.days += Number(s.days) || 0;
      bag.stint_n += 1;
      if (s.exit === "held") bag.still_holds = true;
      if (s.start && (!bag.first_start || s.start < bag.first_start)) bag.first_start = s.start;
      if (s.end && (!bag.last_end || s.end > bag.last_end)) bag.last_end = s.end;
      if (s.name) bag.name = s.name;
    }

    const seatRows = [...bySeat.values()].sort((a, b) => (
      b.days - a.days
      || b.stint_n - a.stint_n
      || String(a.name).localeCompare(String(b.name))
    ));
    const nSeats = seatRows.length;
    if (nSeats < minSeats) continue;

    const pid = pidOf(key);
    const name = cleanName(
      labels.get(key)
      || playerNameHints.get(pid)
      || nameFromNfl(nflPlayers, pid)
      || (pid ? (`Player ${pid}`) : key),
    );
    const daysTotal = seatRows.reduce((sum, s) => sum + (Number(s.days) || 0), 0);
    const seatLab = seatRows.map((s) => s.name).join(" · ");

    rows.push({
      key,
      player_id: pid,
      name,
      n_seats: nSeats,
      n_stints: stints.length,
      days_total: daysTotal,
      seat_lab: seatLab,
      seats: seatRows,
      stints: stints.map((s) => ({
        user_id: s.user_id,
        name: s.name,
        start: s.start,
        end: s.end,
        days: s.days,
        acquire: s.acquire,
        exit: s.exit,
      })),
      thesis: `${name}: ${nSeats} seats · ${stints.length} stint`
        + (stints.length === 1 ? "" : "s")
        + ` · ${seatLab}`,
    });
  }

  rows.sort((a, b) => (
    b.n_seats - a.n_seats
    || b.n_stints - a.n_stints
    || b.days_total - a.days_total
    || String(a.name).localeCompare(String(b.name))
  ));

  const players = rows.slice(0, topN).map((r, i) => ({
    ...r,
    rank: i + 1,
  }));

  return {
    v: MOST_SHARED_BOOK_V,
    league_id: leagueId != null ? String(leagueId) : null,
    as_of: asOf,
    n: players.length,
    rule: {
      min_seats: minSeats,
      top_n: topN,
      sources: ["draft", "trade", "waiver", "free_agent", "commissioner", "drop"],
    },
    players,
  };
}
