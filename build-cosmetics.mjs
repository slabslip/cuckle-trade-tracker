#!/usr/bin/env node
/**
 * Shared titles/emblems catalog + historical unlocks from titles, traders, marks, members, picks.
 * Every award is a matched pair: one title + one emblem (same `pair` key, same unlock gate).
 * Equip remains one title + one emblem at a time.
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
const picksBook = loadUi("picks.json", {});

const titles = titlesBook.titles || [];
const traders = league.traders || [];
const drafters = league.drafters_rookie || [];
const seats = marks.seats || {};

const TITLE_LADDER = ["five_time", "four_time", "three_peat", "three_time", "repeat", "two_time", "champion"];

/**
 * Matched pairs. `title.id` / `emblem.id` stay stable for live ids; twins use
 * `_title` / `_mark`. Unlocking a pair grants both cosmetics.
 */
const PAIRS = [
  // —— Championship ladder (titles lead catalog order) ——
  {
    pair: "five_time", rarity: "gold",
    title: { id: "five_time", name: "Eternal Champion", how: "Win five career championships. The biggest unlock in the league." },
    emblem: { id: "five_time_mark", name: "Five Crowns", how: "Win five career championships — wear the crowns as a mark." },
  },
  {
    pair: "four_time", rarity: "gold",
    title: { id: "four_time", name: "Dynasty Immortal", how: "Win four career championships." },
    emblem: { id: "four_time_mark", name: "Four Crowns", how: "Win four career championships." },
  },
  {
    pair: "three_peat", rarity: "gold",
    title: { id: "three_peat", name: "Three-Peat", how: "Win three championships in a row." },
    emblem: { id: "three_peat_mark", name: "Three-Peat Seal", how: "Win three championships in a row." },
  },
  {
    pair: "three_time", rarity: "gold",
    title: { id: "three_time", name: "Dynasty Established", how: "Win three career championships." },
    emblem: { id: "three_time_mark", name: "Triple Crown", how: "Win three career championships." },
  },
  {
    pair: "repeat", rarity: "gold",
    title: { id: "repeat", name: "Back-to-Back", how: "Win back-to-back championships." },
    emblem: { id: "repeat_mark", name: "Repeat Seal", how: "Win back-to-back championships." },
  },
  {
    pair: "two_time", rarity: "gold",
    title: { id: "two_time", name: "Two-Time Champion", how: "Win two career championships." },
    emblem: { id: "two_time_mark", name: "Double Crown", how: "Win two career championships." },
  },
  {
    pair: "champion", rarity: "gold",
    title: { id: "champion", name: "Champion", how: "Win a league championship." },
    emblem: { id: "champion_mark", name: "Champ Ring", how: "Win a league championship." },
  },

  // —— How you won / finalists ——
  {
    pair: "points_champ", rarity: "gold",
    title: { id: "points_champ_title", name: "Points Champion", how: "Finish first in points in a title season." },
    emblem: { id: "points_champ", name: "Points Champ", how: "Finish first in points in a title season." },
  },
  {
    pair: "bracket_thief", rarity: "gold",
    title: { id: "bracket_thief_title", name: "Bracket Bandit", how: "Win the title while not first in points." },
    emblem: { id: "bracket_thief", name: "Bracket Thief", how: "Win the title while not first in points." },
  },
  {
    pair: "three_time_finalist", rarity: "silver",
    title: { id: "three_time_finalist_title", name: "Three-Time Bridesmaid", how: "Lose the championship game three times." },
    emblem: { id: "three_time_finalist", name: "Three-Time Finalist", how: "Lose the championship game three times." },
  },
  {
    pair: "two_time_finalist", rarity: "silver",
    title: { id: "two_time_finalist_title", name: "Two-Time Bridesmaid", how: "Lose the championship game twice." },
    emblem: { id: "two_time_finalist", name: "Two-Time Finalist", how: "Lose the championship game twice." },
  },
  {
    pair: "finalist", rarity: "silver",
    title: { id: "finalist_title", name: "Runner-Up", how: "Lose the championship game." },
    emblem: { id: "finalist", name: "Finalist", how: "Lose the championship game." },
  },
  {
    pair: "last_place", rarity: "iron",
    title: { id: "last_place_title", name: "Sacko", how: "Finish last in a completed season." },
    emblem: { id: "last_place", name: "Last Place", how: "Finish last in a completed season." },
  },

  // —— Title-game roster ——
  {
    pair: "iron_core", rarity: "gold",
    title: { id: "iron_core_title", name: "Iron Core", how: "Start a title game with 85% of the opening lineup." },
    emblem: { id: "iron_core", name: "Iron Core", how: "Start a title game with 85% of the opening lineup." },
  },
  {
    pair: "opening_day", rarity: "gold",
    title: { id: "opening_day_title", name: "Opening Day Champ", how: "Start 11 or more title-game players from the opening roster." },
    emblem: { id: "opening_day", name: "Opening Day Champ", how: "Start 11 or more title-game players from the opening roster." },
  },
  {
    pair: "sit_right", rarity: "bronze",
    title: { id: "sit_right_title", name: "Sit Right", how: "Post a title-season sit rate of 90% or better." },
    emblem: { id: "sit_right", name: "Sit Right", how: "Post a title-season sit rate of 90% or better." },
  },
  {
    pair: "bench_crime", rarity: "iron",
    title: { id: "bench_crime_title", name: "Bench Crime", how: "Win a title with a bench scorer topping your starter that week." },
    emblem: { id: "bench_crime", name: "Bench Crime", how: "Win a title with a bench scorer topping your starter that week." },
  },

  // —— Trade identity ——
  {
    pair: "volume", rarity: "silver",
    title: { id: "volume_title", name: "Volume Dealer", how: "Lead the league in career two-way trades." },
    emblem: { id: "volume", name: "Volume", how: "Lead the league in career two-way trades." },
  },
  {
    pair: "whale", rarity: "silver",
    title: { id: "whale_title", name: "Whale", how: "Lead the league in value extracted per complete trade." },
    emblem: { id: "whale", name: "Whale", how: "Lead the league in value extracted per complete trade." },
  },
  {
    pair: "extractor", rarity: "silver",
    title: { id: "extractor_title", name: "Extractor", how: "Lead the league in career even-book total." },
    emblem: { id: "extractor", name: "Extractor", how: "Lead the league in career even-book total." },
  },
  {
    pair: "win_now", rarity: "bronze",
    title: { id: "win_now", name: "Win-Now", how: "Carry the Win-now style label on the tape." },
    emblem: { id: "win_now_mark", name: "Win-Now Mark", how: "Carry the Win-now style label on the tape." },
  },
  {
    pair: "investor", rarity: "bronze",
    title: { id: "investor", name: "Investor", how: "Lead the league in pick capital taken in." },
    emblem: { id: "investor_mark", name: "Investor Mark", how: "Lead the league in pick capital taken in." },
  },
  {
    pair: "firsts_merchant", rarity: "bronze",
    title: { id: "firsts_merchant_title", name: "Firsts Merchant", how: "Move the most first-round picks across a title path." },
    emblem: { id: "firsts_merchant", name: "Firsts Merchant", how: "Move the most first-round picks across a title path." },
  },
  {
    pair: "playoff_trader", rarity: "bronze",
    title: { id: "playoff_trader_title", name: "Playoff Trader", how: "Complete a trade during a title-season playoff window." },
    emblem: { id: "playoff_trader", name: "Playoff Trader", how: "Complete a trade during a title-season playoff window." },
  },
  {
    pair: "quiet_year", rarity: "bronze",
    title: { id: "quiet_year_title", name: "Quiet Year", how: "Win a title in a quiet trade year (under the league mean)." },
    emblem: { id: "quiet_year", name: "Quiet Year", how: "Win a title in a quiet trade year (under the league mean)." },
  },
  {
    pair: "manners", rarity: "silver",
    title: { id: "manners_title", name: "Manners", how: "Lead the league in Manners on the all clock." },
    emblem: { id: "manners", name: "Manners", how: "Lead the league in Manners on the all clock." },
  },
  {
    pair: "draft_hit", rarity: "silver",
    title: { id: "draft_hit_title", name: "Draft Hit", how: "Lead the league in Draft surplus on the all clock." },
    emblem: { id: "draft_hit", name: "Draft Hit", how: "Lead the league in Draft surplus on the all clock." },
  },
  {
    pair: "waiver_touch", rarity: "bronze",
    title: { id: "waiver_touch_title", name: "Waiver Touch", how: "Lead a title-path window in waiver adds." },
    emblem: { id: "waiver_touch", name: "Waiver Touch", how: "Lead a title-path window in waiver adds." },
  },
  {
    pair: "founding_draft", rarity: "gold",
    title: { id: "founding_draft", name: "Founding Draft", how: "Use a 2019 startup pick and later win a title." },
    emblem: { id: "founding_draft_mark", name: "Founding Mark", how: "Use a 2019 startup pick and later win a title." },
  },

  // —— 15 new creative pairs (varying difficulty) ——
  {
    pair: "blowout", rarity: "silver",
    title: { id: "blowout", name: "Blowout Champion", how: "Win the championship game by 40 or more points." },
    emblem: { id: "blowout_mark", name: "Blowout", how: "Win the championship game by 40 or more points." },
  },
  {
    pair: "nailbiter", rarity: "silver",
    title: { id: "nailbiter", name: "Nail-Biter", how: "Win the championship game by 10 or fewer points." },
    emblem: { id: "nailbiter_mark", name: "Heart Stopper", how: "Win the championship game by 10 or fewer points." },
  },
  {
    pair: "climber", rarity: "gold",
    title: { id: "climber", name: "Table Climber", how: "Win a title after finishing 5th or worse the prior season." },
    emblem: { id: "climber_mark", name: "From Below", how: "Win a title after finishing 5th or worse the prior season." },
  },
  {
    pair: "loyalty", rarity: "gold",
    title: { id: "loyalty", name: "Loyalty", how: "Carry 90%+ of last year's core into a title-game lineup." },
    emblem: { id: "loyalty_mark", name: "Continuity", how: "Carry 90%+ of last year's core into a title-game lineup." },
  },
  {
    pair: "scorched", rarity: "silver",
    title: { id: "scorched", name: "Scorched Earth", how: "Win a title after turning over half the roster (new_share ≥ 55%)." },
    emblem: { id: "scorched_mark", name: "Full Reset", how: "Win a title after turning over half the roster (new_share ≥ 55%)." },
  },
  {
    pair: "pick_hoard", rarity: "silver",
    title: { id: "pick_hoard", name: "Pick Collector", how: "Hold four or more future first-round picks at once." },
    emblem: { id: "pick_hoard_mark", name: "Future Assets", how: "Hold four or more future first-round picks at once." },
  },
  {
    pair: "rookie_king", rarity: "gold",
    title: { id: "rookie_king", name: "Rookie Whisperer", how: "Lead the league in career rookie-draft surplus." },
    emblem: { id: "rookie_king_mark", name: "Draft Oracle", how: "Lead the league in career rookie-draft surplus." },
  },
  {
    pair: "cartel", rarity: "bronze",
    title: { id: "cartel", name: "Trade Cartel", how: "Trade with 7+ different partners on a single title path window." },
    emblem: { id: "cartel_mark", name: "Connected", how: "Trade with 7+ different partners on a single title path window." },
  },
  {
    pair: "wire_throne", rarity: "silver",
    title: { id: "wire_throne", name: "Wire Throne", how: "Post 12+ waiver adds in one title-path window." },
    emblem: { id: "wire_throne_mark", name: "Waiver Crown", how: "Post 12+ waiver adds in one title-path window." },
  },
  {
    pair: "pick_path", rarity: "bronze",
    title: { id: "pick_path", name: "Pick Path", how: "Run a pick-heavy window on the way to a title." },
    emblem: { id: "pick_path_mark", name: "Stockpile Run", how: "Run a pick-heavy window on the way to a title." },
  },
  {
    pair: "player_path", rarity: "bronze",
    title: { id: "player_path", name: "Player Path", how: "Run a player-heavy regular season on the way to a title." },
    emblem: { id: "player_path_mark", name: "Contender Run", how: "Run a player-heavy regular season on the way to a title." },
  },
  {
    pair: "aging", rarity: "silver",
    title: { id: "aging", name: "Aging Gracefully", how: "Lead the league in aging-grade mean (least decay)." },
    emblem: { id: "aging_mark", name: "Vintage", how: "Lead the league in aging-grade mean (least decay)." },
  },
  {
    pair: "farm_sold", rarity: "bronze",
    title: { id: "farm_sold", name: "Sold the Farm", how: "Lead the league in players sold for picks." },
    emblem: { id: "farm_sold_mark", name: "Liquidator", how: "Lead the league in players sold for picks." },
  },
  {
    pair: "inaugural", rarity: "gold",
    title: { id: "inaugural", name: "Inaugural Champion", how: "Win the league's first championship (2019)." },
    emblem: { id: "inaugural_mark", name: "First Crown", how: "Win the league's first championship (2019)." },
  },
  {
    pair: "perfect_chip", rarity: "gold",
    title: { id: "perfect_chip", name: "Perfect Chip", how: "Win the title 1st in points and by 25+ in the final." },
    emblem: { id: "perfect_chip_mark", name: "Clean Sweep", how: "Win the title 1st in points and by 25+ in the final." },
  },

  // —— Week score bands (locked 100–139; other bands still in design) ——
  {
    pair: "week_100", rarity: "bronze",
    title: { id: "week_100", name: "League Average", how: "Score 100–109 in a single week. Everyone has." },
    emblem: { id: "week_100_mark", name: "Beige", how: "Score 100–109 in a single week. Everyone has." },
  },
  {
    pair: "week_110", rarity: "bronze",
    title: { id: "week_110", name: "Slightly Above", how: "Score 110–119 in a single week." },
    emblem: { id: "week_110_mark", name: "Plus One", how: "Score 110–119 in a single week." },
  },
  {
    pair: "week_120", rarity: "silver",
    title: { id: "week_120", name: "Competent", how: "Score 120–129 in a single week." },
    emblem: { id: "week_120_mark", name: "Clipboard", how: "Score 120–129 in a single week." },
  },
  {
    pair: "week_130", rarity: "silver",
    title: { id: "week_130", name: "Getting Warm", how: "Score 130–139 in a single week." },
    emblem: { id: "week_130_mark", name: "Ember", how: "Score 130–139 in a single week." },
  },
];

