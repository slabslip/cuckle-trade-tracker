#!/usr/bin/env node
/** Daily FantasyCalc Superflex dynasty snapshot. Offline file → price-today. */
import { fileURLToPath } from "node:url";
import {
  MARKET_UA, boardStats, marketPickKey, realSleeperId, todayStamp, writeDatedSnap,
} from "./market-snap.mjs";

const URL =
  "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=1";

export function parseFantasyCalc(rows) {
  const players = [];
  for (const row of rows || []) {
    const p = row?.player || {};
    const value = Number(row?.value);
    if (!Number.isFinite(value)) continue;
    const name = String(p.name || "").trim();
    const pos = String(p.position || "").toUpperCase();
    const pickKey = pos === "PICK" || /^(\d{4})\s/.test(name)
      ? marketPickKey(name, p.sleeperId) : null;
    const sid = pickKey ? null : realSleeperId(p.sleeperId);
    if (!pickKey && !sid) continue;
    players.push({
      name: name || (pickKey || sid),
      sleeper_id: sid,
      pos: pickKey ? "PI" : pos || null,
      team: p.maybeTeam || null,
      age: Number.isFinite(Number(p.maybeAge)) ? Number(p.maybeAge) : null,
      value,
      pick_key: pickKey || undefined,
      trend30: Number.isFinite(Number(row.trend30Day)) ? Number(row.trend30Day) : null,
    });
  }
  return players;
}

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": MARKET_UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`FantasyCalc ${res.status} ${URL}`);
  const raw = await res.json();
  if (!Array.isArray(raw) || !raw.length) throw new Error("FantasyCalc: empty list");
  const players = parseFantasyCalc(raw);
  if (!players.length) throw new Error("FantasyCalc: zero mapped rows");
  const asOf = todayStamp();
  const stats = boardStats(players.map((p) => p.value));
  const snap = {
    as_of: asOf,
    source: "fantasycalc",
    format: "superflex",
    fetched_at: new Date().toISOString(),
    url: URL,
    players,
    board: stats,
  };
  writeDatedSnap("fc", snap);
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
