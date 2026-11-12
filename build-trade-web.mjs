#!/usr/bin/env node
/**
 * Trade web book for League Data.
 *
 *   node build-trade-web.mjs [league_id]
 *
 * Maps what each traded-away player turned into for the seat that sent them.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  CUCKLE_LEAGUE_ID,
  LEAGUE_ID,
  leagueRawDir,
  readJson,
  readUi,
  setLeagueId,
  writeUi,
} from "./lib.mjs";
import { buildTradeWebBook } from "./lib/trade-web.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID || CUCKLE_LEAGUE_ID);

function loadRaw(name, fallback) {
  const p = `${leagueRawDir()}/${name}`;
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf8"));
}

const legs = loadRaw("trade_legs.json", []) || [];
const trades = loadRaw("trades.json", []) || [];
const moves = loadRaw("moves.json", []) || [];
const members = readUi("members.json", []) || [];
const picksBook = readUi("picks.json", null);
const playersNfl = readJson("players.nfl.json", {}) || {};

const nameByUser = {};
for (const m of members) {
  if (m && m.user_id != null && m.name) nameByUser[String(m.user_id)] = String(m.name);
}

const book = buildTradeWebBook({
  legs,
  trades,
  picksBook,
  moves,
  nameByUser,
  playersNfl,
  leagueId: LEAGUE_ID,
  asOf: new Date().toISOString().slice(0, 10),
});
writeUi("trade-web.json", book);

const golden = (book.players || []).find((p) => String(p.player_id) === "12501"
  || String(p.name).toLowerCase().includes("matthew golden"));
console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n_players: book.n_players,
  sample: (book.players || []).slice(0, 5).map((p) => ({
    name: p.name,
    n_exits: p.n_exits,
    seats: p.seats,
  })),
  golden: golden ? {
    name: golden.name,
    n_exits: golden.n_exits,
    webs: (golden.webs || []).map((w) => ({
      seat: w.seat,
      date: w.date,
      partner: w.partner,
      thesis: w.thesis,
      branches: (w.branches || []).map((b) => ({
        label: b.label,
        status: b.status,
        children: (b.children || []).map((c) => c.label),
      })),
    })),
  } : null,
  out: "ui/trade-web.json",
}, null, 2));
