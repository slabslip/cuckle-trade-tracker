/**
 * Ass denominator — players held longest on the worst rosters.
 *
 * Badness from finishes place: bottom-half weight + sacko bump.
 * Days from pipeline ownership stints (draft + trade + wire).
 */

import { collectPlayerEvents, stintsFromEvents } from "./pipeline.mjs";

export const ASS_DENOMINATOR_BOOK_V = 1;
export const ASS_DENOMINATOR_TOP_N = 25;
export const ASS_DENOMINATOR_SACKO_BONUS = 0.5;

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

function parseYmd(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function ymd(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Inclusive day count between two YYYY-MM-DD strings. */
export function daysInclusive(a, b) {
  const aa = parseYmd(a);
  const bb = parseYmd(b);
  if (aa == null || bb == null || bb < aa) return 0;
  return Math.round((bb - aa) / 86400000) + 1;
}

/** Overlap of [a0,a1] ∩ [b0,b1] in inclusive days. */
export function overlapDays(a0, a1, b0, b1) {
  const aa0 = parseYmd(a0);
  const aa1 = parseYmd(a1);
  const bb0 = parseYmd(b0);
  const bb1 = parseYmd(b1);
  if (aa0 == null || aa1 == null || bb0 == null || bb1 == null) return 0;
  const lo = Math.max(aa0, bb0);
  const hi = Math.min(aa1, bb1);
  if (hi < lo) return 0;
  return Math.round((hi - lo) / 86400000) + 1;
}

/**
 * Sleeper fantasy season window: Mar 1 of year → last day of Feb next year.
 * Incomplete current season still uses this window when a place exists.
 */
export function seasonWindow(season) {
  const y = Number(season);
  if (!Number.isFinite(y)) return null;
  const start = `${y}-03-01`;
  const endMs = Date.UTC(y + 1, 2, 0); // last day of Feb next year
  return { season: String(season), start, end: ymd(endMs) };
}

/**
 * Bottom-half linear weight + sacko bump.
 * Top half → 0. Last place → 1 + bonus (capped ~1.5).
 */
export function badWeight(place, nTeams, sackoBonus = ASS_DENOMINATOR_SACKO_BONUS) {
  const p = Number(place);
  const n = Number(nTeams);
  if (!Number.isFinite(p) || !Number.isFinite(n) || n < 2 || p < 1) return 0;
  const half = n / 2;
  let w = 0;
  if (p > half) w = (p - half) / half;
  if (p >= n) w += Number(sackoBonus) || 0;
  if (w < 0) w = 0;
  if (w > 1.5) w = 1.5;
  return Math.round(w * 1000) / 1000;
}

/**
 * Index finishes seats → Map user_id → Map season → { place, n, sacko }.
 */
export function indexSeatYearPlaces(finishes) {
  const seats = (finishes && finishes.seats) || [];
  const lastByYear = new Map();
  for (const seat of seats) {
    for (const row of seat.places || []) {
      const season = String(row.season || "");
      const place = Number(row.place);
      if (!season || !Number.isFinite(place)) continue;
      const prev = lastByYear.get(season) || 0;
      if (place > prev) lastByYear.set(season, place);
    }
  }
  const byUser = new Map();
  for (const seat of seats) {
    if (!seat || seat.user_id == null) continue;
    const uid = String(seat.user_id);
    if (!byUser.has(uid)) byUser.set(uid, new Map());
    const bag = byUser.get(uid);
    for (const row of seat.places || []) {
      const season = String(row.season || "");
      const place = Number(row.place);
      if (!season || !Number.isFinite(place)) continue;
      const n = lastByYear.get(season) || place;
      bag.set(season, {
        place,
        n,
        sacko: place >= n,
        name: seat.name || uid,
      });
    }
  }
  return { byUser, lastByYear, seasons: [...lastByYear.keys()].sort() };
}

/**
 * @param {object} opts
 */
export function buildAssDenominatorBook(opts = {}) {
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
    finishes = null,
    nameHints = [],
    nflPlayers = {},
    topN = ASS_DENOMINATOR_TOP_N,
    sackoBonus = ASS_DENOMINATOR_SACKO_BONUS,
  } = opts;

  const nameById = new Map();
  for (const m of members || []) {
    if (!m || m.user_id == null) continue;
    const nm = cleanName(m.name || m.canonical_name || m.display_name || "");
    if (nm) nameById.set(String(m.user_id), nm);
  }
  const playerNameHints = new Map();
  for (const h of nameHints || []) {
    if (!h || h.sleeper_id == null) continue;
    const nm = cleanName(h.name || "");
    if (nm) playerNameHints.set(String(h.sleeper_id), nm);
  }

  const placeIdx = indexSeatYearPlaces(finishes);
  const windows = placeIdx.seasons
    .map((s) => seasonWindow(s))
    .filter(Boolean);

  const { byPlayer, labels } = collectPlayerEvents({
    draftPicks,
    tradeLegs,
    trades,
    moves,
    seats,
    rostersNow,
    asOf,
  });

  const rows = [];
  for (const [key, events] of byPlayer) {
    const stints = stintsFromEvents(events, asOf, nameById);
    if (!stints.length) continue;

    let badDays = 0;
    let daysBottom = 0;
    const bySeat = new Map();
    const tape = [];

    for (const s of stints) {
      const uid = String(s.user_id || "");
      if (!uid || !s.start) continue;
      const end = s.end || asOf;
      for (const win of windows) {
        const days = overlapDays(s.start, end, win.start, win.end);
        if (days <= 0) continue;
        const yr = placeIdx.byUser.get(uid)?.get(win.season);
        if (!yr) continue;
        const w = badWeight(yr.place, yr.n, sackoBonus);
        if (w <= 0) continue;
        const weighted = Math.round(days * w * 10) / 10;
        badDays += weighted;
        daysBottom += days;
        if (!bySeat.has(uid)) {
          bySeat.set(uid, {
            user_id: uid,
            name: s.name || nameById.get(uid) || yr.name || uid,
            bad_days: 0,
            days: 0,
            stint_n: 0,
            worst_place: null,
            worst_season: null,
          });
        }
        const bag = bySeat.get(uid);
        bag.bad_days = Math.round((bag.bad_days + weighted) * 10) / 10;
        bag.days += days;
        bag.stint_n += 1;
        if (bag.worst_place == null || yr.place > bag.worst_place
          || (yr.place === bag.worst_place && String(win.season) > String(bag.worst_season || ""))) {
          bag.worst_place = yr.place;
          bag.worst_season = win.season;
        }
        if (s.name) bag.name = s.name;
        tape.push({
          user_id: uid,
          name: bag.name,
          start: s.start,
          end,
          season: win.season,
          days,
          place: yr.place,
          n: yr.n,
          w,
          bad_days: weighted,
          acquire: s.acquire,
          exit: s.exit,
          sacko: yr.sacko,
        });
      }
    }

    badDays = Math.round(badDays * 10) / 10;
    if (badDays <= 0) continue;

    const seatRows = [...bySeat.values()].sort((a, b) => (
      b.bad_days - a.bad_days
      || b.days - a.days
      || String(a.name).localeCompare(String(b.name))
    ));
    const pid = pidOf(key);
    const name = cleanName(
      labels.get(key)
      || playerNameHints.get(pid)
      || nameFromNfl(nflPlayers, pid)
      || (pid ? (`Player ${pid}`) : key),
    );
    const seatLab = seatRows.slice(0, 4).map((s) => s.name).join(" · ");

    rows.push({
      key,
      player_id: pid,
      name,
      bad_days: badDays,
      days_bottom: daysBottom,
      n_bad_seats: seatRows.length,
      n_stints: stints.length,
      seat_lab: seatLab,
      seats: seatRows,
      tape: tape.sort((a, b) => b.bad_days - a.bad_days || String(b.season).localeCompare(String(a.season))).slice(0, 12),
      thesis: `${name}: ${badDays} weighted days on bottom-half / sacko seats · ${seatLab}`,
    });
  }

  rows.sort((a, b) => (
    b.bad_days - a.bad_days
    || b.days_bottom - a.days_bottom
    || b.n_bad_seats - a.n_bad_seats
    || String(a.name).localeCompare(String(b.name))
  ));

  const players = rows.slice(0, topN).map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    v: ASS_DENOMINATOR_BOOK_V,
    league_id: leagueId != null ? String(leagueId) : null,
    as_of: asOf,
    n: players.length,
    rule: {
      top_n: topN,
      bottom_half: true,
      sacko_bonus: sackoBonus,
      season_window: "mar-feb",
      metric: "weighted days on worst seats",
    },
    players,
  };
}
