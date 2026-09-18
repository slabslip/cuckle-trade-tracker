#!/usr/bin/env node
/**
 * Dynasty Cuckle must not move when redraft views ship.
 * Also asserts the redraft environment is present in generate-page / index.
 */
import fs from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
function load(p, fb) {
  if (!fs.existsSync(p)) return fb;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function loop(n, cond, msg) {
  if (!cond) {
    console.error("ISO " + n + " FAIL: " + msg);
    process.exit(1);
  }
  console.log("ISO " + n + " PASS: " + msg);
}

const page = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");
const html = fs.existsSync(`${ROOT}index.html`) ? fs.readFileSync(`${ROOT}index.html`, "utf8") : "";
const cuckle = load(`${ROOT}data/ui/league.json`, {});
const gm = load(`${ROOT}data/leagues/1389723418827460608/ui/league.json`, {});
const cuckleDir = load(`${ROOT}data/ui/seat-direction.json`, {});
const gmCos = load(`${ROOT}data/leagues/1389723418827460608/ui/cosmetics.json`, {});
const cuckleCos = load(`${ROOT}data/ui/cosmetics.json`, {});

loop(1, !cuckle.format || (cuckle.format.kind === "dynasty" && cuckle.format.format_key === "2qb"),
  "Cuckle league.json is dynasty (or pre-format Superflex default)");
loop(2, gm.format && gm.format.kind === "redraft" && gm.format.format_key === "1qb"
  && Array.isArray(gm.format.windows) && gm.format.windows.join(",") === "t0,all",
  "GM book stays 1QB redraft t0+all");
loop(3, page.includes('const DATA_DASH_DEFAULT = [')
  && page.includes('"my_trades", "league_trades", "my_draft", "league_draft", "profit_loss"')
  && page.includes("const DATA_DASH_REDRAFT = [")
  && page.includes('"rs_avg", "playoff_n", "playoff_avg", "gross_won", "gross_lost"')
  && page.includes('"my_trades", "league_trades", "my_draft", "league_draft", "profit_loss"'),
  "dynasty default board unchanged; redraft board leads RS / playoff / pot");
loop(4, page.includes("function resetLeagueSession(")
  && page.includes("function isRedraftLeague(")
  && page.includes("function deskCuts(")
  && page.includes("leagueLoadGen")
  && page.includes("Add Yahoo ID")
  && page.includes("Redraft calculator"),
  "toggle reset, 1QB cuts, Yahoo slot, and redraft calc brand ship");
loop(5, Array.isArray(cuckleDir.seats) && cuckleDir.seats.some((s) => s.label === "Hard rebuild"),
  "Cuckle direction still has Hard rebuild");
loop(6, (cuckleCos.catalog || []).some((c) => c.name === "Dynasty Immortal")
  && (cuckleCos.catalog || []).some((c) => c.pair === "pick_hoard"),
  "Cuckle cosmetics keep Dynasty Immortal and Pick Collector");
loop(7, !page.includes("DATA_DASH_DEFAULT = DATA_DASH_REDRAFT")
  && page.includes("DATA_DASH_DYNASTY_ONLY"),
  "redraft hides dynasty-only doors without rewriting the Cuckle default list");
loop(8, html.includes("function resetLeagueSession(") || html === "",
  "index.html carries resetLeagueSession after generate-page (or is about to)");

console.log("PASS format isolation loops");
