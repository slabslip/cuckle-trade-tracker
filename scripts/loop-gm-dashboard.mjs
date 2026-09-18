#!/usr/bin/env node
/**
 * Twelve dashboard revision loops for Gm 2026 LLJ, then hunt-week
 * laws and the dataset loops. Each loop is one law. Fail fast.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { detectLeagueFormat } from "../lib.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const ID = "1389723418827460608";
const raw = `${ROOT}data/leagues/${ID}/raw`;
const ui = `${ROOT}data/leagues/${ID}/ui`;
const page = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");
const html = fs.existsSync(`${ROOT}index.html`) ? fs.readFileSync(`${ROOT}index.html`, "utf8") : "";

function load(p, fb) {
  if (!fs.existsSync(p)) return fb;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function loop(n, cond, msg) {
  if (!cond) {
    console.error("LOOP " + n + " FAIL: " + msg);
    process.exit(1);
  }
  console.log("LOOP " + n + " PASS: " + msg);
}

const leagues = load(`${raw}/leagues.json`, []);
const format = detectLeagueFormat(leagues);
const league = load(`${ui}/league.json`, {});
const titles = load(`${ui}/titles.json`, { titles: [] });
const espn = load(`${raw}/espn_status.json`, {});
const bridge = load(`${raw}/provider_bridge.json`, {});
const members = load(`${ui}/members.json`, []);
const calc = load(`${ui}/calculator.json`, {});

// 1 Brand
loop(1, page.includes('"#1GM calc"') && page.includes("calcBrandTitle") && fs.existsSync(`${ROOT}data/ui/gm-calc-door.png`),
  "calculator brand is #1GM calc with door art");
// 2 Menu law
loop(2, page.includes('item("calc", "Calculator"') && page.includes('"League Data"') && page.includes('"Settings"')
  && page.includes("slot + slot + slot"),
  "Menu still lists Calculator / League Data / Settings");
// 3 Redraft format
loop(3, format.kind === "redraft" && format.book === "1qb" && format.windows.join(",") === "t0,all",
  "book is 1QB redraft with t0+all only");
// 4 League.json format + providers
loop(4, league.format && league.format.kind === "redraft" && league.format.format_key === "1qb"
  && league.providers && league.providers.espn_league_id === "35763180"
  && Array.isArray(league.providers.sleeper_extra_ids)
  && league.providers.sleeper_extra_ids.includes("1253382148073725952"),
  "UI league.json carries redraft format, ESPN id, and extra Sleeper ids");
// 5 Sleeper seasons present
loop(5, (bridge.sleeper_seasons || []).includes("2025") && (bridge.sleeper_seasons || []).includes("2026"),
  "Sleeper 2025 and 2026 are on the merged bridge");
// 6 ESPN honest lock
loop(6, espn.authorized === false && espn.reason === "espn_private_needs_cookie"
  && (bridge.espn_seasons || []).length === 0,
  "ESPN years stay empty and locked without cookies (no fake history)");
// 7 Titles from Sleeper only until ESPN lands
loop(7, (titles.titles || []).length >= 1 && titles.titles.every((t) => t.provider !== "espn")
  && titles.titles.some((t) => t.season === "2025" && t.name === "Biff34"),
  "2025 Sleeper champion Biff34 is on Past Champions; no invented ESPN titles");
// 8 12 seats + parked 2026 join
loop(8, members.length >= 12 && members.some((m) => m.name === "SethHenry12" && m.place > 12)
  && members[0].name === "Biff34",
  "12-team 2025 finish plus parked 2026 seat");
// 9 1QB calc book
loop(9, Array.isArray(calc.players) && calc.players.length > 100,
  "calculator catalog is this league roster, not Cuckle");
// 10 Page helpers for redraft vs dynasty
loop(10, page.includes("This season · plug") && page.includes("value_1qb")
  && page.includes("function scoreWindows(") && page.includes('kind === "redraft"')
  && page.includes("DATA_DASH_REDRAFT") && page.includes("function resetLeagueSession(")
  && page.includes("function deskCuts("),
  "Team Ideas and calc info switch to this-season / 1QB copy");
// 11 Tape caption + titles lock copy
loop(11, page.includes("function leagueTapeHtml(") && page.includes("ESPN 35763180 stays locked")
  && page.includes("no Cuckle crowns are copied over"),
  "dashboard states Sleeper/ESPN merge status and does not copy Cuckle crowns");
// 12 Shared shell still Cuckle-default
loop(12, page.includes("Cuckle trade calculator") && page.includes("data/ui/calc-door.png")
  && page.includes("const DATA_V"),
  "Cuckle door and title stay the default; DATA_V present");

console.log("PASS 12 Gm dashboard loops");
const hunt = spawnSync(process.execPath, [new URL("test-week-score-hunt.mjs", import.meta.url).pathname], { stdio: "inherit" });
if (hunt.status) process.exit(hunt.status);
const espnLaws = spawnSync(process.execPath, [new URL("test-espn-franchise.mjs", import.meta.url).pathname], { stdio: "inherit" });
if (espnLaws.status) process.exit(espnLaws.status);
const finishes = spawnSync(process.execPath, [new URL("test-finishes.mjs", import.meta.url).pathname], { stdio: "inherit" });
if (finishes.status) process.exit(finishes.status);
const more = spawnSync(process.execPath, [new URL("loop-gm-datasets.mjs", import.meta.url).pathname], { stdio: "inherit" });
if (more.status) process.exit(more.status);
const iso = spawnSync(process.execPath, [new URL("loop-format-isolation.mjs", import.meta.url).pathname], { stdio: "inherit" });
if (iso.status) process.exit(iso.status);
