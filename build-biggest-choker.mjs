#!/usr/bin/env node
/**
 * Biggest Choker book for League Data.
 *
 *   node build-biggest-choker.mjs [league_id]
 *
 * Reads season-arcs + titles + standings → ui/biggest-choker.json
 * Then fills championship / late-RS "went off" scorers from Sleeper matchups.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  DATA,
  LEAGUE_ID,
  readJson,
  readUi,
  setLeagueId,
  sleeperGet,
  writeUi,
} from "./lib.mjs";
import {
  buildBiggestChokerBook,
  normalizeScorers,
} from "./lib/biggest-choker.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function loadPlayers() {
  const path = `${DATA}/players.nfl.json`;
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function playerName(players, pid) {
  const p = players && players[String(pid)];
  if (!p) return String(pid);
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || String(pid);
}

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function starterScorers(mu, players, n) {
  const pp = (mu && mu.players_points) || {};
  const starters = ((mu && mu.starters) || []).filter((id) => id && id !== "0");
  const rows = [];
  for (const pid of starters) {
    const pts = pp[pid];
    if (pts == null) continue;
    rows.push({
      player_id: String(pid),
      player: playerName(players, pid),
      points: money(pts),
    });
  }
  rows.sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
  return rows.slice(0, Math.max(1, Number(n) || 3));
}

function leagueIdBySeason() {
  const leagues = readJson("leagues.json", []) || [];
  const map = new Map();
  for (const L of leagues) {
    if (L && L.season != null && L.league_id != null) {
      map.set(String(L.season), String(L.league_id));
    }
  }
  return map;
}

async function matchups(leagueId, week) {
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const rows = await sleeperGet(`/league/${leagueId}/matchups/${week}`);
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr || new Error(`matchups ${leagueId} w${week}`);
}

function rosterIdForUser(standings, season, userId) {
  const block = (standings || []).find((b) => String(b.season) === String(season));
  const row = ((block && block.rows) || []).find((r) => String(r.user_id) === String(userId));
  return row && row.roster_id != null ? Number(row.roster_id) : null;
}

function playoffWeekStart(scores, season) {
  for (const row of scores || []) {
    if (String(row.season) !== String(season)) continue;
    const pws = Number(row.playoff_week_start);
    if (pws >= 1) return pws;
  }
  return 15;
}

/** Pair matchup rows by matchup_id; return opponent of rosterId. */
function opponentRow(rows, rosterId) {
  const mine = (rows || []).find((m) => Number(m.roster_id) === Number(rosterId));
  if (!mine || mine.matchup_id == null) return { mine: mine || null, opp: null };
  const opp = (rows || []).find((m) => m.matchup_id === mine.matchup_id
    && Number(m.roster_id) !== Number(rosterId));
  return { mine, opp: opp || null };
}

