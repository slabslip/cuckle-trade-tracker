#!/usr/bin/env node
/**
 * Twelve redraft-board laws. Fail fast. Dynasty Cuckle must not move.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname;
const ID = "1389723418827460608";
const ui = `${ROOT}data/leagues/${ID}/ui`;
const raw = `${ROOT}data/leagues/${ID}/raw`;
const page = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");
const html = fs.readFileSync(`${ROOT}index.html`, "utf8");
const sw = fs.readFileSync(`${ROOT}sw.js`, "utf8");

function load(p, fb) {
  if (!fs.existsSync(p)) return fb;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function loop(n, cond, msg) {
  if (!cond) {
    console.error("BOARD " + n + " FAIL: " + msg);
    process.exit(1);
  }
  console.log("BOARD " + n + " PASS: " + msg);
}
function fnSrc(src, name) {
  const at = src.indexOf(`    function ${name}(`);
  if (at < 0) return "";
  const rest = src.slice(at + 4);
  const end = rest.indexOf("\n    function ");
  return end < 0 ? rest : rest.slice(0, end);
}
function sha(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

const finishes = load(`${ui}/finishes.json`, {});
const titles = load(`${ui}/titles.json`, { titles: [] });
const weeks = load(`${ui}/week-scores.json`, {});
const bridge = load(`${raw}/provider_bridge.json`, {});
const espnBridge = load(`${raw}/espn_bridge.json`, {});
const members = load(`${ui}/members.json`, []);

const redStart = page.indexOf("    const DATA_DASH_REDRAFT = [");
const redEnd = page.indexOf("];", redStart);
const redIds = [...page.slice(redStart, redEnd).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
const defStart = page.indexOf("    const DATA_DASH_DEFAULT = [");
const defEnd = page.indexOf("];", defStart);
const defIds = [...page.slice(defStart, defEnd).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);

// 1 Career-first home board
loop(1, redIds.join(",") === "career_avg,past_champions,points_king,contender_rate,sacko,week_scores,season_place"
  && html.includes('"career_avg", "past_champions", "points_king", "contender_rate"')
  && html.includes('"sacko", "week_scores", "season_place"'),
  "redraft home is the 7 career doors, floor-average first");

// 2 Saved-board key bumped so Safari / old seats drop the dynasty layout
loop(2, page.includes("cuckle.data.dash.v3.") && html.includes("cuckle.data.dash.v3.")
  && !page.includes("cuckle.data.dash.v2.") && !html.includes("cuckle.data.dash.v2."),
  "seat board key is v3 so saved dynasty tiles cannot paint GM home");

// 3 Stale remote / local boards persist the reset
loop(3, page.includes("if (stale) saveSeatDataDash(dataDashTiles)")
  && html.includes("if (stale) saveSeatDataDash(dataDashTiles)")
  && fnSrc(page, "dataDashReadLocal").includes("dataDashWriteLocal")
  && fnSrc(html, "dataDashReadLocal").includes("dataDashWriteLocal")
  && fnSrc(page, "dataDashRedraftStale").includes('list[0] !== "career_avg"')
  && fnSrc(page, "dataDashRedraftStale").includes("points_king")
  && fnSrc(page, "dataDashRedraftStale").includes("sacko"),
  "stale redraft boards reset, write local, and push the career board remote");

// 4 Door figs show the lead name, not a bare count
loop(4, fnSrc(page, "receiptDoorFace").includes("receiptDoorLeadFig")
  && fnSrc(html, "receiptDoorFace").includes("receiptDoorLeadFig")
  && page.includes("function receiptDoorWhoName(")
  && page.includes('class="door-who"')
  && html.includes('class="door-who"')
  && fnSrc(page, "homeTopDoorsHtml").includes("ensureWeekScores"),
  "redraft doors print the lead name + metric; home warms week scores");

// 5 Preset highlight uses this league's default, not Cuckle Deal
loop(5, fnSrc(page, "dataDashPresetHtml").includes("dataDashDefaultTiles")
  && fnSrc(page, "dataDashPresetHtml").includes("dataDashResearchTiles")
  && fnSrc(page, "dataDashPresetHtml").includes("Career")
  && fnSrc(html, "dataDashPresetHtml").includes("Career")
  && !fnSrc(page, "dataDashPresetHtml").includes("DATA_DASH_DEFAULT.join"),
  "Career / Research presets light against the redraft lists");

// 6 Dynasty default board and Cuckle cosmetics stay put
loop(6, defIds.join(",") === "my_trades,league_trades,my_draft,league_draft,profit_loss,past_champions,season_place,vs_you,firsts_held,week_scores,passed_around,seat_draft,uninsured"
  && sha(`${ROOT}data/ui/cosmetics.json`) === "840e2d358e28815ab28144379b9d6cc35860532f7d2c4fc5db260ffa4db7c318"
  && page.includes("Cuckle trade calculator")
  && page.includes("data/ui/calc-door.png"),
  "Cuckle 13-door board and cosmetics hash are unchanged");

// 7 Four pinned Sleeper seats own their ESPN years
const adizz = (finishes.seats || []).find((s) => s.name === "Adizzl3");
const tully = (finishes.seats || []).find((s) => s.name === "fatassmexican");
const aball = (finishes.seats || []).find((s) => s.name === "Aballers");
const sbzy = (finishes.seats || []).find((s) => s.name === "sbzy11");
loop(7, espnBridge["espn:{90C5E68F-9D70-442F-BC9A-166CEAB8036B}"] === "1132146625205567488"
  && espnBridge["espn:{47AFDC89-7278-40E5-909E-0ABC1E1CE345}"] === "741001884449525760"
  && espnBridge["espn:{4636A1A4-B500-469B-85D5-11E5642D3B10}"] === "1132149096636141568"
  && espnBridge["espn:{6D737882-6883-49E5-BEE2-DCB584C7394A}"] === "1131056110791880704"
  && adizz && adizz.n === 6 && adizz.contender === 83.3
  && tully && tully.titles_n === 2
  && aball && aball.n === 6
  && sbzy && sbzy.n === 6
  && (titles.titles || []).some((t) => t.season === "2024" && t.name === "fatassmexican")
  && (titles.titles || []).some((t) => t.season === "2023" && t.name === "fatassmexican")
  && weeks.all && weeks.all.high[0].name === "Adizzl3",
  "Durham/Tully/AB2/Shane pins land on Adizzl3, fatassmexican, Aballers, sbzy11");

// 8 Hunt stub stays out of the low book
const lows = ((weeks.all && weeks.all.low) || []);
loop(8, weeks.v === 2
  && !lows.some((r) => r.name === "collinmccaskill" && Number(r.points) < 20)
  && lows[0] && lows[0].name === "TaylorJohnson16" && Number(lows[0].points) === 28.34
  && page.includes("scoreIsChampionshipHunt") === false,
  "Collin 2020 W14 9-pt stub is not a countable low");

// 9 Leftover ESPN-only names stay unmapped until someone claims them
const leftovers = (bridge.espn_only_members || []).slice().sort();
loop(9, leftovers.join(",") === "JaredMcFadden,Ricky Swink,Stank93,hudmorse"
  && !(finishes.seats || []).some((s) => /hudmorse|Swink|Stank93/i.test(s.name || ""))
  && (finishes.seats || []).some((s) => s.name === "JaredMcFadden" && String(s.user_id).indexOf("espn:") === 0)
  && members.some((m) => m.name === "SethHenry12" && m.place > 12)
  && !(finishes.seats || []).some((s) => s.name === "SethHenry12"),
  "hudmorse, McFadden, Swink, Stank93 stay ESPN-only; Seth has no completed year");

// 10 Cache bust so public Pages / old SW drop the prior HTML
loop(10, page.includes('const DATA_V = "gmbeef20260918062000"')
  && html.includes('const DATA_V = "gmbeef20260918062000"')
  && sw.includes('chuckle-shell-v262-gm-board')
  && !sw.includes("chuckle-shell-v261-gm-beef"),
  "DATA_V and SW cache moved so Safari cannot keep the old board");

// 11 Redraft library still hides dynasty ops
loop(11, page.includes("DATA_DASH_DYNASTY_ONLY")
  && page.includes('"firsts_held", "uninsured", "available_cuffs"')
  && fnSrc(page, "dataDashById").includes("DATA_DASH_DYNASTY_ONLY")
  && fnSrc(html, "dataDashById").includes("DATA_DASH_DYNASTY_ONLY")
  && redIds.indexOf("firsts_held") < 0
  && redIds.indexOf("profit_loss") < 0
  && redIds.indexOf("draft_board") < 0,
  "dynasty-only doors stay off the redraft board and library");

// 12 Career leaders after the name map — the four home doors
const biff = (finishes.seats || []).find((s) => s.name === "Biff34");
const tbow = (finishes.seats || []).find((s) => s.name === "Tbow00");
const ztrain = (finishes.seats || []).find((s) => s.name === "ztrain123");
const champ = (titles.titles || [])[0];
loop(12, biff && biff.avg === 4.7 && finishes.seats[0].name === "Biff34"
  && tbow && tbow.fpts_avg >= 1500
  && adizz && adizz.contender === 83.3
  && ztrain && ztrain.last_n === 2
  && champ && champ.season === "2025" && champ.name === "Biff34"
  && weeks.all.high[0].name === "Adizzl3" && Number(weeks.all.high[0].points) === 180.02,
  "home leads: Biff 4.7 / 2025, Tbow points, Adizzl3 180.02, ztrain two sackos");

console.log("PASS 12 redraft board loops");