const CATALOG = [];
const pairIds = {}; // pair -> { title, emblem }
for (const p of PAIRS) {
  if (!p.pair || !p.title || !p.emblem) throw new Error("pair needs pair/title/emblem");
  if (pairIds[p.pair]) throw new Error(`duplicate pair ${p.pair}`);
  pairIds[p.pair] = { title: p.title.id, emblem: p.emblem.id };
  CATALOG.push({
    id: p.title.id, kind: "title", name: p.title.name, how: p.title.how,
    rarity: p.rarity, pair: p.pair,
  });
  CATALOG.push({
    id: p.emblem.id, kind: "emblem", name: p.emblem.name, how: p.emblem.how,
    rarity: p.rarity, pair: p.pair,
  });
}

const idSet = new Set(CATALOG.map((c) => c.id));
if (idSet.size !== CATALOG.length) throw new Error("duplicate cosmetics ids");

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
  if (!idSet.has(id)) return;
  if (!unlocks[uid]) unlocks[uid] = {};
  if (!unlocks[uid][id]) unlocks[uid][id] = got;
}

/** Grant both cosmetics in a matched pair. */
function unlockPair(uid, pair, got) {
  const ids = pairIds[pair];
  if (!ids) return;
  addUnlock(uid, ids.title, got);
  addUnlock(uid, ids.emblem, got);
}

