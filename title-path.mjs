#!/usr/bin/env node
/** Champions path. Official Sleeper GETs. Does not touch the trade needle. */
import fs from "node:fs";
import { DATA, readJson, setLeagueId, sleeperGet, writeUi, ymd, roundName } from "./lib.mjs";

const LEAGUE_ID = setLeagueId(process.argv[2] || process.env.LEAGUE_ID);
const KICKOFF = {
  2019: "2019-09-05",
  2020: "2020-09-10",
  2021: "2021-09-09",
  2022: "2022-09-08",
  2023: "2023-09-07",
  2024: "2024-09-05",
  2025: "2025-09-04",
  2026: "2026-09-10",
};

async function walkLeagues(startId) {
  const leagues = [];
  let id = startId;
  const seen = new Set();
  while (id && id !== "0" && !seen.has(id)) {
    seen.add(id);
    const league = await sleeperGet(`/league/${id}`);
    if (!league) break;
    leagues.push(league);
    id = league.previous_league_id;
  }
  return leagues;
}

async function txsForWeek(leagueId, week) {
  const cachePath = `${DATA}/tx_cache/${leagueId}-${week}.json`;
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  }
  const txs = await sleeperGet(`/league/${leagueId}/transactions/${week}`);
  fs.mkdirSync(`${DATA}/tx_cache`, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(txs ?? []));
  return txs;
}

async function loadPlayers() {
  const cache = `${DATA}/players.nfl.json`;
  if (fs.existsSync(cache)) {
    const age = Date.now() - fs.statSync(cache).mtimeMs;
    if (age < 24 * 60 * 60 * 1000) {
      return JSON.parse(fs.readFileSync(cache, "utf8"));
    }
  }
  const players = await sleeperGet("/players/nfl");
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(players));
  return players;
}

function playerName(players, id) {
  const p = players[id];
  if (!p) return `player:${id}`;
  const name = p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
  return name || `player:${id}`;
}

function pickLabel(p) {
  return `${p.season} ${roundName(p.round)}`;
}

function fptsOf(settings) {
  const s = settings || {};
  return (s.fpts || 0) + (s.fpts_decimal || 0) / 100;
}

function pptsOf(settings) {
  const s = settings || {};
  return (s.ppts || 0) + (s.ppts_decimal || 0) / 100;
}

function placesFromBracket(wb) {
  const place = {};
  for (const row of wb || []) {
    if (row.p && row.w) {
      place[row.w] = row.p;
      if (row.p === 1 && row.l) place[row.l] = 2;
      else if (row.p === 3 && row.l) place[row.l] = 4;
      else if (row.p === 5 && row.l) place[row.l] = 6;
    }
  }
  return place;
}

/**
 * One row per roster for a season: who they are and the regular-season record the standings
 * are then ordered by. Split out of standingsFor so that the championship final can name the
 * runner-up's record from the same derivation the standings use, rather than reading
 * `settings` a second time and risking a card that disagrees with the table beside it.
 */
function recordRowsFor(s, nameByUser) {
  return s.rosters.map((r) => {
    const uid = s.owner[r.roster_id] || null;
    const st = r.settings || {};
    return {
      roster_id: r.roster_id,
      user_id: uid,
      name: (uid && (nameByUser[uid] || s.names[uid])) || `roster ${r.roster_id}`,
      wins: st.wins || 0,
      losses: st.losses || 0,
      ties: st.ties || 0,
      fpts: fptsOf(st),
    };
  });
}

/**
 * Final 1..N for one completed season. Two sources, in this order:
 *
 *   1. **The winners bracket.** Its placement games carry `p` — 1 settles 1st and 2nd, 3 settles
 *      3rd and 4th, 5 settles 5th and 6th. That is the season's own answer and it wins even when
 *      a placed team's record was worse than an unplaced team's.
 *   2. **Regular-season record**, for everyone the bracket does not place. Standings points
 *      (`wins * 2 + ties`) first, then points for, then `roster_id` as a deterministic last
 *      resort so two identical teams cannot swap between builds.
 *
 * The **losers bracket is deliberately not read.** Its `p` is a place inside the consolation
 * round rather than a league place, the direction of that mapping is a league setting Sleeper
 * does not expose here, and this league's 2025 consolation rows carry `t2_original`
 * substitutions. Reading it would be a guess; regular-season order is a stated rule.
 *
 * A season with no bracket at all degrades to pure record order and every row says so in `from`,
 * rather than inventing playoff results.
 */
