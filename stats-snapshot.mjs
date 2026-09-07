#!/usr/bin/env node
/** Daily FFPG / P/E signal file. Never enters the today number. */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { DATA, CUCKLE_LEAGUE_ID, setLeagueId, sleeperGet, writeUi } from "./lib.mjs";
import { loadSnapAsOf } from "./market-snap.mjs";

const SKILL = new Set(["QB", "RB", "WR", "TE"]);
/** Below this, FFPG is noise — a 0.1 PPR / 11-game "sell" chip is not a signal. */
const MIN_FFPG = 4;

function loadPlayers() {
  const path = `${DATA}/players.nfl.json`;
  if (!fs.existsSync(path)) return {};
  try { return JSON.parse(fs.readFileSync(path, "utf8")) || {}; }
  catch { return {}; }
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function signalOf(pe) {
  if (pe == null || !Number.isFinite(pe)) return null;
  if (pe < 0.7) return "buy";
  if (pe > 1.5) return "sell";
  return "fair";
}

async function main() {
  setLeagueId(process.env.LEAGUE_ID || CUCKLE_LEAGUE_ID);
  const season = Number(process.env.PE_SEASON) || 2025;
  const stats = await sleeperGet(`/stats/nfl/regular/${season}`);
  if (!stats || typeof stats !== "object") throw new Error(`Sleeper stats ${season} empty`);
  const nfl = loadPlayers();
  const ktc = loadSnapAsOf("ktc", new Date().toISOString().slice(0, 10));
  const ktcBy = new Map();
  for (const p of ktc?.players || []) {
    if (p.sleeper_id && Number.isFinite(p.value)) ktcBy.set(String(p.sleeper_id), p.value);
  }
  const rows = [];
  for (const [id, st] of Object.entries(stats)) {
    const pts = Number(st?.pts_ppr);
    const gp = Number(st?.gp);
    if (!Number.isFinite(pts) || !Number.isFinite(gp) || gp < 4) continue;
    const pos = String(nfl[id]?.position || "").toUpperCase();
    if (!SKILL.has(pos)) continue;
    const ffpg = pts / gp;
    const price = ktcBy.get(String(id));
    rows.push({ id: String(id), pos, ffpg, gp, pts, price });
  }
  const peByPos = {};
  for (const pos of SKILL) {
    const here = rows.filter((r) => r.pos === pos && r.price != null && r.ffpg >= MIN_FFPG);
    const medP = median(here.map((r) => r.price));
    const medE = median(here.map((r) => r.ffpg));
    peByPos[pos] = { med_price: medP, med_ffpg: medE };
    for (const r of here) {
      const pm = medP ? r.price / medP : null;
      const em = medE ? r.ffpg / medE : null;
      r.pe = pm != null && em ? pm / em : null;
      r.signal = signalOf(r.pe);
    }
  }
  const players = {};
  for (const r of rows) {
    players[r.id] = {
      pos: r.pos,
      ffpg: Math.round(r.ffpg * 10) / 10,
      gp: r.gp,
      pe: r.pe != null ? Math.round(r.pe * 100) / 100 : null,
      signal: r.signal || null,
    };
  }
  const book = {
    v: 1,
    as_of: new Date().toISOString().slice(0, 10),
    season,
    source: "sleeper-stats+ktc",
    note: "P/E is a Desk / Info signal. It never enters today.",
    medians: peByPos,
    players,
  };
  writeUi("pe.json", book);
  console.log(JSON.stringify({
    as_of: book.as_of,
    season,
    players: Object.keys(players).length,
    with_pe: Object.values(players).filter((p) => p.pe != null).length,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