async function enrichWentOff(book, opts) {
  const players = opts.players || {};
  const standings = opts.standings || [];
  const scores = opts.scores || [];
  const bySeasonLeague = opts.bySeasonLeague || new Map();
  const titlesBySeason = new Map();
  for (const t of opts.titles || []) {
    if (t && t.season != null) titlesBySeason.set(String(t.season), t);
  }

  for (const seat of book.seats || []) {
    if (seat.kind === "title_loss") {
      if (seat.went_off && seat.went_off.length) continue;
      const title = titlesBySeason.get(String(seat.season));
      const final = title && title.final;
      if (!final || !final.ok || final.week == null) continue;
      const lid = bySeasonLeague.get(String(seat.season));
      if (!lid) continue;
      try {
        const rows = await matchups(lid, final.week);
        const champRid = title.roster_id != null
          ? Number(title.roster_id)
          : null;
        const loseRid = final.opponent_roster_id != null
          ? Number(final.opponent_roster_id)
          : rosterIdForUser(standings, seat.season, seat.user_id);
        const champMu = champRid != null
          ? rows.find((m) => Number(m.roster_id) === champRid)
          : null;
        const loseMu = loseRid != null
          ? rows.find((m) => Number(m.roster_id) === loseRid)
          : null;
        if (champMu) seat.went_off = starterScorers(champMu, players, 3);
        if (loseMu) seat.own_scorers = starterScorers(loseMu, players, 3);
        if (seat.went_off && seat.went_off.length && seat.champ_name) {
          const wentLine = seat.went_off.map((p) => `${p.player} ${p.points}`).join(", ");
          if (seat.thesis && !String(seat.thesis).includes("went off")) {
            seat.thesis = String(seat.thesis).replace(/\s*$/, "")
              + ` ${seat.champ_name} went off with ${wentLine}.`;
          }
        }
      } catch (err) {
        console.warn("went_off title", seat.season, err.message || err);
      }
      continue;
    }

    if (seat.kind !== "playoff_miss") continue;
    const lid = bySeasonLeague.get(String(seat.season));
    const rid = rosterIdForUser(standings, seat.season, seat.user_id);
    if (!lid || rid == null) continue;
    const pws = playoffWeekStart(scores, seat.season);
    // Last two regular-season weeks — the cut usually decides here.
    const weeks = [pws - 1, pws - 2].filter((w) => w >= 1);
    let best = null;
    for (const week of weeks) {
      try {
        const rows = await matchups(lid, week);
        const { mine, opp } = opponentRow(rows, rid);
        if (!mine || !opp || mine.points == null || opp.points == null) continue;
        const margin = Number(opp.points) - Number(mine.points);
        const oppTop = starterScorers(opp, players, 3);
        if (!oppTop.length) continue;
        if (!best || margin > best.margin) {
          best = {
            week,
            margin,
            mine_points: money(mine.points),
            opp_points: money(opp.points),
            went_off: oppTop,
            opp_name: null,
          };
        }
      } catch (err) {
        console.warn("went_off miss", seat.season, "w" + week, err.message || err);
      }
    }
    if (best && best.went_off.length) {
      seat.went_off = best.went_off;
      seat.went_off_note = `W${best.week} they put up ${best.mine_points} and the other side ${best.opp_points}`
        + (best.margin > 0 ? ` (lost by ${money(best.margin)})` : "");
    }
  }
  return book;
}

async function main() {
  const leagueId = LEAGUE_ID;
  const today = new Date().toISOString().slice(0, 10);
  const arcs = readUi("season-arcs.json", null) || {};
  const titles = readUi("titles.json", null) || { titles: [] };
  const standings = readJson("sleeper_season_standings.json", []) || [];
  const weekScores = readJson("weekly_scores.json", null) || {};
  const league = readUi("league.json", null) || {};
  const playoffTeams = Number(league.playoff_teams)
    || Number(league.settings && league.settings.playoff_teams)
    || 6;

  const book = buildBiggestChokerBook({
    arcs,
    titles,
    standings,
    playoffTeams,
    leagueId,
    asOf: today,
  });

  await enrichWentOff(book, {
    players: loadPlayers(),
    standings,
    scores: weekScores.scores || [],
    bySeasonLeague: leagueIdBySeason(),
    titles: titles.titles || [],
  });

  // Drop empty arrays so the UI stays clean.
  for (const seat of book.seats || []) {
    if (seat.went_off) seat.went_off = normalizeScorers(seat.went_off);
    if (seat.own_scorers) seat.own_scorers = normalizeScorers(seat.own_scorers);
    if (seat.went_off && !seat.went_off.length) delete seat.went_off;
    if (seat.own_scorers && !seat.own_scorers.length) delete seat.own_scorers;
  }

  writeUi("biggest-choker.json", book);

  const lead = (book.seats || [])[0];
  console.log(
    "biggest-choker",
    book.n + "/" + book.n_all,
    "top",
    lead
      ? (`#1 ${lead.name} ${lead.season} ${lead.kind} score=${lead.score}`)
      : "—",
  );
  for (const s of (book.seats || []).slice(0, 5)) {
    const went = (s.went_off || []).map((p) => p.player).join("/") || "—";
    console.log(
      " ",
      s.rank + ".",
      s.season,
      s.name,
      s.kind,
      s.year_biggest ? "(year)" : "",
      "→",
      s.lab,
      "| went_off",
      went,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