function standingsFor(s, nameByUser) {
  const placed = placesFromBracket(s.wb);
  const fromBracket = [];
  const fromRecord = [];
  for (const row of recordRowsFor(s, nameByUser)) {
    if (placed[row.roster_id]) {
      row.place = placed[row.roster_id];
      row.from = "bracket";
      fromBracket.push(row);
    } else {
      row.from = "record";
      fromRecord.push(row);
    }
  }
  fromBracket.sort((a, b) => a.place - b.place);
  // The bracket must hand back 1..k with no gaps and no repeats, or it is not the shape we read.
  fromBracket.forEach((r, i) => {
    if (r.place !== i + 1) {
      throw new Error(`standings ${s.season}: bracket gave place ${r.place} at slot ${i + 1}`);
    }
  });
  const pts = (r) => r.wins * 2 + r.ties;
  fromRecord.sort((a, b) => (pts(b) - pts(a)) || (b.fpts - a.fpts) || (a.roster_id - b.roster_id));
  fromRecord.forEach((r, i) => { r.place = fromBracket.length + i + 1; });
  return fromBracket.concat(fromRecord);
}

/**
 * The championship game itself: who the champion beat, the final score, and the
 * champion's top scorer in that game. The bracket row with p === 1 is the title match;
 * its round maps onto a week via playoff_week_start, and that week's matchup carries
 * points and players_points. Returns { ok: false, reason } when a season cannot supply it
 * rather than guessing.
 */
function championshipFinal(s, rid, players, nameByUser) {
  const row = (s.wb || []).find((r) => r.p === 1);
  if (!row || row.w == null) return { ok: false, reason: "no_final_in_bracket" };
  if (row.w !== rid) return { ok: false, reason: "final_winner_is_not_champion" };
  if (row.l == null) return { ok: false, reason: "final_has_no_recorded_loser" };
  const round = Number(row.r);
  if (!round) return { ok: false, reason: "final_has_no_round" };
  if (!s.pws) return { ok: false, reason: "no_playoff_week_start" };
  const week = s.pws + (round - 1);
  const mus = s.weeks[week];
  if (!mus || !mus.length) return { ok: false, reason: `no_matchups_for_week_${week}` };
  const mine = mus.find((m) => m.roster_id === rid);
  const theirs = mus.find((m) => m.roster_id === row.l);
  if (!mine || !theirs) return { ok: false, reason: `roster_absent_from_week_${week}` };
  if (mine.points == null || theirs.points == null) return { ok: false, reason: "week_has_no_points" };

  const pp = mine.players_points || {};
  const starters = (mine.starters || []).filter((id) => id && id !== "0");
  let top = null;
  for (const pid of starters) {
    const pts = pp[pid];
    if (pts == null) continue;
    if (!top || pts > top.points) {
      top = { player_id: String(pid), player: playerName(players, pid), points: money(pts) };
    }
  }
  let topBench = null;
  const started = new Set(starters.map(String));
  for (const [pid, pts] of Object.entries(pp)) {
    if (started.has(String(pid)) || pts == null) continue;
    if (!topBench || pts > topBench.points) {
      topBench = { player_id: String(pid), player: playerName(players, pid), points: money(pts) };
    }
  }
  if (topBench && top && topBench.points <= top.points) topBench = null;

  const uid = s.owner[row.l];
  const champPoints = money(mine.points);
  const oppPoints = money(theirs.points);
  // The runner-up's regular-season record, off the same rows the standings are built from.
  // The card puts it opposite the champion's own record, so the two have to be the same
  // quantity from the same place -- a second read of `settings` here is how they drift.
  const oppRow = recordRowsFor(s, nameByUser).find((r) => r.roster_id === row.l) || null;
  return {
    ok: true,
    week,
    round,
    paired: mine.matchup_id != null && mine.matchup_id === theirs.matchup_id,
    opponent: nameByUser[uid] || s.names[uid] || `roster ${row.l}`,
    opponent_user_id: uid || null,
    opponent_roster_id: row.l,
    opponent_record: oppRow ? { wins: oppRow.wins, losses: oppRow.losses, ties: oppRow.ties } : null,
    champ_points: champPoints,
    opponent_points: oppPoints,
    margin: money(champPoints - oppPoints),
    tie: champPoints === oppPoints,
    top,
    top_bench: topBench,
  };
}

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function overlap(now, then) {
  if (!now || !then || !then.size) {
    return { kept: 0, now: now ? now.size : 0, then: then ? then.size : 0, retention: null, new_share: null };
  }
  const kept = [...now].filter((id) => then.has(id)).length;
  return {
    kept,
    now: now.size,
    then: then.size,
    retention: kept / then.size,
    new_share: now.size ? (now.size - kept) / now.size : null,
  };
}

function emptyChapter() {
  return {
    trades: 0,
    league_mean_trades: null,
    players_in: 0,
    players_out: 0,
    picks_in: [],
    picks_out: [],
    firsts_in: 0,
    firsts_out: 0,
    posture: "none",
    waiver_adds: 0,
    fa_adds: 0,
    drops: 0,
    partners: [],
    big: [],
  };
}

