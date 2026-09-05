#!/usr/bin/env node
/**
 * Shared titles/emblems catalog + historical unlocks from titles, traders, marks, members.
 * Unlock is computed. Equip is a profile write (localStorage / later Supabase).
 */
import { readFileSync, existsSync } from "node:fs";
import { leagueUiDir, setLeagueId, writeUi } from "./lib.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function loadUi(name, fallback) {
  const p = `${leagueUiDir()}/${name}`;
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf8"));
}

const titlesBook = loadUi("titles.json", { titles: [] });
const league = loadUi("league.json", { traders: [] });
const marks = loadUi("marks.json", { seats: {} });
const members = loadUi("members.json", []);

const titles = titlesBook.titles || [];
const traders = league.traders || [];
const seats = marks.seats || {};

const CATALOG = [
  { id: "champion", kind: "title", name: "Champion", how: "Win a league championship.", rarity: "gold" },
  { id: "repeat", kind: "title", name: "Repeat", how: "Win back-to-back championships.", rarity: "gold" },
  { id: "three_peat", kind: "title", name: "Three-Peat", how: "Win three championships in a row.", rarity: "gold" },
  { id: "three_time", kind: "title", name: "Three-Time Champion", how: "Win three career championships.", rarity: "gold" },
  { id: "two_time", kind: "title", name: "Two-Time Champion", how: "Win two career championships.", rarity: "gold" },
  { id: "points_champ", kind: "emblem", name: "Points Champ", how: "Finish first in points in a title season.", rarity: "gold" },
  { id: "bracket_thief", kind: "emblem", name: "Bracket Thief", how: "Win the title while not first in points.", rarity: "gold" },
  { id: "finalist", kind: "emblem", name: "Finalist", how: "Lose the championship game.", rarity: "silver" },
  { id: "last_place", kind: "emblem", name: "Last Place", how: "Finish last in a completed season.", rarity: "iron" },
  { id: "iron_core", kind: "emblem", name: "Iron Core", how: "Start a title game with 85% of the opening lineup.", rarity: "gold" },
  { id: "volume", kind: "emblem", name: "Volume", how: "Lead the league in career two-way trades.", rarity: "silver" },
  { id: "whale", kind: "emblem", name: "Whale", how: "Lead the league in value extracted per complete trade.", rarity: "silver" },
  { id: "extractor", kind: "emblem", name: "Extractor", how: "Lead the league in career even-book total.", rarity: "silver" },
  { id: "win_now", kind: "title", name: "Win-Now", how: "Carry the Win-now style label on the tape.", rarity: "bronze" },
  { id: "investor", kind: "title", name: "Investor", how: "Lead the league in pick capital taken in.", rarity: "bronze" },
  { id: "firsts_merchant", kind: "emblem", name: "Firsts Merchant", how: "Move the most first-round picks across a title path.", rarity: "bronze" },
  { id: "playoff_trader", kind: "emblem", name: "Playoff Trader", how: "Complete a trade during a title-season playoff window.", rarity: "bronze" },
  { id: "quiet_year", kind: "emblem", name: "Quiet Year", how: "Win a title in a quiet trade year (under the league mean).", rarity: "bronze" },
  { id: "manners", kind: "emblem", name: "Manners", how: "Lead the league in Manners on the all clock.", rarity: "silver" },
  { id: "draft_hit", kind: "emblem", name: "Draft Hit", how: "Lead the league in Draft surplus on the all clock.", rarity: "silver" },
  { id: "sit_right", kind: "emblem", name: "Sit Right", how: "Post a title-season sit rate of 90% or better.", rarity: "bronze" },
  { id: "bench_crime", kind: "emblem", name: "Bench Crime", how: "Win a title with a bench scorer topping your starter that week.", rarity: "iron" },
  { id: "waiver_touch", kind: "emblem", name: "Waiver Touch", how: "Lead a title-path window in waiver adds.", rarity: "bronze" },
  { id: "opening_day", kind: "emblem", name: "Opening Day Champ", how: "Start 11 or more title-game players from the opening roster.", rarity: "gold" },
  { id: "founding_draft", kind: "title", name: "Founding Draft", how: "Use a 2019 startup pick and later win a title.", rarity: "gold" },
];

function nth(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const s = ["th", "st", "nd", "rd"];
  const m = v % 100;
  return v + (s[(m - 20) % 10] || s[m] || s[0]);
}

function receipt(lines) {
  return (lines || []).filter(Boolean).join(" · ");
}

const unlocks = {};
function addUnlock(uid, id, got) {
  if (!uid || !id || !got) return;
  if (!unlocks[uid]) unlocks[uid] = {};
  if (!unlocks[uid][id]) unlocks[uid][id] = got;
}