const champCount = {};
const finalistCount = {};
const finalistYears = {};
const champLatest = {};

for (const t of titles) {
  const uid = String(t.user_id || "");
  if (!uid) continue;
  champCount[uid] = (champCount[uid] || 0) + 1;
  if (!champLatest[uid]) champLatest[uid] = t;

  if (t.repeat === "repeat") unlockPair(uid, "repeat", receipt([t.season, "back-to-back"]));
  if (t.repeat === "three_peat") unlockPair(uid, "three_peat", receipt([t.season, "three in a row"]));
  if (t.record && t.record.fpts_rank === 1) {
    unlockPair(uid, "points_champ", receipt([t.season, "1st in points"]));
  }
  if (t.record && Number(t.record.fpts_rank) > 1) {
    unlockPair(uid, "bracket_thief", receipt([t.season, `won from ${nth(t.record.fpts_rank)} in points`]));
  }
  const n = t.title_lineup && t.title_lineup.n;
  const from = t.title_lineup && t.title_lineup.from_opening;
  if (n && from != null && from / n >= 0.85) {
    unlockPair(uid, "iron_core", receipt([t.season, `${from} of ${n} from opening`]));
  }
  if (from >= 11) unlockPair(uid, "opening_day", receipt([t.season, `${from} opening starters`]));
  if (t.record && t.record.sit >= 0.9) {
    unlockPair(uid, "sit_right", receipt([t.season, `sit ${Math.round(t.record.sit * 100)}%`]));
  }
  if (t.final && t.final.top_bench && t.final.top && t.final.top_bench.points > t.final.top.points) {
    unlockPair(uid, "bench_crime", receipt([
      t.season,
      `${t.final.top_bench.player} ${t.final.top_bench.points} on the pine`,
    ]));
  }
  const usedStartup = t.draft && t.draft.used && t.draft.used.some((u) => u.startup);
  if (usedStartup || (t.draft && t.draft.startup)) {
    unlockPair(uid, "founding_draft", receipt(["2019 startup", t.season + " title"]));
  }
  const mean = t.record && t.record.league_mean_trades;
  if (mean != null && t.record.trades < mean) {
    unlockPair(uid, "quiet_year", receipt([t.season, `${t.record.trades} trades vs ${mean} mean`]));
  }
  const play = t.windows && t.windows.playoffs;
  if (play && play.trades > 0) {
    unlockPair(uid, "playoff_trader", receipt([t.season, `${play.trades} playoff trades`]));
  }
  if (t.final && t.final.ok && t.final.opponent_user_id) {
    const opp = String(t.final.opponent_user_id);
    finalistCount[opp] = (finalistCount[opp] || 0) + 1;
    if (!finalistYears[opp]) finalistYears[opp] = [];
    finalistYears[opp].push(t.season);
    unlockPair(opp, "finalist", receipt([t.season, `lost to ${t.name}`]));
  }

  // —— New pair gates from title tape ——
  const margin = t.final && Number(t.final.margin);
  if (Number.isFinite(margin) && margin >= 40) {
    unlockPair(uid, "blowout", receipt([t.season, `won by ${Math.round(margin)}`]));
  }
  if (Number.isFinite(margin) && margin <= 10 && margin >= 0) {
    unlockPair(uid, "nailbiter", receipt([t.season, `won by ${margin}`]));
  }
  const priorPlace = t.prior && Number(t.prior.place);
  if (Number.isFinite(priorPlace) && priorPlace >= 5) {
    unlockPair(uid, "climber", receipt([t.season, `from ${nth(priorPlace)} prior`]));
  }
  const core = t.turnover && t.turnover.core_from_prev_end;
  if (core && core.n > 0 && (core.held / core.n) >= 0.9) {
    unlockPair(uid, "loyalty", receipt([t.season, `${core.held} of ${core.n} core held`]));
  }
  const turnEnd = t.turnover && t.turnover.vs_prev_end;
  if (turnEnd && turnEnd.new_share != null && turnEnd.new_share >= 0.55) {
    unlockPair(uid, "scorched", receipt([t.season, `${Math.round(turnEnd.new_share * 100)}% new`]));
  }
  for (const [wname, win] of Object.entries(t.windows || {})) {
    if (!win) continue;
    const partners = (win.partners && win.partners.length) || 0;
    if (partners >= 7) {
      unlockPair(uid, "cartel", receipt([t.season, wname, `${partners} partners`]));
    }
    if ((win.waiver_adds || 0) >= 12) {
      unlockPair(uid, "wire_throne", receipt([t.season, wname, `${win.waiver_adds} adds`]));
    }
    if (win.posture === "pick_heavy") {
      unlockPair(uid, "pick_path", receipt([t.season, wname, "pick-heavy"]));
    }
    if (wname === "regular" && win.posture === "player_heavy") {
      unlockPair(uid, "player_path", receipt([t.season, "player-heavy regular"]));
    }
  }
  if (String(t.season) === "2019") {
    unlockPair(uid, "inaugural", receipt(["2019", "first championship"]));
  }
  if (t.record && t.record.fpts_rank === 1 && Number.isFinite(margin) && margin >= 25) {
    unlockPair(uid, "perfect_chip", receipt([t.season, "1st in points", `+${Math.round(margin)}`]));
  }
}

