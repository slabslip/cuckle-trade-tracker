#!/usr/bin/env node
/**
 * Trade web book for League Data.
 *
 *   node build-trade-web.mjs [league_id]
 *
 * Writes:
 *   ui/trade-web.json           — searchable index (spine + origin/now, no deep tree)
 *   ui/trade-web/p/<id>.json    — full lineage web per player (click to open)
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  CUCKLE_LEAGUE_ID,
  DATA,
  LEAGUE_ID,
  detectLeagueFormat,
  leagueRawDir,
  leagueUiDir,
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

const format = detectLeagueFormat(readJson("leagues.json", []) || []);
const curveName = format.format_key === "1qb" ? "value_curve_1qb.json" : "value_curve.json";
const curvePath = `${DATA}/${curveName}`;
const curve = existsSync(curvePath)
  ? JSON.parse(readFileSync(curvePath, "utf8"))
  : (readJson("value_curve.json", []) || []);

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
  curve,
  leagueId: LEAGUE_ID,
  asOf: new Date().toISOString().slice(0, 10),
});

function stripDeep(web) {
  if (!web) return null;
  return {
    root: web.root,
    origin: web.origin || null,
    now: web.now || null,
    spine: web.spine || [],
    seat: web.seat,
    partner: web.partner || null,
    date: web.date || null,
    n_hops: web.n_hops || 0,
    thesis: web.thesis || "",
    gave_value: web.gave_value,
    got_value: web.got_value,
    deal_pnl: web.deal_pnl,
    mark_pnl: web.mark_pnl,
    realized_pnl: web.realized_pnl,
    trail_pnl: web.trail_pnl,
    // Deep tree lives in trade-web/p/<id>.json
    root_node: null,
    branches: [],
  };
}

const playerDir = `${leagueUiDir()}/trade-web/p`;
mkdirSync(playerDir, { recursive: true });
// Clear stale player files from prior builds.
try {
  rmSync(playerDir, { recursive: true, force: true });
} catch (err) { /* ignore */ }
mkdirSync(playerDir, { recursive: true });

let fullBytes = 0;
for (const p of book.players || []) {
  const full = (p.webs && p.webs[0]) || null;
  if (!full) continue;
  const body = JSON.stringify({ v: book.v, player_id: p.player_id, name: p.name, web: full }) + "\n";
  const path = `${playerDir}/${p.player_id}.json`;
  writeFileSync(path, body);
  fullBytes += body.length;
  if (LEAGUE_ID === CUCKLE_LEAGUE_ID) {
    const legacyDir = `${DATA}/ui/trade-web/p`;
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(`${legacyDir}/${p.player_id}.json`, body);
  }
  p.webs = [stripDeep(full)];
  p.full = `trade-web/p/${p.player_id}.json`;
}

const index = {
  ...book,
  full_dir: "trade-web/p",
};
writeUi("trade-web.json", index);

const golden = (book.players || []).find((p) => String(p.player_id) === "12501"
  || String(p.name).toLowerCase().includes("matthew golden"));
const bucky = (book.players || []).find((p) => String(p.player_id) === "11584"
  || String(p.name).toLowerCase().includes("bucky"));

function peek(p) {
  if (!p) return null;
  const w = p.webs && p.webs[0];
  return {
    name: p.name,
    n_hops: p.n_hops,
    origin: p.origin_lab,
    now: p.now_lab,
    trail_pnl: p.trail_pnl,
    thesis: w && w.thesis,
    full: p.full,
  };
}

console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n_players: book.n_players,
  curve: curveName,
  index_bytes: JSON.stringify(index).length,
  full_bytes: fullBytes,
  sample: (book.players || []).slice(0, 5).map((p) => ({
    name: p.name,
    n_hops: p.n_hops,
    trail_pnl: p.trail_pnl,
    origin: p.origin_lab,
    now: p.now_lab,
  })),
  golden: peek(golden),
  bucky: peek(bucky),
  out: "ui/trade-web.json + ui/trade-web/p/*.json",
}, null, 2));
