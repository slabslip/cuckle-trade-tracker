#!/usr/bin/env node
/**
 * Stitch ESPN history onto a Sleeper book without rewriting leagues.json.
 * Sleeper remains the live format + weekly-score source. ESPN seats/trades/titles
 * join the same members when espn_bridge.json or a unique name match says so.
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

export function buildBridge(espnMembers, sleeperMembers, explicit = {}) {
  const out = {};
  const sleeperByNorm = new Map();
  const sleeperByLast = new Map();
  for (const m of sleeperMembers) {
    const names = [m.canonical_name, ...((m.aliases || []).map((a) => a.name || a))];
    for (const name of names) {
      const n = normName(name);
      if (!n) continue;
      if (!sleeperByNorm.has(n)) sleeperByNorm.set(n, []);
      sleeperByNorm.get(n).push(m.user_id);
      const last = n.replace(/^\d+/, "");
      if (last.length >= 4) {
        if (!sleeperByLast.has(last)) sleeperByLast.set(last, []);
        sleeperByLast.get(last).push(m.user_id);
      }
    }
  }
  for (const [k, v] of Object.entries(explicit || {})) {
    if (!k || !v) continue;
    out[k] = String(v);
  }
  for (const m of espnMembers) {
    if (out[m.user_id]) continue;
    const pin = explicit[m.user_id] || explicit[m.espn_id] || explicit[m.canonical_name];
    if (pin) {
      out[m.user_id] = String(pin);
      continue;
    }
    const names = [m.canonical_name, ...((m.aliases || []).map((a) => a.name || a))];
    let hit = null;
    for (const name of names) {
      const ids = sleeperByNorm.get(normName(name)) || [];
      const uniq = [...new Set(ids)];
      if (uniq.length === 1) {
        hit = uniq[0];
        break;
      }
    }
    if (hit) out[m.user_id] = hit;
  }
  return out;
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
        canonical_name: m.canonical_name,
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
  const sleeperMembers = readJson("members.json", []) || [];
  const sleeperSeats = readJson("seats.json", []) || [];
  const sleeperTrades = readJson("trades.json", []) || [];
  const sleeperLegs = readJson("trade_legs.json", []) || [];
  const sleeperTape = readJson("trade_tape.json", []) || [];
  const sleeperAliases = readJson("aliases.json", {}) || {};
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

  const bridge = buildBridge(espnMembers, sleeperMembers, explicit);
  const members = mergeMembers(sleeperMembers, espnMembers, bridge);
  const seats = [
    ...sleeperSeats,
    ...espnSeats.map((s) => ({ ...s, owner_id: remapUid(s.owner_id, bridge) })),
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

  const titles = espnTitles.map((t) => ({
    ...t,
    user_id: remapUid(t.user_id, bridge),
    name: nameById[remapUid(t.user_id, bridge)] || t.name,
  }));

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
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] && process.argv[1].endsWith("merge-provider-history.mjs")) {
  main();
}
