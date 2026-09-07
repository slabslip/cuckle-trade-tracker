#!/usr/bin/env node
/** Daily DynastyDealer trade-implied snapshot. Offline file → price-today. */
import { fileURLToPath } from "node:url";
import {
  MARKET_UA, boardStats, marketPickKey, realSleeperId, todayStamp, writeDatedSnap,
} from "./market-snap.mjs";

const URL = "https://www.dynastydealer.com/api/player-values?perSlot=true";

export function parseDynastyDealer(body) {
  const rows = Array.isArray(body?.players) ? body.players : [];
  const players = [];
  for (const row of rows) {
    const base = Number(row?.base_value);
    if (!Number.isFinite(base) || base <= 0) continue;
    const name = String(row.name || "").trim();
    const pos = String(row.position || "").toUpperCase();
    const pickKey = pos === "PICK" || /^(\d{4})\s/.test(name)
      ? marketPickKey(name, row.sleeper_id) : null;
    const sid = pickKey ? null : realSleeperId(row.sleeper_id);
    if (!pickKey && !sid) continue;
    players.push({
      name: name || (pickKey || sid),
      sleeper_id: sid,
      pos: pickKey ? "PI" : pos || null,
      team: row.team || null,
      age: Number.isFinite(Number(row.age)) ? Number(row.age) : null,
      value: base,
      current_value: Number.isFinite(Number(row.current_value)) ? Number(row.current_value) : null,
      pick_key: pickKey || undefined,
    });
  }
  return players;
}

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": MARKET_UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`DynastyDealer ${res.status} ${URL}`);
  const body = await res.json();
  const players = parseDynastyDealer(body);
  if (!players.length) throw new Error("DynastyDealer: zero mapped rows");
  const asOf = todayStamp();
  const stats = boardStats(players.map((p) => p.value));
  const snap = {
    as_of: asOf,
    source: "dynastydealer",
    format: "superflex",
    fetched_at: new Date().toISOString(),
    url: URL,
    players,
    board: stats,
  };
  writeDatedSnap("dd", snap);
  console.log(JSON.stringify({
    as_of: asOf,
    players: players.length,
    mapped: players.filter((p) => p.sleeper_id).length,
    picks: players.filter((p) => p.pick_key).length,
    board: stats,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