function postureOf(chapter) {
  const pin = chapter.players_in;
  const pout = chapter.players_out;
  const kin = chapter.picks_in.length;
  const kout = chapter.picks_out.length;
  if (!chapter.trades) return "none";
  const playerNet = pin - pout;
  const pickNet = kin - kout;
  if (playerNet >= 2 && playerNet > pickNet) return "player_heavy";
  if (pickNet >= 2 && pickNet > playerNet) return "pick_heavy";
  if (chapter.firsts_out >= 1 && chapter.firsts_in === 0 && pin >= 1) return "player_heavy";
  if (chapter.firsts_in >= 1 && chapter.firsts_out === 0 && pout >= 1) return "pick_heavy";
  return "swap";
}

function postureLabel(p) {
  if (p === "player_heavy") return "Bought players";
  if (p === "pick_heavy") return "Bought picks";
  if (p === "swap") return "Swapped";
  return "No trades";
}

function pct(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

async function loadSeason(league, players) {
  const season = String(league.season);
  const users = (await sleeperGet(`/league/${league.league_id}/users`)) || [];
  const rosters = (await sleeperGet(`/league/${league.league_id}/rosters`)) || [];
  const names = Object.fromEntries(users.map((u) => [u.user_id, u.display_name || u.user_id]));
  const owner = Object.fromEntries(rosters.map((r) => [r.roster_id, r.owner_id]));
  const wb = (await sleeperGet(`/league/${league.league_id}/winners_bracket`)) || [];
  const last = league.settings?.last_scored_leg || (league.status === "complete" ? 17 : 0);
  const pws = league.settings?.playoff_week_start || 15;

  const txs = [];
  for (let week = 0; week <= last; week++) {
    const batch = (await txsForWeek(league.league_id, week)) || [];
    for (const t of batch) {
      t._week_bucket = week;
      txs.push(t);
    }
  }

  const drafts = [];
  const draftList = (await sleeperGet(`/league/${league.league_id}/drafts`)) || [];
  for (const d of draftList) {
    if (d.status !== "complete" && d.status !== "drafting") continue;
    const picks = (await sleeperGet(`/draft/${d.draft_id}/picks`)) || [];
    drafts.push({ draft: d, picks });
  }

  const weeks = {};
  for (let week = 1; week <= last; week++) {
    weeks[week] = (await sleeperGet(`/league/${league.league_id}/matchups/${week}`)) || [];
  }

  const scored = rosters
    .slice()
    .sort((a, b) => fptsOf(b.settings) - fptsOf(a.settings));
  const fptsRank = Object.fromEntries(scored.map((r, i) => [r.roster_id, i + 1]));
  const tradeCounts = {};
  for (const t of txs) {
    if (t.type !== "trade" || t.status !== "complete") continue;
    for (const rid of new Set(t.roster_ids || [])) {
      tradeCounts[rid] = (tradeCounts[rid] || 0) + 1;
    }
  }
  const tradeVals = rosters.map((r) => tradeCounts[r.roster_id] || 0);
  const leagueMeanTrades = tradeVals.length
    ? tradeVals.reduce((a, b) => a + b, 0) / tradeVals.length
    : 0;

  return {
    league,
    season,
    names,
    owner,
    rosters,
    wb,
    places: placesFromBracket(wb),
    last,
    pws,
    txs,
    drafts,
    weeks,
    fptsRank,
    tradeCounts,
    leagueMeanTrades,
    players,
  };
}

function rosterSet(weeks, week, rosterId) {
  const mu = (weeks[week] || []).find((m) => m.roster_id === rosterId);
  return new Set((mu?.players || []).filter((id) => id && id !== "0"));
}

function starterList(weeks, week, rosterId) {
  const mu = (weeks[week] || []).find((m) => m.roster_id === rosterId);
  return (mu?.starters || []).filter((id) => id && id !== "0");
}

function classifyTx(season, t, kickoff, pws) {
  const created = t.created ? ymd(t.created) : null;
  const week = t.leg != null ? t.leg : t._week_bucket;
  if (created && created < kickoff) return "offseason";
  if (week >= pws) return "playoffs";
  return "regular";
}

function fillChapter(s, rosterId, windowName, players, nameByUser) {
  const chapter = emptyChapter();
  const kickoff = KICKOFF[s.season];
  const mine = rosterId;
  const partnerHits = {};
  if (windowName === "previous") {
    chapter.league_mean_trades = s.leagueMeanTrades;
  }
  if (windowName === "regular" || windowName === "playoffs") {
    chapter.league_mean_trades = s.leagueMeanTrades;
  }

  for (const t of s.txs) {
    if (t.status !== "complete") continue;
    if (!(t.roster_ids || []).includes(mine)) continue;
    const win = classifyTx(s.season, t, kickoff, s.pws);
    if (windowName === "previous") {
      /* previous uses the prior season object; every tx on that league counts */
    } else if (win !== windowName) {
      continue;
    } else if (windowName === "previous") {
      continue;
    }

    if (windowName !== "previous" && win !== windowName) continue;
    if (windowName === "previous" && classifyTx(s.season, t, KICKOFF[s.season], s.pws) === "offseason") {
      /* leftover offseason on an old league after kickoff of next year should not happen */
    }

    if (t.type === "trade") {
      chapter.trades += 1;
      const adds = t.adds || {};
      const drops = t.drops || {};
      for (const [pid, toR] of Object.entries(adds)) {
        if (toR === mine) chapter.players_in += 1;
      }
      for (const [pid, fromR] of Object.entries(drops)) {
        if (fromR === mine) chapter.players_out += 1;
      }
      for (const p of t.draft_picks || []) {
        const label = pickLabel(p);
        if (p.owner_id === mine) {
          chapter.picks_in.push(label);
          if (Number(p.round) === 1) chapter.firsts_in += 1;
        }
        if (p.previous_owner_id === mine) {
          chapter.picks_out.push(label);
          if (Number(p.round) === 1) chapter.firsts_out += 1;
        }
      }
      const others = (t.roster_ids || []).filter((r) => r !== mine);
      for (const rid of others) {
        const uid = s.owner[rid];
        const nm = nameByUser[uid] || uid || `roster ${rid}`;
        partnerHits[nm] = (partnerHits[nm] || 0) + 1;
      }
      const gotPlayers = Object.entries(adds)
        .filter(([, toR]) => toR === mine)
        .map(([pid]) => playerName(players, pid));
      const sentPlayers = Object.entries(drops)
        .filter(([, fromR]) => fromR === mine)
        .map(([pid]) => playerName(players, pid));
      const gotPicks = (t.draft_picks || []).filter((p) => p.owner_id === mine).map(pickLabel);
      const sentPicks = (t.draft_picks || []).filter((p) => p.previous_owner_id === mine).map(pickLabel);
      const firsts = (t.draft_picks || []).filter((p) => Number(p.round) === 1).length;
      const big = firsts > 0 || gotPlayers.length + sentPlayers.length >= 3;
      if (big) {
        chapter.big.push({
          date: t.created ? ymd(t.created) : null,
          partners: others.map((r) => nameByUser[s.owner[r]] || s.owner[r]),
          got: gotPlayers.concat(gotPicks),
          sent: sentPlayers.concat(sentPicks),
          firsts,
        });
      }
    } else if (t.type === "waiver") {
      const adds = t.adds || {};
      const drops = t.drops || {};
      for (const [, toR] of Object.entries(adds)) {
        if (toR === mine) chapter.waiver_adds += 1;
      }
      for (const [, fromR] of Object.entries(drops)) {
        if (fromR === mine) chapter.drops += 1;
      }
    } else if (t.type === "free_agent") {
      const adds = t.adds || {};
      const drops = t.drops || {};
      for (const [, toR] of Object.entries(adds)) {
        if (toR === mine) chapter.fa_adds += 1;
      }
      for (const [, fromR] of Object.entries(drops)) {
        if (fromR === mine) chapter.drops += 1;
      }
    }
  }

  chapter.posture = postureOf(chapter);
  chapter.partners = Object.entries(partnerHits)
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);
  return chapter;
}

