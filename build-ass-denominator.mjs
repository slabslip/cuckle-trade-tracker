#!/usr/bin/env node
/**
 * Ass denominator book for League Data.
 *
 *   node build-ass-denominator.mjs [league_id]
 *
 * finishes + ownership stints → ui/ass-denominator.json
 */
import { existsSync, readFileSync } from "node:fs";
import {
  DATA,
  LEAGUE_ID,
  readJson,
  readUi,
  setLeagueId,
  writeUi,
} from "./lib.mjs";
import { buildAssDenominatorBook } from "./lib/ass-denominator.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

const members = readJson("members.json", []) || readUi("members.json", []) || [];
const draftPicks = readJson("draft_picks.json", []) || [];
const tradeLegs = readJson("trade_legs.json", []) || [];
const trades = readJson("trades.json", []) || [];
const moves = readJson("moves.json", []) || [];
const seats = readJson("seats.json", []) || [];
const rostersNow = readJson("rosters_now.json", []) || [];
const finishes = readUi("finishes.json", null);
const calc = readUi("calculator.json", null) || {};
const nameHints = Array.isArray(calc.players) ? calc.players.slice() : [];
for (const d of draftPicks) {
  if (d && d.player_id != null && d.label) {
    nameHints.push({ sleeper_id: String(d.player_id), name: String(d.label) });
  }
}
for (const leg of tradeLegs) {
  if (leg && leg.kind === "player" && leg.asset_key && leg.label) {
    const pid = String(leg.asset_key).replace(/^player:/, "");
    if (pid) nameHints.push({ sleeper_id: pid, name: String(leg.label) });
  }
}
const pipeline = readUi("pipeline.json", null);
if (pipeline && Array.isArray(pipeline.players)) {
  for (const p of pipeline.players) {
    if (p && p.player_id != null && p.name) {
      nameHints.push({ sleeper_id: String(p.player_id), name: String(p.name) });
    }
  }
}
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

const book = buildAssDenominatorBook({
  leagueId: LEAGUE_ID,
  asOf,
  members,
  draftPicks,
  tradeLegs,
  trades,
  moves,
  seats,
  rostersNow,
  finishes,
  nameHints,
  nflPlayers,
});

writeUi("ass-denominator.json", book);

console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n: book.n,
  as_of: book.as_of,
  top3: (book.players || []).slice(0, 3).map((p) => ({
    rank: p.rank,
    name: p.name,
    bad_days: p.bad_days,
    n_bad_seats: p.n_bad_seats,
    seat_lab: p.seat_lab,
  })),
}, null, 2));