// Championship career ladder: highest count rung replaces lower (pair unlocks both kinds).
for (const [uid, n] of Object.entries(champCount)) {
  if (n >= 5) unlockPair(uid, "five_time", receipt([`${n} titles`]));
  else if (n >= 4) unlockPair(uid, "four_time", receipt([`${n} titles`]));
  else if (n >= 3) unlockPair(uid, "three_time", receipt([`${n} titles`]));
  else if (n === 2) unlockPair(uid, "two_time", receipt([`${n} titles`]));
  else if (n === 1) {
    const t = champLatest[uid];
    unlockPair(uid, "champion", receipt([t && t.season, t && t.name].filter(Boolean)));
  }
}

for (const [uid, n] of Object.entries(finalistCount)) {
  const years = (finalistYears[uid] || []).slice().sort();
  if (n >= 3) unlockPair(uid, "three_time_finalist", receipt([`${n} championship games`, years.join(", ")]));
  if (n >= 2) unlockPair(uid, "two_time_finalist", receipt([`${n} championship games`, years.join(", ")]));
}

for (const m of members) {
  if (Number(m.place) === 10) {
    unlockPair(String(m.user_id), "last_place", receipt([m.place_season || "latest", m.name]));
  }
}

if (traders.length) {
  const byTwo = traders.slice().sort((a, b) => (b.two_way || 0) - (a.two_way || 0))[0];
  const byWhale = traders.slice().sort((a, b) => (b.even_per_trade || 0) - (a.even_per_trade || 0))[0];
  const byExt = traders.slice().sort((a, b) => (b.even_total || 0) - (a.even_total || 0))[0];
  const byPick = traders.slice().sort((a, b) => (b.pick_total || 0) - (a.pick_total || 0))[0];
  if (byTwo) unlockPair(String(byTwo.user_id), "volume", receipt([`${byTwo.two_way} two-way trades`]));
  if (byWhale) unlockPair(String(byWhale.user_id), "whale", receipt([`${Math.round(byWhale.even_per_trade)} per trade`]));
  if (byExt) unlockPair(String(byExt.user_id), "extractor", receipt([`${Math.round(byExt.even_total)} career even`]));
  if (byPick && (byPick.pick_total || 0) > 0) {
    unlockPair(String(byPick.user_id), "investor", receipt([`${Math.round(byPick.pick_total)} pick capital`]));
  }
  for (const tr of traders) {
    if (tr.style && tr.style.label === "Win-now") {
      unlockPair(String(tr.user_id), "win_now", receipt(["Win-now style"]));
    }
  }
}