function previousChapter(prevSeason, rosterId, players, nameByUser) {
  if (!prevSeason || rosterId == null) return null;
  const chapter = emptyChapter();
  chapter.league_mean_trades = prevSeason.leagueMeanTrades;
  const mine = rosterId;
  const partnerHits = {};
  for (const t of prevSeason.txs) {
    if (t.status !== "complete") continue;
    if (!(t.roster_ids || []).includes(mine)) continue;
    if (t.type === "trade") {
      chapter.trades += 1;
      const adds = t.adds || {};
      const drops = t.drops || {};
      for (const [, toR] of Object.entries(adds)) {
        if (toR === mine) chapter.players_in += 1;
      }
      for (const [, fromR] of Object.entries(drops)) {
        if (fromR === mine) chapter.players_out += 1;
      }
      for (const p of t.draft_picks || []) {
        const label = pickLabel(p);
        if (p.owner_id === mine) {
          chapter.picks_in.push(label);
          if (Number(p.round) === 1) chapter.firsts_in += 1;
        }
        if (p.previous_owner_id === mine) {
          chapter.picks_out.push(label);
          if (Number(p.round) === 1) chapter.firsts_out += 1;
        }
      }
      const others = (t.roster_ids || []).filter((r) => r !== mine);
      for (const rid of others) {
        const uid = prevSeason.owner[rid];
        const nm = nameByUser[uid] || uid || `roster ${rid}`;
        partnerHits[nm] = (partnerHits[nm] || 0) + 1;
      }
      const gotPlayers = Object.entries(adds)
        .filter(([, toR]) => toR === mine)
        .map(([pid]) => playerName(players, pid));
      const sentPlayers = Object.entries(drops)
        .filter(([, fromR]) => fromR === mine)
        .map(([pid]) => playerName(players, pid));
      const gotPicks = (t.draft_picks || []).filter((p) => p.owner_id === mine).map(pickLabel);
      const sentPicks = (t.draft_picks || []).filter((p) => p.previous_owner_id === mine).map(pickLabel);
      const firsts = (t.draft_picks || []).filter((p) => Number(p.round) === 1).length;
      if (firsts > 0 || gotPlayers.length + sentPlayers.length >= 3) {
        chapter.big.push({
          date: t.created ? ymd(t.created) : null,
          partners: others.map((r) => nameByUser[prevSeason.owner[r]] || prevSeason.owner[r]),
          got: gotPlayers.concat(gotPicks),
          sent: sentPlayers.concat(sentPicks),
          firsts,
        });
      }
    } else if (t.type === "waiver") {
      for (const [, toR] of Object.entries(t.adds || {})) {
        if (toR === mine) chapter.waiver_adds += 1;
      }
      for (const [, fromR] of Object.entries(t.drops || {})) {
        if (fromR === mine) chapter.drops += 1;
      }
    } else if (t.type === "free_agent") {
      for (const [, toR] of Object.entries(t.adds || {})) {
        if (toR === mine) chapter.fa_adds += 1;
      }
      for (const [, fromR] of Object.entries(t.drops || {})) {
        if (fromR === mine) chapter.drops += 1;
      }
    }
  }
  chapter.posture = postureOf(chapter);
  chapter.partners = Object.entries(partnerHits)
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);
  return chapter;
}

