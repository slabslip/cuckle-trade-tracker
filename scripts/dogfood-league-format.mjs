#!/usr/bin/env node
/**
 * Live Sleeper GET + detectLeagueFormat. Does not write a meter book.
 *
 *   node scripts/dogfood-league-format.mjs
 *   DOGFOOD_LEAGUE_ID=123 node scripts/dogfood-league-format.mjs
 */
import { CUCKLE_LEAGUE_ID, detectLeagueFormat, SLEEPER } from "../lib.mjs";

const EXTRA = String(process.env.DOGFOOD_LEAGUE_ID || "").trim();
// Public 12-team Superflex dynasty (FantasyCalc creator league) — N-team vs Cuckle.
const SECOND_DYNASTY = EXTRA || "1313051744942428160";
// Public 12-team 1QB redraft from Sleeper API docs.
const REDRAFT = "289646328504385536";

async function loadLeague(id) {
  const res = await fetch(`${SLEEPER}/league/${id}`);
  if (res.status === 404) return { id, missing: true };
  if (!res.ok) throw new Error(`Sleeper ${id} → ${res.status}`);
  const raw = await res.json();
  const format = detectLeagueFormat(raw);
  return {
    id,
    name: raw.name,
    season: raw.season,
    total_rosters: raw.total_rosters,
    previous_league_id: raw.previous_league_id || null,
    format,
  };
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

const cuckle = await loadLeague(CUCKLE_LEAGUE_ID);
assert(!cuckle.missing, "Cuckle league must resolve on Sleeper");
assert(cuckle.format.book === "2qb", "Cuckle is Superflex / 2qb");
assert(cuckle.format.kind === "dynasty", "Cuckle is dynasty");
assert(cuckle.format.tep === false, "Cuckle is not TEP");
assert(Number(cuckle.total_rosters) === 10, "Cuckle is 10 seats");
console.log(JSON.stringify({ cuckle }, null, 2));

const second = await loadLeague(SECOND_DYNASTY);
assert(!second.missing, "second dynasty league must resolve on Sleeper");
assert(second.id !== cuckle.id, "second league must be a different Sleeper id");
assert(Number(second.total_rosters) !== 10, "second dogfood league must not be a 10-seat clone");
assert(second.format.book === "2qb" || second.format.book === "1qb", "second league has a book");
console.log(JSON.stringify({ second }, null, 2));

const redraft = await loadLeague(REDRAFT);
assert(!redraft.missing, "docs redraft league must resolve on Sleeper");
assert(redraft.format.kind === "redraft", "Sleeper Friends League is redraft");
assert(redraft.format.book === "1qb", "Sleeper Friends League is 1QB");
assert(redraft.format.windows.includes("t0") && !redraft.format.windows.includes("y1"), "redraft clocks");
console.log(JSON.stringify({ redraft }, null, 2));

console.log("PASS dogfood-league-format");
