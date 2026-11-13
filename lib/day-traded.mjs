/**
 * Day Traded — players most added and dropped on the wire
 * (waiver + free-agent moves). Ranked by adds + drops.
 */

import { seatOwnerIndex } from "./pipeline.mjs";

export const DAY_TRADED_BOOK_V = 1;
export const DAY_TRADED_TOP_N = 25;
export const DAY_TRADED_RECENT_N = 10;

function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function assetKeyOf(pid) {
  const id = String(pid || "").replace(/^player:/, "");
  return id ? `player:${id}` : "";
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
export function buildDayTradedBook(opts = {}) {
  const {
    leagueId = null,
    asOf = new Date().toISOString().slice(0, 10),
    moves = [],
    seats = [],
    members = [],
    nameHints = [],
    nflPlayers = {},
    topN = DAY_TRADED_TOP_N,
    recentN = DAY_TRADED_RECENT_N,
    includeCommissioner = false,
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

  const seatIdx = seatOwnerIndex(seats);
  const byPlayer = new Map();

  const touch = (key) => {
    if (!byPlayer.has(key)) {
      byPlayer.set(key, { adds: 0, drops: 0, events: [] });
    }
    return byPlayer.get(key);
  };

  for (const m of moves || []) {
    if (!m || !m.date) continue;
    const type = String(m.type || "free_agent");
    if (type === "commissioner" && !includeCommissioner) continue;
    if (type !== "waiver" && type !== "free_agent" && type !== "commissioner") continue;
    const date = String(m.date);
    const season = String(m.season || date.slice(0, 4));
    const tid = m.transaction_id != null ? String(m.transaction_id) : null;
    const wireKind = type === "waiver" ? "waiver" : (type === "commissioner" ? "commissioner" : "fa");

    for (const [pid, rid] of Object.entries(m.adds || {})) {
      const key = assetKeyOf(pid);
      if (!key) continue;
      const to = seatIdx.owner(season, rid);
      const bag = touch(key);
      bag.adds += 1;
      bag.events.push({
        date,
        season,
        kind: "add",
        type: wireKind,
        seat_user_id: to ? String(to) : null,
        seat: to ? (nameById.get(String(to)) || String(to)) : null,
        transaction_id: tid,
      });
    }
    for (const [pid, rid] of Object.entries(m.drops || {})) {
      const key = assetKeyOf(pid);
      if (!key) continue;
      const from = seatIdx.owner(season, rid);
      const bag = touch(key);
      bag.drops += 1;
      bag.events.push({
        date,
        season,
        kind: "drop",
        type: wireKind,
        seat_user_id: from ? String(from) : null,
        seat: from ? (nameById.get(String(from)) || String(from)) : null,
        transaction_id: tid,
      });
    }
  }

  const rows = [];
  for (const [key, bag] of byPlayer) {
    const churn = bag.adds + bag.drops;
    if (churn <= 0) continue;
    const pid = pidOf(key);
    const name = cleanName(
      playerNameHints.get(pid)
      || nameFromNfl(nflPlayers, pid)
      || (pid ? (`Player ${pid}`) : key),
    );
    const events = bag.events.slice().sort((a, b) => (
      String(b.date).localeCompare(String(a.date))
      || String(a.kind).localeCompare(String(b.kind))
    ));
    rows.push({
      key,
      player_id: pid,
      name,
      adds: bag.adds,
      drops: bag.drops,
      churn,
      recent: events.slice(0, recentN),
      thesis: `${name}: ${bag.adds} add${bag.adds === 1 ? "" : "s"} · `
        + `${bag.drops} drop${bag.drops === 1 ? "" : "s"} · ${churn} wire moves`,
    });
  }

  rows.sort((a, b) => (
    b.churn - a.churn
    || b.adds - a.adds
    || b.drops - a.drops
    || String(a.name).localeCompare(String(b.name))
  ));

  const players = rows.slice(0, topN).map((r, i) => ({
    ...r,
    rank: i + 1,
  }));

  return {
    v: DAY_TRADED_BOOK_V,
    league_id: leagueId != null ? String(leagueId) : null,
    as_of: asOf,
    n: players.length,
    rule: {
      top_n: topN,
      recent_n: recentN,
      types: includeCommissioner
        ? ["waiver", "free_agent", "commissioner"]
        : ["waiver", "free_agent"],
      metric: "adds + drops",
    },
    players,
  };
}