const champCount = {};
const titleBySeason = {};
for (const t of titles) {
  const uid = String(t.user_id || "");
  champCount[uid] = (champCount[uid] || 0) + 1;
  titleBySeason[t.season] = t;
  addUnlock(uid, "champion", receipt([t.season, t.name]));
  if (t.repeat === "repeat") addUnlock(uid, "repeat", receipt([t.season, "back-to-back"]));
  if (t.repeat === "three_peat") addUnlock(uid, "three_peat", receipt([t.season, "three in a row"]));
  if (t.record && t.record.fpts_rank === 1) addUnlock(uid, "points_champ", receipt([t.season, "1st in points"]));
  if (t.record && Number(t.record.fpts_rank) > 1) {
    addUnlock(uid, "bracket_thief", receipt([t.season, `won from ${nth(t.record.fpts_rank)} in points`]));
  }
  const n = t.title_lineup && t.title_lineup.n;
  const from = t.title_lineup && t.title_lineup.from_opening;
  if (n && from != null && from / n >= 0.85) {
    addUnlock(uid, "iron_core", receipt([t.season, `${from} of ${n} from opening`]));
  }
  if (from >= 11) addUnlock(uid, "opening_day", receipt([t.season, `${from} opening starters`]));
  if (t.record && t.record.sit >= 0.9) {
    addUnlock(uid, "sit_right", receipt([t.season, `sit ${Math.round(t.record.sit * 100)}%`]));
  }
  if (t.final && t.final.top_bench && t.final.top && t.final.top_bench.points > t.final.top.points) {
    addUnlock(uid, "bench_crime", receipt([
      t.season,
      `${t.final.top_bench.player} ${t.final.top_bench.points} on the pine`,
    ]));
  }
  if (t.draft && t.draft.used && t.draft.used.some((u) => u.startup && String(t.season) === "2019")) {
    addUnlock(uid, "founding_draft", receipt(["2019 startup", "later champion"]));
  }
  if (t.draft && t.draft.startup) addUnlock(uid, "founding_draft", receipt(["2019 startup", t.season + " title"]));
  const mean = t.record && t.record.league_mean_trades;
  if (mean != null && t.record.trades < mean) {
    addUnlock(uid, "quiet_year", receipt([t.season, `${t.record.trades} trades vs ${mean} mean`]));
  }
  const play = t.windows && t.windows.playoffs;
  if (play && play.trades > 0) addUnlock(uid, "playoff_trader", receipt([t.season, `${play.trades} playoff trades`]));
  if (t.final && t.final.ok && t.final.opponent_user_id) {
    addUnlock(String(t.final.opponent_user_id), "finalist", receipt([t.season, `lost to ${t.name}`]));
  }
}

for (const [uid, n] of Object.entries(champCount)) {
  if (n >= 3) addUnlock(uid, "three_time", receipt([`${n} titles`]));
  if (n === 2) addUnlock(uid, "two_time", receipt([`${n} titles`]));
}

// Founding draft: any 2019 startup user who later won (ARae used startup and won 2019).
for (const t of titles) {
  if (!t.draft || !t.draft.used) continue;
  if (t.draft.used.some((u) => u.startup)) {
    addUnlock(String(t.user_id), "founding_draft", receipt(["startup draft", t.season]));
  }
}

for (const m of members) {
  if (Number(m.place) === 10) {
    addUnlock(String(m.user_id), "last_place", receipt([m.place_season || "latest", m.name]));
  }
}

if (traders.length) {
  const byTwo = traders.slice().sort((a, b) => (b.two_way || 0) - (a.two_way || 0))[0];
  const byWhale = traders.slice().sort((a, b) => (b.even_per_trade || 0) - (a.even_per_trade || 0))[0];
  const byExt = traders.slice().sort((a, b) => (b.even_total || 0) - (a.even_total || 0))[0];
  const byPick = traders.slice().sort((a, b) => (b.pick_total || 0) - (a.pick_total || 0))[0];
  if (byTwo) addUnlock(String(byTwo.user_id), "volume", receipt([`${byTwo.two_way} two-way trades`]));
  if (byWhale) addUnlock(String(byWhale.user_id), "whale", receipt([`${Math.round(byWhale.even_per_trade)} per trade`]));
  if (byExt) addUnlock(String(byExt.user_id), "extractor", receipt([`${Math.round(byExt.even_total)} career even`]));
  if (byPick && (byPick.pick_total || 0) > 0) {
    addUnlock(String(byPick.user_id), "investor", receipt([`${Math.round(byPick.pick_total)} pick capital`]));
  }
  for (const tr of traders) {
    if (tr.style && tr.style.label === "Win-now") {
      addUnlock(String(tr.user_id), "win_now", receipt(["Win-now style"]));
    }
  }
}

function leadBy(scoreFn, id, label) {
  let best = null;
  let bestUid = null;
  for (const [uid, seat] of Object.entries(seats)) {
    const v = scoreFn(seat);
    if (v == null || Number.isNaN(v)) continue;
    if (best == null || v > best) {
      best = v;
      bestUid = uid;
    }
  }
  if (bestUid) addUnlock(bestUid, id, receipt([label, String(Math.round(best))]));
}

leadBy((s) => {
  const all = s.lens && s.lens.all;
  if (!all) return null;
  return (Number(all.extract) || 0) - (Number(all.farmed) || 0);
}, "manners", "extract minus farmed");
leadBy((s) => (s.draft && s.draft.mean != null ? Number(s.draft.mean) : null), "draft_hit", "draft surplus");

let bestFirsts = -1;
let firstsUid = null;
let bestWaiver = -1;
let waiverUid = null;
for (const t of titles) {
  for (const win of Object.values(t.windows || {})) {
    if (!win) continue;
    const firsts = (win.firsts_in || 0) + (win.firsts_out || 0);
    if (firsts > bestFirsts) {
      bestFirsts = firsts;
      firstsUid = t.user_id;
    }
    if ((win.waiver_adds || 0) > bestWaiver) {
      bestWaiver = win.waiver_adds;
      waiverUid = t.user_id;
    }
  }
}
if (firstsUid && bestFirsts > 0) {
  addUnlock(String(firstsUid), "firsts_merchant", receipt([`${bestFirsts} firsts moved`]));
}
if (waiverUid && bestWaiver > 0) {
  addUnlock(String(waiverUid), "waiver_touch", receipt([`${bestWaiver} waiver adds`]));
}

const book = {
  v: 1,
  as_of: titlesBook.as_of || new Date().toISOString().slice(0, 10),
  catalog: CATALOG,
  unlocks,
};

writeUi("cosmetics.json", book);
const nUnlock = Object.values(unlocks).reduce((a, m) => a + Object.keys(m).length, 0);
console.log(`cosmetics.json ${CATALOG.length} catalog, ${nUnlock} unlocks`);
