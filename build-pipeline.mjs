#!/usr/bin/env node
/**
 * Pipeline book for League Data.
 *
 *   node build-pipeline.mjs [league_id]
 *
 * draft + trade legs + moves → ui/pipeline.json
 * Season fantasy ranks from live Sleeper /stats/nfl/regular/{season}.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  DATA,
  LEAGUE_ID,
  detectLeagueFormat,
  readJson,
  readUi,
  setLeagueId,
  sleeperGet,
  writeUi,
} from "./lib.mjs";
import { buildPipelineBook, PIPELINE_POS } from "./lib/pipeline.mjs";

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
const playerStarts = readJson("player_starts.json", null);
const calc = readUi("calculator.json", null) || {};
const nameHints = Array.isArray(calc.players) ? calc.players.slice() : [];
const nflPath = `${DATA}/players.nfl.json`;
let nflPlayers = {};
if (existsSync(nflPath)) {
  try {
    nflPlayers = JSON.parse(readFileSync(nflPath, "utf8")) || {};
    for (const [id, p] of Object.entries(nflPlayers)) {
      if (!p || typeof p !== "object") continue;
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (name) nameHints.push({ sleeper_id: id, name });
    }
  } catch {
    nflPlayers = {};
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

async function loadSeasonStats() {
  let season = Number(process.env.PIPELINE_SEASON) || 0;
  if (!season) {
    try {
      const state = await sleeperGet("/state/nfl");
      season = Number(state && state.season) || 0;
    } catch {
      season = 0;
    }
  }
  if (!season) season = new Date().getUTCFullYear();
  let stats = {};
  try {
    stats = await sleeperGet(`/stats/nfl/regular/${season}`) || {};
  } catch (err) {
    console.warn("pipeline season stats:", err && err.message ? err.message : err);
    stats = {};
  }
  return { season, stats };
}

const { season, stats: seasonStats } = await loadSeasonStats();

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
  playerStarts,
  seasonStats,
  nflPlayers,
  season,
});

writeUi("pipeline.json", book);
const ranked = PIPELINE_POS.map((pos) => {
  const n = book.players.filter((p) => p.pos === pos && p.pos_rank != null).length;
  const lead = book.players
    .filter((p) => p.pos === pos && p.pos_rank === 1)[0];
  return { pos, n, lead: lead ? `${lead.name} (${lead.season_pts})` : null };
});
console.log(JSON.stringify({
  ok: true,
  v: book.v,
  pricing: book.pricing,
  curve: curveName,
  season: book.season,
  n_players: book.n_players,
  as_of: book.as_of,
  ranks: ranked,
  sample: book.players.slice(0, 3).map((p) => ({
    name: p.name,
    pos: p.pos,
    pos_rank: p.pos_rank,
    seats: p.seats.length,
    credit: p.facts?.pipeline?.name || null,
  })),
  out: "ui/pipeline.json",
}));
