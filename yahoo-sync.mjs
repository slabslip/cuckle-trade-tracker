#!/usr/bin/env node
/**
 * Yahoo history stub. Writes yahoo_status.json so a missing OAuth cannot invent seasons.
 * Same raw shapes as espn-sync will land here when OAuth is configured.
 */
import { loadProviders, setLeagueId, writeJson } from "./lib.mjs";

const LEAGUE_ID = setLeagueId(process.argv[2] || process.env.LEAGUE_ID);
const providers = loadProviders(LEAGUE_ID);
const ids = Array.isArray(providers.yahoo_league_ids) ? providers.yahoo_league_ids : [];

const status = {
  sleeper_league_id: LEAGUE_ID,
  yahoo_league_ids: ids,
  authorized: false,
  reason: ids.length ? "yahoo_not_configured" : "no_yahoo_league_id",
  seasons: [],
};

writeJson("yahoo_status.json", status);
writeJson("yahoo_seasons.json", []);
writeJson("yahoo_members.json", []);
writeJson("yahoo_seats.json", []);
writeJson("yahoo_standings.json", []);
console.log(JSON.stringify(status, null, 2));
