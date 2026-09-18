#!/usr/bin/env node
/**
 * Offline: the shared-tweet tape is the same on every book, and each book only
 * tags seats from its own members.json.
 *
 *   node news-sync.mjs --retag-leagues
 *   node scripts/test-news-leagues.mjs
 */
import fs from "node:fs";
import {
  CUCKLE_LEAGUE_ID,
  DATA,
  REDRAFT_REVIEW_LEAGUE_ID,
} from "../lib.mjs";
import { listNewsLeagues, buildOwnershipFor } from "../news-sync.mjs";

function readNews(rel) {
  const path = `${DATA}/${rel}`;
  if (!fs.existsSync(path)) throw new Error(`missing ${rel}`);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function namesOn(book) {
  const out = new Set();
  for (const it of book.items || []) {
    for (const n of it.managers || []) if (n) out.add(n);
    if (it.manager) out.add(it.manager);
    for (const p of it.players || []) if (p.manager) out.add(p.manager);
  }
  return out;
}

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

const leagues = listNewsLeagues();
if (!leagues.includes(CUCKLE_LEAGUE_ID)) fail("Cuckle missing from listNewsLeagues");
if (!leagues.includes(REDRAFT_REVIEW_LEAGUE_ID)) fail("GM missing from listNewsLeagues");

const cuckle = readNews("ui/news.json");
const cuckleScoped = readNews(`leagues/${CUCKLE_LEAGUE_ID}/ui/news.json`);
const gm = readNews(`leagues/${REDRAFT_REVIEW_LEAGUE_ID}/ui/news.json`);

if ((cuckle.items || []).length !== 60) fail(`Cuckle items ${cuckle.items.length}, want 60`);
if ((cuckleScoped.items || []).length !== (cuckle.items || []).length) {
  fail("Cuckle scoped news.json drifted from data/ui/news.json");
}
if ((gm.items || []).length !== (cuckle.items || []).length) {
  fail(`GM items ${gm.items.length}, Cuckle ${cuckle.items.length} — same tape`);
}

const cuckleIds = (cuckle.items || []).map((it) => it.id).join(",");
const gmIds = (gm.items || []).map((it) => it.id).join(",");
if (cuckleIds !== gmIds) fail("GM tweet ids differ from Cuckle — same tape, same order");

const cucklePack = buildOwnershipFor(CUCKLE_LEAGUE_ID);
const gmPack = buildOwnershipFor(REDRAFT_REVIEW_LEAGUE_ID);
const cuckleNames = new Set(cucklePack.members.map((m) => m.name));
const gmNames = new Set(gmPack.members.map((m) => m.name));

for (const name of namesOn(cuckle)) {
  if (!cuckleNames.has(name)) fail(`Cuckle feed tags ${name}, not a Cuckle member`);
}
for (const name of namesOn(gm)) {
  if (!gmNames.has(name)) fail(`GM feed tags ${name}, not a GM member`);
}

const cuckleOnly = [...cuckleNames].filter((n) => !gmNames.has(n));
for (const name of cuckleOnly) {
  if (namesOn(gm).has(name)) fail(`GM feed leaked Cuckle-only seat ${name}`);
}

const gmOnFeed = [...namesOn(gm)].filter((n) => !cuckleNames.has(n));
if (!gmOnFeed.length) {
  fail("GM feed tagged no GM-only seat — retag did not land on this book's rosters");
}

const cuckleLines = (cuckle.items || []).map((it) => it.league_line).join("\0");
const gmLines = (gm.items || []).map((it) => it.league_line).join("\0");
if (cuckleLines !== gmLines) fail("league_line must stay the Cuckle voice on every book");

if (!process.exitCode) {
  console.log(JSON.stringify({
    ok: true,
    items: cuckle.items.length,
    leagues,
    gm_managers_on_feed: [...namesOn(gm)].sort(),
    gm_only_tags: gmOnFeed.sort(),
  }, null, 2));
}
