#!/usr/bin/env node
/**
 * Pipeline book for League Data.
 *
 *   node build-pipeline.mjs [league_id]
 *
 * draft + trade legs + moves → ui/pipeline.json
 */
import { existsSync, readFileSync } from "node:fs";
import {
  DATA,
  LEAGUE_ID,
  detectLeagueFormat,
  readJson,
  readUi,
  setLeagueId,
  writeUi,
} from "./lib.mjs";
import { buildPipelineBook } from "./lib/pipeline.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

const format = detectLeagueFormat(readJson("leagues.json", []) || []);
const curveName = format.format_key === "1qb" ? "value_curve_1qb.json" : "value_curve.json";
const curvePath = `${DATA}/${curveName}`;
const curve = existsSync(curvePath)
  ? JSON.parse(readFileSync(curvePath, "utf8"))
  : (readJson("value_curve.json", []) || []);

const members = readJson("members.json", []) || readUi("members.json", []) || [];
const draftPicks = readJson("draft_picks.json", []) || [];
const tradeLegs = readJson("trade_legs.json", []) || [];
const trades = readJson("trades.json", []) || [];
const moves = readJson("moves.json", []) || [];
const seats = readJson("seats.json", []) || [];
const rostersNow = readJson("rosters_now.json", []) || [];
const calc = readUi("calculator.json", null) || {};
const nameHints = Array.isArray(calc.players) ? calc.players.slice() : [];
const nflPath = `${DATA}/players.nfl.json`;
if (existsSync(nflPath)) {
  try {
    const nfl = JSON.parse(readFileSync(nflPath, "utf8"));
    for (const [id, p] of Object.entries(nfl || {})) {
      if (!p || typeof p !== "object") continue;
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (name) nameHints.push({ sleeper_id: id, name });
    }
  } catch {
    /* optional cache */
  }
}

const asOf = (() => {
  let d = "";
  for (const t of trades) {
    if (t && t.date && String(t.date) > d) d = String(t.date);
  }
  for (const m of moves) {
    if (m && m.date && String(m.date) > d) d = String(m.date);
  }
  return d || new Date().toISOString().slice(0, 10);
})();

const book = buildPipelineBook({
  leagueId: LEAGUE_ID,
  asOf,
  members,
  draftPicks,
  tradeLegs,
  trades,
  moves,
  seats,
  rostersNow,
  curve,
  nameHints,
});

writeUi("pipeline.json", book);
const lead = book.players
  .map((p) => p.facts && p.facts.pipeline)
  .filter(Boolean)
  .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
console.log(JSON.stringify({
  ok: true,
  v: book.v,
  pricing: book.pricing,
  curve: curveName,
  n_players: book.n_players,
  as_of: book.as_of,
  sample: book.players.slice(0, 3).map((p) => ({
    name: p.name,
    seats: p.seats.length,
    credit: p.facts?.pipeline?.name || null,
  })),
  out: "ui/pipeline.json",
}));
