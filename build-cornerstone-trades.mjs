#!/usr/bin/env node
/**
 * Cornerstone trades book for League Data.
 *
 *   node build-cornerstone-trades.mjs [league_id]
 *
 * Reads raw/trade_meter.json + shared value_curve.json
 * → ui/cornerstone-trades.json (day-of calculator flatten).
 */
import {
  DATA,
  LEAGUE_ID,
  detectLeagueFormat,
  readJson,
  setLeagueId,
  writeUi,
} from "./lib.mjs";
import { existsSync, readFileSync } from "node:fs";
import { buildCornerstoneTradesBook } from "./lib/cornerstone-trades.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

const format = detectLeagueFormat(readJson("leagues.json", []) || []);
const curveName = format.format_key === "1qb" ? "value_curve_1qb.json" : "value_curve.json";
const curvePath = `${DATA}/${curveName}`;
const curve = existsSync(curvePath)
  ? JSON.parse(readFileSync(curvePath, "utf8"))
  : (readJson("value_curve.json", []) || []);

const meter = readJson("trade_meter.json", []) || [];
const asOf = (() => {
  let d = "";
  for (const t of meter) {
    if (t && t.date && String(t.date) > d) d = String(t.date);
  }
  return d || new Date().toISOString().slice(0, 10);
})();

const book = buildCornerstoneTradesBook({
  leagueId: LEAGUE_ID,
  asOf,
  trades: meter,
  curve,
});

writeUi("cornerstone-trades.json", book);
console.log(JSON.stringify({
  ok: true,
  v: book.v,
  pricing: book.pricing,
  curve: curveName,
  n_trades: book.n_trades,
  n_scored: book.n_scored,
  lead: book.trades[0]
    ? `${book.trades[0].asset}@${book.trades[0].value}`
    : null,
  top: book.trades.slice(0, 3).map((r) => `${r.rank}.${r.asset}:${r.value}`),
  out: "ui/cornerstone-trades.json",
}));