function originOf(pid, ctx) {
  if (ctx.drafted.has(pid)) return "drafted";
  if (ctx.traded.has(pid)) return "trade";
  if (ctx.waivered.has(pid)) return "waiver";
  if (ctx.fa.has(pid)) return "fa";
  if (ctx.prevEnd.has(pid)) return "held";
  if (ctx.opening.has(pid)) return "opening";
  return "unknown";
}

function nth(n) {
  const v = Number(n);
  if (!v) return String(n);
  const m = v % 100;
  if (m >= 11 && m <= 13) return v + "th";
  const s = { 1: "st", 2: "nd", 3: "rd" }[v % 10] || "th";
  return v + s;
}

function thesisOf(row) {
  const bits = [];
  if (row.record.fpts_rank === 1) bits.push("Won the points race.");
  else if (row.record.fpts_rank >= 3) bits.push(`Won the bracket from ${nth(row.record.fpts_rank)} in points.`);
  else bits.push(`Finished ${nth(row.record.fpts_rank)} in points.`);

  if (row.repeat === "three_peat") bits.push("Three-peat.");
  else if (row.repeat === "repeat") bits.push("Repeat champion.");
  else if (row.prior && row.prior.place && row.prior.place > 4) bits.push(`Leapt from ${row.prior.place}th the year before.`);
  else if (row.prior && !row.prior.place && row.prior.fpts_rank >= 7) bits.push("Leapt from outside the playoff picture.");

  const ret = row.turnover?.vs_prev_end?.retention;
  if (ret != null && ret >= 0.7) bits.push("Held the core — not a rebuild.");
  else if (ret != null && ret < 0.5) bits.push("Heavy roster turnover from last year's finale.");

  const titleTrades = (row.windows.regular?.trades || 0) + (row.windows.playoffs?.trades || 0);
  const mean = row.windows.regular?.league_mean_trades;
  if (mean != null && titleTrades > mean * 1.25) bits.push("High-velocity desk on the title year.");
  else if (mean != null && titleTrades < mean * 0.75) bits.push("Quiet trade year.");

  if ((row.windows.playoffs?.trades || 0) >= 2) bits.push("Moved during the playoff run.");
  if ((row.draft?.used || []).length <= 1 && !row.draft?.startup) bits.push("Almost no rookie capital.");
  if (row.title_lineup && row.title_lineup.n) {
    bits.push(`${row.title_lineup.from_opening} of ${row.title_lineup.n} title starters were on the opening roster.`);
  }
  return bits.join(" ");
}

