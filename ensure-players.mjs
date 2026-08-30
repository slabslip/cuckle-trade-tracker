#!/usr/bin/env node
/**
 * Ensure data/players.nfl.json exists for news-sync.mjs.
 *
 * The file is gitignored (~15MB). Locally and in CI it is produced by sleeper-sync.mjs;
 * a news-only refresh should not re-walk every season's transactions just to get the
 * dictionary. Cache for 24h, same rule sleeper-sync uses.
 */
import fs from "node:fs";
import { DATA, sleeperGet } from "./lib.mjs";

const cache = `${DATA}/players.nfl.json`;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

if (fs.existsSync(cache)) {
  const age = Date.now() - fs.statSync(cache).mtimeMs;
  if (age < MAX_AGE_MS) {
    console.log(`players.nfl.json ok (${Math.round(age / 60000)}m old)`);
    process.exit(0);
  }
}

console.log("fetching /players/nfl …");
const players = await sleeperGet("/players/nfl");
if (!players || typeof players !== "object") {
  throw new Error("Sleeper /players/nfl returned nothing");
}
fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(cache, JSON.stringify(players));
console.log(`wrote ${cache} (${Object.keys(players).length} ids)`);