function leadBy(scoreFn, pair, label) {
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
  if (bestUid) unlockPair(bestUid, pair, receipt([label, String(Math.round(best))]));
}

leadBy((s) => {
  const all = s.lens && s.lens.all;
  if (!all) return null;
  return (Number(all.extract) || 0) - (Number(all.farmed) || 0);
}, "manners", "extract minus farmed");
leadBy((s) => (s.draft && s.draft.mean != null ? Number(s.draft.mean) : null), "draft_hit", "draft surplus");
leadBy((s) => (s.aging && s.aging.mean != null ? Number(s.aging.mean) : null), "aging", "aging mean");
leadBy((s) => (s.sold_players != null ? Number(s.sold_players) : null), "farm_sold", "players sold");

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
  unlockPair(String(firstsUid), "firsts_merchant", receipt([`${bestFirsts} firsts moved`]));
}
if (waiverUid && bestWaiver > 0) {
  unlockPair(String(waiverUid), "waiver_touch", receipt([`${bestWaiver} waiver adds`]));
}

// Rookie draft surplus leader.
if (drafters.length) {
  const top = drafters.slice().sort((a, b) => (b.surplus || 0) - (a.surplus || 0))[0];
  if (top && top.user_id != null) {
    unlockPair(String(top.user_id), "rookie_king", receipt([`${Math.round(top.surplus)} surplus`]));
  }
}