async function main() {
  const overrides = readJson("aliases.overrides.json", {}) || {};
  const players = await loadPlayers();
  const leagues = await walkLeagues(LEAGUE_ID);
  const seasons = {};
  for (const league of leagues) {
    seasons[String(league.season)] = await loadSeason(league, players);
  }

  const nameByUser = {};
  for (const s of Object.values(seasons)) {
    for (const [uid, raw] of Object.entries(s.names)) {
      nameByUser[uid] = overrides[uid] || raw;
    }
  }

  const titles = [];
  const years = Object.keys(seasons).map(Number).sort((a, b) => b - a);

  for (const year of years) {
    const s = seasons[String(year)];
    if (s.league.status !== "complete") continue;
    const champRow = (s.wb || []).find((r) => r.p === 1);
    if (!champRow || champRow.w == null) continue;
    const rid = champRow.w;
    const uid = s.owner[rid];
    const name = nameByUser[uid] || s.names[uid] || String(uid);
    const ros = s.rosters.find((r) => r.roster_id === rid);
    const st = ros?.settings || {};
    const fpts = fptsOf(st);
    const ppts = pptsOf(st);
    const prev = seasons[String(year - 1)];
    let prevRid = null;
    if (prev) {
      const hit = prev.rosters.find((r) => r.owner_id === uid);
      prevRid = hit ? hit.roster_id : null;
    }

    const opening = rosterSet(s.weeks, 1, rid);
    const openingStarters = starterList(s.weeks, 1, rid);
    const titleStarters = s.last ? starterList(s.weeks, s.last, rid) : [];
    const prevEnd = prev && prevRid != null && prev.last
      ? rosterSet(prev.weeks, prev.last, prevRid)
      : new Set();
    const prevOpen = prev && prevRid != null ? rosterSet(prev.weeks, 1, prevRid) : new Set();

    const drafted = new Set();
    const used = [];
    let startup = false;
    for (const { draft, picks } of s.drafts) {
      const rounds = draft.settings?.rounds ?? 0;
      if (rounds >= 20) startup = true;
      for (const p of picks) {
        if (!p.player_id) continue;
        if (p.roster_id !== rid) continue;
        drafted.add(String(p.player_id));
        used.push({
          player_id: String(p.player_id),
          player: playerName(players, p.player_id),
          round: p.round,
          pick_no: p.pick_no,
          startup: rounds >= 20,
        });
      }
    }

    const traded = new Set();
    const waivered = new Set();
    const fa = new Set();
    const kickoff = KICKOFF[s.season];
    for (const t of s.txs) {
      if (t.status !== "complete") continue;
      if (!(t.roster_ids || []).includes(rid)) continue;
      const win = classifyTx(s.season, t, kickoff, s.pws);
      if (win === "offseason") continue;
      if (t.type === "trade") {
        for (const [pid, toR] of Object.entries(t.adds || {})) {
          if (toR === rid) traded.add(String(pid));
        }
      } else if (t.type === "waiver") {
        for (const [pid, toR] of Object.entries(t.adds || {})) {
          if (toR === rid) waivered.add(String(pid));
        }
      } else if (t.type === "free_agent") {
        for (const [pid, toR] of Object.entries(t.adds || {})) {
          if (toR === rid) fa.add(String(pid));
        }
      }
    }
    for (const t of s.txs) {
      if (t.status !== "complete" || t.type !== "trade") continue;
      if (!(t.roster_ids || []).includes(rid)) continue;
      if (classifyTx(s.season, t, kickoff, s.pws) !== "offseason") continue;
      for (const [pid, toR] of Object.entries(t.adds || {})) {
        if (toR === rid) traded.add(String(pid));
      }
    }

    const originCtx = { drafted, traded, waivered, fa, prevEnd, opening };
    const lineup = titleStarters.map((pid) => ({
      player_id: pid,
      player: playerName(players, pid),
      origin: originOf(pid, originCtx),
    }));

    let prior = null;
    if (prev && prevRid != null) {
      const pr = prev.rosters.find((r) => r.roster_id === prevRid);
      const pst = pr?.settings || {};
      prior = {
        season: prev.season,
        place: prev.places[prevRid] || null,
        fpts_rank: prev.fptsRank[prevRid] || null,
        wins: pst.wins || 0,
        losses: pst.losses || 0,
        fpts: fptsOf(pst),
      };
    }

    let repeat = null;
    const y1 = seasons[String(year - 1)];
    const y2 = seasons[String(year - 2)];
    const won = (ss) => {
      if (!ss) return false;
      const row = (ss.wb || []).find((r) => r.p === 1);
      return row && ss.owner[row.w] === uid;
    };
    if (won(y1) && won(y2)) repeat = "three_peat";
    else if (won(y1)) repeat = "repeat";

    const windows = {
      previous: previousChapter(prev, prevRid, players, nameByUser),
      offseason: fillChapter(s, rid, "offseason", players, nameByUser),
      regular: fillChapter(s, rid, "regular", players, nameByUser),
      playoffs: fillChapter(s, rid, "playoffs", players, nameByUser),
    };

    const coreNow = new Set(openingStarters);
    const finalGame = championshipFinal(s, rid, players, nameByUser);
    const row = {
      season: s.season,
      user_id: uid,
      name,
      roster_id: rid,
      record: {
        wins: st.wins || 0,
        losses: st.losses || 0,
        ties: st.ties || 0,
        fpts,
        ppts,
        sit: ppts ? fpts / ppts : null,
        fpts_rank: s.fptsRank[rid],
        teams: s.rosters.length,
        trades: s.tradeCounts[rid] || 0,
        league_mean_trades: s.leagueMeanTrades,
      },
      place: 1,
      final: finalGame.ok ? finalGame : null,
      final_missing: finalGame.ok ? null : finalGame.reason,
      prior,
      repeat,
      draft: { used, startup },
      opening: { n: opening.size, starters: openingStarters.length },
      title_lineup: {
        n: lineup.length,
        from_opening: lineup.filter((p) => opening.has(p.player_id)).length,
        starters: lineup,
      },
      turnover: {
        vs_prev_end: overlap(opening, prevEnd),
        vs_prev_opening: overlap(opening, prevOpen),
        core_from_prev_end: {
          held: [...coreNow].filter((id) => prevEnd.has(id)).length,
          n: coreNow.size,
        },
      },
      windows,
    };
    row.thesis = thesisOf(row);
    titles.push(row);
  }

  titles.sort((a, b) => String(b.season).localeCompare(String(a.season)));

  const expected = {
    2025: "SF69erss",
    2024: "SF69erss",
    2023: "TedCumberbatch",
    2022: "ChiefGumby",
    2021: "ARae",
    2020: "ARae",
    2019: "ARae",
  };
  const byYear = Object.fromEntries(titles.map((t) => [t.season, t.name]));
  for (const [y, n] of Object.entries(expected)) {
    if (byYear[y] !== n) throw new Error(`self-check: ${y} champ ${byYear[y]} ≠ ${n}`);
  }
  const t19 = titles.find((t) => t.season === "2019");
  if (t19.windows.previous) throw new Error("self-check: 2019 has no previous season");
  if (t19.draft.used.length !== 28) throw new Error("self-check: 2019 startup is 28 picks");
  const t24 = titles.find((t) => t.season === "2024");
  if (t24.title_lineup.from_opening > t24.title_lineup.n) {
    throw new Error("self-check: from_opening overflow");
  }
  if (titles.length !== 7) throw new Error(`self-check: expected 7 titles, got ${titles.length}`);

  for (const t of titles) {
    const f = t.final;
    if (!f) continue;
    if (f.champ_points < f.opponent_points) {
      throw new Error(`self-check: ${t.season} champion lost the final ${f.champ_points}-${f.opponent_points}`);
    }
    if (!f.paired) throw new Error(`self-check: ${t.season} final pair has no shared matchup_id`);
    if (f.opponent_user_id === t.user_id) throw new Error(`self-check: ${t.season} beat themselves`);
    if (f.top && f.top.points > f.champ_points) {
      throw new Error(`self-check: ${t.season} top starter outscored the team total`);
    }
    // The card prints this beside the champion's own record, so an absent or nonsense one
    // would render as a blank half of a row rather than fail here.
    const orec = f.opponent_record;
    if (!orec) throw new Error(`self-check: ${t.season} final has no opponent_record`);
    if (orec.wins + orec.losses + orec.ties !== t.record.wins + t.record.losses + t.record.ties) {
      throw new Error(`self-check: ${t.season} runner-up played ${orec.wins}-${orec.losses}-${orec.ties},`
        + ` a different number of games than the champion's ${t.record.wins}-${t.record.losses}-${t.record.ties}`);
    }
  }
  const f25 = titles.find((t) => t.season === "2025").final;
  if (!f25 || f25.opponent !== "TipsUp" || f25.champ_points !== 189.98 || f25.opponent_points !== 162.82) {
    throw new Error(`self-check: 2025 final ${JSON.stringify(f25)}`);
  }
  // 2025's runner-up matched the champion at 11-3-0. Both cards reading 11–3 is the data,
  // not a copy-paste, and this is what says so out loud.
  if (f25.opponent_record.wins !== 11 || f25.opponent_record.losses !== 3 || f25.opponent_record.ties !== 0) {
    throw new Error(`self-check: 2025 TipsUp record ${JSON.stringify(f25.opponent_record)}, expected 11-3-0`);
  }
  if (f25.top.player !== "Derrick Henry" || f25.top.points !== 45.6) {
    throw new Error(`self-check: 2025 top starter ${JSON.stringify(f25.top)}`);
  }

  // The seat picker lists managers in last season's finishing order, so that order has to be
  // derived here: this is the only script that walks previous_league_id, and re-walking it
  // somewhere else would be a second traversal that could disagree with this one. `titles` is
  // sorted newest first and only holds completed seasons, so titles[0] is the season to use —
  // 2026 slots in on its own the first time it completes, with no code change.
  const lastSeason = titles[0].season;
  const standings = standingsFor(seasons[lastSeason], nameByUser);
  const places = standings.map((r) => r.place);
  if (new Set(places).size !== places.length) throw new Error(`standings ${lastSeason}: duplicate place`);
  if (places.some((p, i) => p !== i + 1)) throw new Error(`standings ${lastSeason}: places are not 1..n`);
  if (standings[0].user_id !== titles[0].user_id) {
    throw new Error(`self-check: ${lastSeason} first place ${standings[0].name} is not the champion ${titles[0].name}`);
  }
  if (standings[0].from !== "bracket") {
    throw new Error(`self-check: ${lastSeason} first place came from ${standings[0].from}, not the bracket`);
  }
  // The runner-up's record reaches the card through final.opponent_record. Assert it is the
  // same row this table's second place is built from, so the card and the standings cannot
  // print two different records for one team.
  const runnerUp = standings[1];
  const lastFinal = titles[0].final;
  if (lastFinal && runnerUp) {
    if (runnerUp.roster_id !== lastFinal.opponent_roster_id) {
      throw new Error(`self-check: ${lastSeason} second place is roster ${runnerUp.roster_id},`
        + ` but the final was lost by roster ${lastFinal.opponent_roster_id}`);
    }
    const o = lastFinal.opponent_record;
    if (o.wins !== runnerUp.wins || o.losses !== runnerUp.losses || o.ties !== runnerUp.ties) {
      throw new Error(`self-check: ${lastSeason} opponent_record ${o.wins}-${o.losses}-${o.ties}`
        + ` disagrees with standings ${runnerUp.wins}-${runnerUp.losses}-${runnerUp.ties}`);
    }
  }

  // revalue.mjs owns members.json; build.mjs runs it before this script, so the places land on
  // the list it just wrote and a full rebuild always produces both halves. The picker reads the
  // array in order, so write it in order too. Only `place` and `place_season` go on the wire:
  // the record each place was derived from is printed below and documented in UI_SDD §2, not
  // shipped to a browser that has no screen for it.
  const members = readJson("ui/members.json", null);
  if (!Array.isArray(members) || !members.length) {
    throw new Error("members.json is missing or empty -- run revalue.mjs before title-path.mjs");
  }
  const standByUser = Object.fromEntries(standings.filter((r) => r.user_id).map((r) => [r.user_id, r]));
  const absent = [];
  const seated = members.map((m) => {
    const row = standByUser[m.user_id];
    if (row) return { ...m, place: row.place, place_season: lastSeason };
    absent.push(m.name);
    return { ...m, place: null, place_season: lastSeason };
  });
  // A manager who joined after last season has no finish. Park them after everyone who does,
  // by name, rather than guessing a place for them.
  const missing = seated.filter((m) => m.place == null).sort((a, b) => a.name.localeCompare(b.name));
  missing.forEach((m, i) => { m.place = standings.length + i + 1; });
  seated.sort((a, b) => a.place - b.place);
  if (absent.length) console.error(`note: no ${lastSeason} roster for ${absent.join(", ")} -- parked at the end`);
  writeUi("members.json", seated);

  const payload = {
    as_of: ymd(Date.now()),
    league_id: LEAGUE_ID,
    titles,
  };
  writeUi("titles.json", payload);
  console.log(JSON.stringify({
    standings: {
      season: lastSeason,
      rule: "winners-bracket placement games, then wins*2+ties, then points for, then roster_id",
      order: standings.map((r) => `${r.place}. ${r.name} (${r.from}) ${r.wins}-${r.losses}-${r.ties} ${r.fpts.toFixed(2)}`),
      out: "data/ui/members.json",
    },
    titles: titles.map((t) => ({
      season: t.season,
      name: t.name,
      record: `${t.record.wins}-${t.record.losses}`,
      fpts_rank: t.record.fpts_rank,
      used: t.draft.used.length,
      final: t.final
        ? `wk${t.final.week} beat ${t.final.opponent}`
          + ` (${t.final.opponent_record.wins}-${t.final.opponent_record.losses}-${t.final.opponent_record.ties})`
          + ` ${t.final.champ_points}-${t.final.opponent_points}`
          + ` · top ${t.final.top ? t.final.top.player + " " + t.final.top.points : "—"}`
        : `none (${t.final_missing})`,
      thesis: t.thesis,
    })),
    out: "data/ui/titles.json",
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
