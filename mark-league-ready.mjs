#!/usr/bin/env node
/**
 * After a successful build, mark leagues.status = ready.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… node mark-league-ready.mjs [league_id]
 *
 * Without the service role key, exits 0 after printing a SQL snippet.
 */
import { CUCKLE_LEAGUE_ID, setLeagueId } from "./lib.mjs";

const PROJECT = "https://gtqyvnkkjiksmmtmzubw.supabase.co";
const leagueId = setLeagueId(process.argv[2] || process.env.LEAGUE_ID || CUCKLE_LEAGUE_ID);
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sql = `update public.leagues
   set status = 'ready', synced_at = now()
 where sleeper_league_id = '${leagueId}';`;

if (!key || key.length < 40) {
  console.log("No SUPABASE_SERVICE_ROLE_KEY — run this SQL in the Supabase editor:\n");
  console.log(sql);
  process.exit(0);
}

const res = await fetch(`${PROJECT}/rest/v1/leagues?sleeper_league_id=eq.${encodeURIComponent(leagueId)}`, {
  method: "PATCH",
  headers: {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({ status: "ready", synced_at: new Date().toISOString() }),
});

if (!res.ok) {
  console.error("mark-league-ready failed:", res.status, await res.text());
  process.exit(1);
}
const rows = await res.json();
console.log(`Marked ready: ${leagueId}`, rows[0] ? `(${rows[0].name})` : "");