// Future firsts still held (pick ledger).
const nameToUid = {};
for (const m of members) {
  if (m && m.name && m.user_id != null) nameToUid[m.name] = String(m.user_id);
}
const futureFirsts = {};
for (const [key, row] of Object.entries(picksBook || {})) {
  if (!row || typeof row !== "object") continue;
  if (!String(key).startsWith("pick:")) continue;
  const parts = String(key).split(":");
  if (parts.length < 3 || parts[2] !== "1") continue;
  if (!row.still_pick) continue;
  const hops = row.hops || [];
  const ownerName = hops.length ? hops[hops.length - 1].to : null;
  const uid = ownerName && nameToUid[ownerName];
  if (!uid) continue;
  futureFirsts[uid] = (futureFirsts[uid] || 0) + 1;
}
for (const [uid, n] of Object.entries(futureFirsts)) {
  if (n >= 4) unlockPair(uid, "pick_hoard", receipt([`${n} future firsts`]));
}

// League Average is the vanilla week. The room already said everyone has had one.
for (const m of members) {
  if (m && m.user_id) unlockPair(String(m.user_id), "week_100", "everyone has had this week");
}

const ladderIds = CATALOG.filter((c) => c.kind === "title").map((c) => c.id).slice(0, TITLE_LADDER.length);
if (ladderIds.join() !== TITLE_LADDER.join()) {
  throw new Error(`cosmetics catalog must lead with ${TITLE_LADDER.join(" → ")}`);
}

const book = {
  v: 1,
  as_of: titlesBook.as_of || new Date().toISOString().slice(0, 10),
  catalog: CATALOG,
  unlocks,
};

writeUi("cosmetics.json", book);
const nTitle = CATALOG.filter((c) => c.kind === "title").length;
const nEmblem = CATALOG.filter((c) => c.kind === "emblem").length;
const nUnlock = Object.values(unlocks).reduce((a, m) => a + Object.keys(m).length, 0);
const nPairs = Object.keys(pairIds).length;
console.log(`cosmetics.json ${CATALOG.length} catalog (${nTitle} titles / ${nEmblem} emblems / ${nPairs} pairs), ${nUnlock} unlocks`);
