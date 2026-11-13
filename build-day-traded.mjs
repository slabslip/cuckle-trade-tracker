#!/usr/bin/env node
/**
 * Day Traded book for League Data.
 *
 *   node build-day-traded.mjs [league_id]
 *
 * moves.json (waiver + FA adds/drops) → ui/day-traded.json
 */
import {
  LEAGUE_ID,
  loadNflPlayers,
  nflNameHints,
  readJson,
  readUi,
  setLeagueId,
  writeUi,
} from "./lib.mjs";
import { buildDayTradedBook } from "./lib/day-traded.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

const members = readJson("members.json", []) || readUi("members.json", []) || [];
const moves = readJson("moves.json", []) || [];
const seats = readJson("seats.json", []) || [];
const draftPicks = readJson("draft_picks.json", []) || [];
const tradeLegs = readJson("trade_legs.json", []) || [];
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

const nflPlayers = await loadNflPlayers();
nameHints.push(...nflNameHints(nflPlayers));

const asOf = (() => {
  let d = "";
  for (const m of moves) {
    if (m && m.date && String(m.date) > d) d = String(m.date);
  }
  return d || new Date().toISOString().slice(0, 10);
})();

const book = buildDayTradedBook({
  leagueId: LEAGUE_ID,
  asOf,
  moves,
  seats,
  members,
  nameHints,
  nflPlayers,
});

const unnamed = (book.players || []).filter((p) => /^Player\s+\d+$/i.test(String(p.name || "")));
if (unnamed.length) {
  console.warn(JSON.stringify({
    warn: "day_traded_unnamed",
    n: unnamed.length,
    sample: unnamed.slice(0, 5).map((p) => p.player_id),
  }));
}

writeUi("day-traded.json", book);

console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n: book.n,
  as_of: book.as_of,
  nfl: Object.keys(nflPlayers || {}).length,
  unnamed: unnamed.length,
  top3: (book.players || []).slice(0, 3).map((p) => ({
    rank: p.rank,
    name: p.name,
    adds: p.adds,
    drops: p.drops,
    churn: p.churn,
  })),
}, null, 2));
