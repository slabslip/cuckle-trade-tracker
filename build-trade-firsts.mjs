#!/usr/bin/env node
/**
 * Trade FIRSTS book for League Data.
 *
 *   node build-trade-firsts.mjs [league_id]
 *
 * trade_legs + trades → ui/trade-firsts.json
 */
import {
  LEAGUE_ID,
  readJson,
  readUi,
  setLeagueId,
  writeUi,
} from "./lib.mjs";
import { buildTradeFirstsBook } from "./lib/trade-firsts.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

const members = readJson("members.json", []) || readUi("members.json", []) || [];
const tradeLegs = readJson("trade_legs.json", []) || [];
const trades = readJson("trades.json", []) || [];

const asOf = (() => {
  let d = "";
  for (const t of trades) {
    if (t && t.date && String(t.date) > d) d = String(t.date);
  }
  return d || new Date().toISOString().slice(0, 10);
})();

const book = buildTradeFirstsBook({
  leagueId: LEAGUE_ID,
  asOf,
  tradeLegs,
  trades,
  members,
});

writeUi("trade-firsts.json", book);

console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n: book.n,
  as_of: book.as_of,
  top3: (book.seats || []).slice(0, 3).map((s) => ({
    rank: s.rank,
    name: s.name,
    n_firsts: s.n_firsts,
    n_trades: s.n_trades,
  })),
}, null, 2));
