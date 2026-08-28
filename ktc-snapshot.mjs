#!/usr/bin/env node
/** Weekly Keep Trade Cut Superflex snapshot. Offline file → revalue. No live page scrape. */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { DATA, parseCsv, writeJson } from "./lib.mjs";

const UA =
  "CuckleChunckle-tracker/1.0 (+https://github.com/slabslip/cuckle-trade-tracker; personal weekly Superflex snapshot; not a live in-app scrape)";
const PAGES = 10;
const DELAY_MS = 600;
const FORMAT = 2; // Superflex. format=1 is 1QB — do not use.
const BASE =
  "https://keeptradecut.com/dynasty-rankings?page={page}&filters=QB|WR|RB|TE|RDP&format=" + FORMAT;

export function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function ktcPickKey(name) {
  const named = String(name).match(/^(\d{4})\s+(Early|Mid|Late)\s+(\d+)(st|nd|rd|th)$/i);
  if (named) {
    const tier = named[2][0].toUpperCase() + named[2].slice(1).toLowerCase();
    return `pickval:${named[1]}:${Number(named[3])}:${tier}`;
  }
  const generic = String(name).match(/^(\d{4})\s+(\d+)(st|nd|rd|th)$/i);
  if (generic) return `pickval:${generic[1]}:${Number(generic[2])}:Mid`;
  return null;
}

function firstMatch(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

export function parseKtcPage(html) {
  const blocks = String(html).split(/class="onePlayer"/).slice(1);
  const out = [];
  for (const block of blocks) {
    const href = firstMatch(block, /href="\/dynasty-rankings\/players\/([^"]+)"/);
    const rawName = firstMatch(block, /href="\/dynasty-rankings\/players\/[^"]+"[^>]*>([^<]+)</);
    const valueText = firstMatch(block, /class="value">\s*<p>(\d+)<\/p>/);
    if (!rawName || valueText == null) continue;
    const name = decodeEntities(rawName).trim();
    const value = Number(valueText);
    if (!name || !Number.isFinite(value)) continue;
    const teamRaw = firstMatch(block, /class="player-team">([^<]*)<\/span>/);
    const team = teamRaw && teamRaw !== "FA" ? teamRaw.trim() : null;
    const posRank = firstMatch(block, /class="position">([A-Z]{1,3}\d+)<\/p>/);
    const pickKey = ktcPickKey(name);
    const pos = pickKey ? "PI" : posRank ? posRank.slice(0, 2) : null;
    const ageText = firstMatch(block, /class="position hidden-xs">([0-9.]+)\s*y\.o\./);
    const rankText = firstMatch(block, /class="rank-number">\s*<p>(\d+)<\/p>/);
    const slugTail = href ? href.split("-").pop() : null;
    const ktcId = slugTail && /^\d+$/.test(slugTail) ? slugTail : null;
    out.push({
      name,
      team,
      pos,
      age: ageText ? Number(ageText) : null,
      value,
      ktc_rank: rankText ? Number(rankText) : null,
      ...(ktcId ? { ktc_id: ktcId } : {}),
      ...(pickKey ? { pick_key: pickKey } : {}),
    });
  }
  return out;
}

