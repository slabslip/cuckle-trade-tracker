#!/usr/bin/env node
/**
 * Stitch ESPN history onto a Sleeper book without rewriting leagues.json.
 * Sleeper remains the live format. ESPN seats/trades/titles/weeks join the
 * same members when espn_bridge.json or a unique name maps that year's
 * ESPN owner onto a Sleeper seat. Managers who left keep their own years.
 * `espn-team:` / franchise only fills a year with no owner id.
 */
import { readJson, setLeagueId, writeJson } from "./lib.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

export function normName(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function lastToken(s) {
  const n = normName(s);
  return n.slice(-8);
}

export function handleStem(s) {
  return normName(s).replace(/\d+$/g, "");
}

export function looksLikeEspnHandle(s) {
  return /^espnfan/i.test(String(s || "").replace(/[^a-z0-9]/gi, ""));
}

export function preferredEspnName(member) {
  const canon = member && member.canonical_name;
  if (canon && !looksLikeEspnHandle(canon)) return String(canon);
  const aliases = (member && member.aliases) || [];
  const names = [canon, ...aliases.map((a) => a && (a.name || a))];
  const full = names.find((n) => n && /\s/.test(String(n)) && !looksLikeEspnHandle(n));
  if (full) return String(full).replace(/\s+/g, " ").trim();
  return canon || "";
}

function sleeperMatchNames(member) {
  const out = [member && member.canonical_name];
  for (const a of (member && member.aliases) || []) {
    if (a && a.kind === "espn_display") continue;
    out.push(a && (a.name || a));
  }
  return out.filter(Boolean);
}

function sleeperNameIndex(sleeperMembers) {
  const sleeperByNorm = new Map();
  for (const m of sleeperMembers) {
    for (const name of sleeperMatchNames(m)) {
      const n = normName(name);
      if (!n || n.length < 3) continue;
      if (!sleeperByNorm.has(n)) sleeperByNorm.set(n, []);
      sleeperByNorm.get(n).push(m.user_id);
    }
  }
  return sleeperByNorm;
}

function uniqueSleeper(sleeperByNorm, name) {
  const ids = [...new Set(sleeperByNorm.get(normName(name)) || [])];
  return ids.length === 1 ? ids[0] : null;
}

export function buildBridge(espnMembers, sleeperMembers, explicit = {}, espnSeats = []) {
  const out = {};
  const sleeperByNorm = sleeperNameIndex(sleeperMembers);
  for (const [k, v] of Object.entries(explicit || {})) {
    if (!k || !v || /^espn-team:/i.test(k)) continue;
    out[k] = String(v);
  }
  const namesByOwner = {};
  for (const s of espnSeats || []) {
    if (!s || !s.owner_id) continue;
    (namesByOwner[s.owner_id] || (namesByOwner[s.owner_id] = [])).push(s.team_name);
  }
  for (const m of espnMembers) {
    if (out[m.user_id]) continue;
    const pin = explicit[m.user_id] || explicit[m.espn_id] || explicit[m.canonical_name];
    if (pin) {
      out[m.user_id] = String(pin);
      continue;
    }
    const names = [
      m.canonical_name,
      ...((m.aliases || []).map((a) => a.name || a)),
      ...(namesByOwner[m.user_id] || []),
    ];
    let hit = null;
    for (const name of names) {
      hit = uniqueSleeper(sleeperByNorm, name);
      if (hit) break;
    }
    if (!hit) {
      const stems = new Set(
        names.map(handleStem).filter((n) => n.length >= 5 && n !== "espnfan" && n !== "espn"),
      );
      for (const stem of stems) {
        const ids = [];
        for (const [key, list] of sleeperByNorm) {
          if (handleStem(key) === stem) ids.push(...list);
        }
        const uniq = [...new Set(ids)];
        if (uniq.length === 1) {
          hit = uniq[0];
          break;
        }
      }
    }
    if (!hit) {
      const lasts = new Set(
        names
          .filter((n) => /\s/.test(String(n)))
          .map((n) => normName(String(n).trim().split(/\s+/).pop()))
          .filter((n) => n.length >= 5),
      );
      for (const last of lasts) {
        const ids = [];
        for (const [key, list] of sleeperByNorm) {
          if (key.includes(last)) ids.push(...list);
        }
        const uniq = [...new Set(ids)];
        if (uniq.length === 1) {
          hit = uniq[0];
          break;
        }
      }
    }
    if (hit) out[m.user_id] = hit;
  }
  return out;
}

/** Latest Sleeper-mapped owner of each ESPN team slot. Leavers follow the franchise. */
export function buildFranchiseMap(espnSeats, personBridge, explicit = {}) {
  const out = {};
  for (const [k, v] of Object.entries(explicit || {})) {
    const hit = String(k).match(/^espn-team:(\d+)$/i);
    if (hit && v) out[hit[1]] = String(v);
  }
  const sorted = [...(espnSeats || [])]
    .filter((s) => s && s.roster_id != null)
    .sort((a, b) => String(a.season).localeCompare(String(b.season)));
  for (const s of sorted) {
    const sid = personBridge[s.owner_id];
    if (!sid) continue;
    out[String(s.roster_id)] = String(sid);
  }
  return out;
}

export function resolveEspnScoreUid(score, personBridge, franchiseMap) {
  const uid = score && score.user_id;
  // This year's owner wins. Shane on roster 6 in 2024 is Shane; Ricky on
  // that same slot in 2020–22 stays Ricky. Franchise only fills a blank.
  if (uid && personBridge && personBridge[uid]) return personBridge[uid];
  if (uid) return uid;
  const team = score && score.roster_id != null ? String(score.roster_id) : "";
  if (team && franchiseMap && franchiseMap[team]) return franchiseMap[team];
  return uid;
}

function remapUid(uid, bridge) {
  if (!uid) return uid;
  return bridge[uid] || uid;
}

function mergeMembers(sleeper, espn, bridge) {
  const byId = new Map(sleeper.map((m) => [m.user_id, structuredClone(m)]));
  for (const m of espn) {
    const uid = remapUid(m.user_id, bridge);
    if (!byId.has(uid)) {
      byId.set(uid, {
        user_id: uid,
        canonical_name: preferredEspnName(m) || m.canonical_name,
        aliases: [...(m.aliases || [])],
      });
      continue;
    }
    const row = byId.get(uid);
    for (const a of m.aliases || []) {
      const name = a.name || a;
      if (!row.aliases.some((x) => (x.name || x) === name)) {
        row.aliases.push(typeof a === "string" ? { name: a, kind: "espn_display" } : a);
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
}

function main() {
  const sleeperLeagues = readJson("leagues.json", []) || [];
  const sleeperSeasons = new Set(sleeperLeagues.map((l) => String(l.season)));
  // members.json / seats.json may already be a prior merge. Only Sleeper
  // rows are the live people — ESPN ids get rebuilt from espn_*.json.
  const sleeperMembers = (readJson("members.json", []) || [])
    .filter((m) => m && !String(m.user_id || "").startsWith("espn:"))
    .map((m) => ({
      ...m,
      aliases: (m.aliases || []).filter((a) => !a || a.kind !== "espn_display"),
    }));
  const sleeperSeats = (readJson("seats.json", []) || [])
    .filter((s) => s && s.provider !== "espn" && !String(s.league_id || "").startsWith("espn:"));
  const sleeperTrades = (readJson("trades.json", []) || [])
    .filter((t) => t && t.provider !== "espn");
  const sleeperLegs = (readJson("trade_legs.json", []) || [])
    .filter((l) => l && l.provider !== "espn" && !String(l.transaction_id || "").startsWith("espn"));
  const sleeperTape = (readJson("trade_tape.json", []) || [])
    .filter((t) => t && t.provider !== "espn");
  const prevAliases = readJson("aliases.json", {}) || {};
  const sleeperAliases = {};
  for (const m of sleeperMembers) {
    const key = m.canonical_name;
    if (!key) continue;
    sleeperAliases[key] = prevAliases[key] || [];
  }
  const espnStatus = readJson("espn_status.json", { authorized: false });
  const espnMembers = readJson("espn_members.json", []) || [];
  const espnSeats = (readJson("espn_seats.json", []) || [])
    .filter((s) => !sleeperSeasons.has(String(s.season)));
  const espnTrades = (readJson("espn_trades.json", []) || [])
    .filter((t) => !sleeperSeasons.has(String(t.season)));
  const espnLegs = readJson("espn_trade_legs.json", []) || [];
  const espnTitles = (readJson("espn_titles.json", []) || [])
    .filter((t) => !sleeperSeasons.has(String(t.season)));
  const explicit = readJson("espn_bridge.json", {}) || {};

  const bridge = buildBridge(espnMembers, sleeperMembers, explicit, espnSeats);
  const franchise = buildFranchiseMap(espnSeats, bridge, explicit);
  const members = mergeMembers(sleeperMembers, espnMembers, bridge);
  const seats = [
    ...sleeperSeats,
    ...espnSeats.map((s) => ({
      ...s,
      owner_id: resolveEspnScoreUid({ user_id: s.owner_id, roster_id: s.roster_id }, bridge, franchise),
    })),
  ];
  const espnTx = new Set(espnTrades.map((t) => t.transaction_id));
  const trades = [
    ...sleeperTrades,
    ...espnTrades.map((t) => ({
      ...t,
      user_ids: (t.user_ids || []).map((uid) => remapUid(uid, bridge)),
    })),
  ];
  const legs = [
    ...sleeperLegs,
    ...espnLegs.filter((l) => espnTx.has(l.transaction_id)).map((l) => ({
      ...l,
      to_user_id: remapUid(l.to_user_id, bridge),
      from_user_id: remapUid(l.from_user_id, bridge),
    })),
  ];

  const nameById = Object.fromEntries(members.map((m) => [m.user_id, m.canonical_name]));
  const espnTape = espnTrades.map((t) => {
    const bags = {};
    for (const uid of (t.user_ids || []).map((u) => remapUid(u, bridge)).filter(Boolean)) {
      const mine = legs.filter((l) => l.transaction_id === t.transaction_id);
      bags[nameById[uid] || uid] = {
        in: mine.filter((l) => l.direction !== "out" && l.to_user_id === uid).map((l) => l.label),
        out: mine.filter((l) => l.direction === "out" && l.from_user_id === uid).map((l) => l.label),
      };
    }
    return {
      date: t.date,
      season: t.season,
      week: t.week,
      transaction_id: t.transaction_id,
      sides: bags,
      provider: "espn",
    };
  });
  const tape = [...sleeperTape, ...espnTape].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const aliases = { ...sleeperAliases };
  for (const m of members) {
    const names = [...new Set((m.aliases || []).map((a) => a.name || a).filter(Boolean))];
    const key = m.canonical_name;
    aliases[key] = [...new Set([...(aliases[key] || []), ...names])];
  }

  const titles = espnTitles.map((t) => {
    const uid = resolveEspnScoreUid({ user_id: t.user_id, roster_id: t.roster_id }, bridge, franchise);
    return { ...t, user_id: uid, name: nameById[uid] || t.name };
  });

  writeJson("members.json", members);
  writeJson("seats.json", seats);
  writeJson("trades.json", trades);
  writeJson("trade_legs.json", legs);
  writeJson("trade_tape.json", tape);
  writeJson("aliases.json", aliases);
  writeJson("espn_titles.json", titles);
  writeJson("provider_bridge.json", {
    espn_authorized: !!espnStatus.authorized,
    espn_reason: espnStatus.reason || null,
    espn_seasons: espnStatus.seasons || [],
    sleeper_seasons: [...sleeperSeasons],
    mapped: Object.keys(bridge).length,
    bridge,
    franchise,
    espn_only_members: members.filter((m) => String(m.user_id).startsWith("espn:")).map((m) => m.canonical_name),
  });

  console.log(JSON.stringify({
    sleeper_seasons: [...sleeperSeasons],
    espn_seasons: espnStatus.seasons || [],
    espn_authorized: !!espnStatus.authorized,
    members: members.length,
    seats: seats.length,
    trades: trades.length,
    espn_trades: espnTrades.length,
    mapped: Object.keys(bridge).length,
    franchise: Object.keys(franchise).length,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] && process.argv[1].endsWith("merge-provider-history.mjs")) {
  main();
}
