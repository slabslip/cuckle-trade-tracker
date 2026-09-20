#!/usr/bin/env node
/**
 * Thirteen redraft-board laws. Fail fast. Dynasty Cuckle must not move.
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
const finLib = fs.readFileSync(`${ROOT}lib/finishes.mjs`, "utf8");
function mpMatchesRsLeader() {
  const lead = {};
  for (const s of finishes.seats || []) {
    for (const p of s.places || []) {
      const y = String(p.season || "");
      const pts = Number(p.rs_fpts);
      if (!y || !Number.isFinite(pts)) continue;
      if (!lead[y] || pts > lead[y].pts) lead[y] = { name: s.name, pts };
    }
  }
  const got = {};
  for (const s of finishes.seats || []) {
    for (const p of s.payouts || []) {
      if (p && p.kind === "mp") got[String(p.season)] = s.name;
    }
  }
  return (finishes.seasons || []).every((y) => got[y] && lead[y] && got[y] === lead[y].name);
}
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
loop(1, redIds.join(",") === "rs_avg,playoff_n,playoff_avg,pot_net,season_place,points_king,sacko,past_champions,contender_rate,week_scores"
  && html.includes('"rs_avg", "playoff_n", "playoff_avg", "pot_net"')
  && html.includes('"season_place", "points_king", "sacko", "past_champions"'),
  "redraft home leads with RS / playoff / one net pot door");

// 2 Saved-board key bumped so Safari / old seats drop the two-door money board
loop(2, page.includes("cuckle.data.dash.v6.") && html.includes("cuckle.data.dash.v6.")
  && !page.includes("cuckle.data.dash.v5.") && !html.includes("cuckle.data.dash.v5."),
  "seat board key is v6 so the old career-avg plus how-i-finished board cannot paint GM home");

// 3 Stale remote / local boards persist the reset
loop(3, page.includes("if (stale) saveSeatDataDash(dataDashTiles)")
  && html.includes("if (stale) saveSeatDataDash(dataDashTiles)")
  && fnSrc(page, "dataDashReadLocal").includes("dataDashWriteLocal")
  && fnSrc(html, "dataDashReadLocal").includes("dataDashWriteLocal")
  && fnSrc(page, "dataDashRedraftStale").includes('list[0] !== "rs_avg"')
  && fnSrc(page, "dataDashRedraftStale").includes("playoff_n")
  && fnSrc(page, "dataDashRedraftStale").includes("pot_net"),
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
  && sha(`${ROOT}data/ui/cosmetics.json`) === "ef5d357636402f73d479925c5434a10e9bcd1a54ad679c189c4aab72955f650d"
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
  && aball && aball.n === 3
  && sbzy && sbzy.n === 2 && sbzy.avg === 5
  && (finishes.seats || []).some((s) => s.name === "Ricky Swink" && s.n === 3)
  && (finishes.seats || []).some((s) => s.name === "Stank93" && s.n === 1)
  && (titles.titles || []).some((t) => t.season === "2024" && t.name === "fatassmexican")
  && (titles.titles || []).some((t) => t.season === "2023" && t.name === "fatassmexican")
  && weeks.all && weeks.all.high[0].name === "Adizzl3",
  "Durham/Tully/AB2/Shane person pins; Shane is 2024–25 only, Ricky/Stank keep slot 6");

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
  && (finishes.seats || []).some((s) => s.name === "Ricky Swink" && s.n === 3)
  && (finishes.seats || []).some((s) => s.name === "Stank93" && s.n === 1)
  && (finishes.seats || []).some((s) => s.name === "hudmorse" && s.n === 3)
  && (finishes.seats || []).some((s) => s.name === "JaredMcFadden" && String(s.user_id).indexOf("espn:") === 0)
  && members.some((m) => m.name === "SethHenry12" && m.place > 12)
  && !(finishes.seats || []).some((s) => s.name === "SethHenry12"),
  "leavers keep their own ESPN years; Seth has no completed year");

// 10 Cache bust so public Pages / old SW drop the prior HTML
function inlineScriptParses(src) {
  const open = src.lastIndexOf("<script>");
  const close = src.lastIndexOf("</script>");
  if (open < 0 || close < open) return false;
  try {
    new Function(src.slice(open + 8, close));
    return true;
  } catch (err) {
    console.error(err && err.message);
    return false;
  }
}
loop(10, page.includes('const DATA_V = "analyzerspread20260920013500"')
  && html.includes('const DATA_V = "analyzerspread20260920013500"')
  && sw.includes('chuckle-shell-v306-analyzer-spread')
  && !sw.includes("chuckle-shell-v283-list-share")
  && !sw.includes("chuckle-shell-v282-finish-one")
  && inlineScriptParses(html),
  "DATA_V and SW cache moved so Safari cannot keep the old net copy");

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
const jnasty = (finishes.seats || []).find((s) => s.name === "JnastyGBE300");
const champ = (titles.titles || [])[0];
const y25 = (name) => ((finishes.seats || []).find((s) => s.name === name) || {}).places
  ?.find((p) => p.season === "2025");
const y24 = (name) => ((finishes.seats || []).find((s) => s.name === name) || {}).places
  ?.find((p) => p.season === "2024");
loop(12, finishes.v === 4 && finishes.pot && finishes.pot.entry === 300
  && finishes.seats[0].name === "Tbow00" && tbow && tbow.avg === 4.5 && tbow.rs_avg === 4 && tbow.playoff_avg === 3
  && biff && biff.avg === 4.7 && biff.fpts_avg === 1676.5
  && adizz && adizz.contender === 83.3 && adizz.last_n === 1 && adizz.playoff_n === 5
  && adizz.net === -500 && adizz.lost === 2000
  && tully && tully.won === 4600 && tully.lost === 1800 && tully.net === 2800
  && jnasty && jnasty.last_n === 2 && jnasty.lost === 2200 && jnasty.net === -1300
  && ztrain && ztrain.last_n === 1 && ztrain.playoff_avg === 2.8
  && y25("sbzy11") && y25("sbzy11").place === 5 && y25("sbzy11").from === "first_round"
  && y25("fatassmexican") && y25("fatassmexican").place === 6
  && y25("Adizzl3") && y25("Adizzl3").place === 12 && y25("Adizzl3").from === "regular"
  && y25("Biff34") && y25("Biff34").fpts === 2109.48
  && y24("kotula69") && y24("kotula69").place === 3 && y24("Tbow00") && y24("Tbow00").place === 4
  && /3rd-place game/.test(finishes.rule || "")
  && champ && champ.season === "2025" && champ.name === "Biff34"
  && weeks.all.high[0].name === "Adizzl3" && Number(weeks.all.high[0].points) === 180.02
  && page.includes("Last in regular season")
  && page.includes("most regular-season points $300")
  && html.includes("most regular-season points $300")
  && page.includes("Last place pays $200 extra into the pot")
  && html.includes("Last place pays $200 extra into the pot")
  && page.includes("3rd/4th from the 3rd-place game")
  && html.includes("3rd/4th from the 3rd-place game")
  && page.includes("Career average. Three completed seasons minimum")
  && html.includes("Career average. Three completed seasons minimum")
  && finishes.pot && finishes.pot.sacko === 200
  && finLib.includes("regularSeasonPointsForMp")
  && mpMatchesRsLeader()
  && finishes.pot && finishes.pot.mp === 300
  && page.includes("Regular-season record only")
  && page.includes("function finishYearLedger(") && html.includes("function finishYearLedger(")
  && page.includes("data-receipt-net") && html.includes("data-receipt-net")
  && page.includes("Career net") && html.includes("Career net"),
  "home leads: Tbow RS 4.0 / playoff 3.0, Adizzl3 5 playoffs, one net pot door");

loop(13, page.includes("function dataTileShareUrl(")
  && html.includes("function dataTileShareUrl(")
  && page.includes("data-tile-share")
  && html.includes("data-tile-share")
  && fnSrc(page, "dataDashTileHtml").includes("dataTileShareBtn(")
  && fnSrc(html, "dataDashTileHtml").includes("dataTileShareBtn(")
  && fnSrc(page, "homeTopDoorsHtml").includes("dataTileShareBtn(")
  && fnSrc(html, "homeTopDoorsHtml").includes("dataTileShareBtn(")
  && fnSrc(page, "dataTileShareUrl").includes('q.set("view", "data")')
  && !fnSrc(page, "dataTileShareUrl").includes('q.set("r"')
  && fnSrc(page, "honorPendingDataTile").includes("dataDashOpenReport"),
  "every data door ships a Share chip to a view=data&tile= group-text URL");

const yOf = (name, season) => ((finishes.seats || []).find((s) => s.name === name) || {}).places
  ?.find((p) => p.season === season);
loop(14, yOf("fatassmexican", "2024") && yOf("fatassmexican", "2024").place === 1
  && yOf("Adizzl3", "2024") && yOf("Adizzl3", "2024").place === 2
  && yOf("kotula69", "2024") && yOf("kotula69", "2024").place === 3
  && yOf("Tbow00", "2024") && yOf("Tbow00", "2024").place === 4
  && yOf("TaylorJohnson16", "2024") && yOf("TaylorJohnson16", "2024").place === 7
  && yOf("ztrain123", "2025") && yOf("ztrain123", "2025").place === 3
  && yOf("collinmccaskill", "2025") && yOf("collinmccaskill", "2025").place === 4
  && yOf("TaylorJohnson16", "2020") && yOf("TaylorJohnson16", "2020").place === 12
  && yOf("JnastyGBE300", "2021") && yOf("JnastyGBE300", "2021").place === 12
  && /last = worst RS record/.test(finishes.rule || "")
  && Array.isArray(finishes.years) && finishes.years[0] && finishes.years[0].season === "2025"
  && finishes.years.find((y) => y.season === "2024")?.rows[2]?.name === "kotula69"
  && page.includes("function finishYearBoard(") && html.includes("function finishYearBoard(")
  && page.includes('id === "season_place" && leagueFormat().kind === "redraft"')
  && html.includes('id === "season_place" && leagueFormat().kind === "redraft"')
  && page.includes("function finishYearWant(") && html.includes("function finishYearWant(")
  && page.includes("function finishPlaceSeats(") && html.includes("function finishPlaceSeats(")
  && page.includes('id === "career_avg" && typeof isRedraftLeague')
  && html.includes('id === "career_avg" && typeof isRedraftLeague')
  && page.includes('from === "bracket"') && html.includes('from === "bracket"'),
  "playoff bracket 1-4 from money games; bottom six and sacko stay regular season");

console.log("PASS 14 redraft board loops");