function normName(name) {
  return decodeEntities(name)
    .toLowerCase()
    .replace(/[.'']/g, "")
    .replace(/\b(jr|sr|iii|ii|iv)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function idMaps(idsText) {
  const byKtc = new Map();
  const byName = new Map();
  for (const r of parseCsv(idsText)) {
    const sid = String(r.sleeper_id || "").trim();
    if (!sid || sid === "NA") continue;
    const kid = String(r.ktc_id || "").trim();
    if (kid && kid !== "NA") byKtc.set(kid, sid);
    for (const raw of [r.merge_name, r.name]) {
      const n = normName(raw || "");
      if (n && !byName.has(n)) byName.set(n, sid);
    }
  }
  return { byKtc, byName };
}

// ponytail: ktc_id first; name is last-write-safe via first-seen. Pos+team disambiguation if misses pile up.
export function attachKtcIds(players, idsText) {
  const { byKtc, byName } = idMaps(idsText);
  const unmatched = [];
  for (const p of players) {
    if (p.pos === "PI" || p.pick_key) {
      if (!p.pick_key) {
        p.pick_key = ktcPickKey(p.name);
        if (!p.pick_key) unmatched.push({ name: p.name, pos: p.pos, reason: "pick_unparsed" });
      }
      continue;
    }
    const sid = (p.ktc_id && byKtc.get(String(p.ktc_id))) || byName.get(normName(p.name));
    if (sid) p.sleeper_id = sid;
    else unmatched.push({ name: p.name, team: p.team, pos: p.pos, ktc_id: p.ktc_id || null, reason: "no_sleeper" });
  }
  return unmatched;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function selfCheckParse() {
  const html = `
    <div class="onePlayer">
      <div class="rank-number"><p>3</p></div>
      <div class="player-name"><p><a href="/dynasty-rankings/players/ja-marr-chase-1004">Ja&#x27;Marr Chase</a><span class="player-team">CIN</span></p></div>
      <div class="position-team"><p class="position">WR1</p><p class="position hidden-xs">26.5 y.o.</p></div>
      <div class="value"><p>9975</p></div>
    </div>
    <div class="onePlayer">
      <div class="rank-number"><p>21</p></div>
      <div class="player-name"><p><a href="/dynasty-rankings/players/2027-early-1st-1702">2027 Early 1st</a><span class="player-team">FA</span></p></div>
      <div class="value"><p>6916</p></div>
    </div>`;
  const rows = parseKtcPage(html);
  if (rows.length !== 2) throw new Error(`self-check failed: parse count ${rows.length}`);
  if (rows[0].name !== "Ja'Marr Chase" || rows[0].value !== 9975 || rows[0].ktc_id !== "1004") {
    throw new Error("self-check failed: chase parse");
  }
  if (rows[1].pick_key !== "pickval:2027:1:Early" || rows[1].pos !== "PI") {
    throw new Error("self-check failed: pick parse");
  }
}

async function fetchPage(page) {
  const url = BASE.replace("{page}", String(page));
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`KTC page ${page} ${res.status} ${url}`);
  return res.text();
}

async function main() {
  selfCheckParse();
  const players = [];
  const seen = new Set();
  for (let page = 0; page < PAGES; page++) {
    const html = await fetchPage(page);
    const rows = parseKtcPage(html);
    console.error(`ktc page ${page}: ${rows.length} rows`);
    for (const row of rows) {
      const key = row.ktc_id || row.pick_key || row.name;
      if (seen.has(key)) continue;
      seen.add(key);
      players.push(row);
    }
    if (page < PAGES - 1) await sleep(DELAY_MS);
  }
  if (!players.length) {
    throw new Error("KTC HTML shape changed or blocked: zero players. Inspect one page before retrying.");
  }

  let unmatched = [];
  const idsPath = `${DATA}/dp/latest/db_playerids.csv`;
  if (fs.existsSync(idsPath)) {
    unmatched = attachKtcIds(players, fs.readFileSync(idsPath, "utf8"));
  } else {
    unmatched = players.filter((p) => p.pos !== "PI").map((p) => ({
      name: p.name, team: p.team, pos: p.pos, reason: "no_id_csv",
    }));
    for (const p of players) {
      if ((p.pos === "PI" || /^\d{4}\s/.test(p.name)) && !p.pick_key) {
        p.pick_key = ktcPickKey(p.name);
      }
    }
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const snap = {
    as_of: asOf,
    source: "keeptradecut",
    format: "superflex",
    fetched_at: new Date().toISOString(),
    players,
    unmatched,
  };
  writeJson(`ktc/${asOf}.json`, snap);
  writeJson("ktc/latest.json", snap);
  const mapped = players.filter((p) => p.sleeper_id).length;
  const picks = players.filter((p) => p.pos === "PI").length;
  console.log(JSON.stringify({
    as_of: asOf,
    players: players.length,
    mapped,
    picks,
    unmatched: unmatched.length,
    unmatched_examples: unmatched.slice(0, 12).map((u) => u.name),
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
