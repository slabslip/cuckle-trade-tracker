#!/usr/bin/env node
/**
 * ESPN historical seasons → the same raw shapes sleeper-sync writes.
 * Needs ESPN_S2 + ESPN_SWID (or ESPN_COOKIE) for a private league.
 * Public / unauthorized leagues write espn_status.json and empty books, exit 0.
 */
import fs from "node:fs";
import {
  DATA,
  ESPN_READS,
  ESPN_WEB,
  REDRAFT_ESPN_LEAGUE_ID,
  espnCookieHeader,
  espnGet,
  loadProviders,
  parseCsv,
  setLeagueId,
  writeJson,
} from "./lib.mjs";
import { espnPlayoffWeekStart, espnScoresFromSchedule } from "./lib/espn-weeks.mjs";

const LEAGUE_ID = setLeagueId(process.argv[2] || process.env.LEAGUE_ID);
const providers = loadProviders(LEAGUE_ID);
const ESPN_ID = String(
  process.env.ESPN_LEAGUE_ID
    || providers.espn_league_id
    || REDRAFT_ESPN_LEAGUE_ID,
).trim();
const THROUGH = Number(providers.espn_through_season || process.env.ESPN_THROUGH_SEASON || 0) || null;
const FROM = Number(providers.espn_from_season || process.env.ESPN_FROM_SEASON || 2010);

function emptyBooks() {
  return {
    seasons: [],
    members: [],
    seats: [],
    standings: [],
    trades: [],
    trade_legs: [],
    titles: [],
    weekly: [],
  };
}

function writeBooks(books, status) {
  writeJson("espn_status.json", status);
  writeJson("espn_seasons.json", books.seasons);
  writeJson("espn_members.json", books.members);
  writeJson("espn_seats.json", books.seats);
  writeJson("espn_standings.json", books.standings);
  writeJson("espn_trades.json", books.trades);
  writeJson("espn_trade_legs.json", books.trade_legs);
  writeJson("espn_titles.json", books.titles);
  writeJson("espn_weekly_scores.json", {
    v: 1,
    espn_league_id: ESPN_ID,
    n: (books.weekly || []).length,
    scores: books.weekly || [],
  });
}

function loadEspnIdMap() {
  const path = `${DATA}/dp/latest/db_playerids.csv`;
  const map = new Map();
  if (!fs.existsSync(path)) return map;
  for (const r of parseCsv(fs.readFileSync(path, "utf8"))) {
    const espn = String(r.espn_id || "").trim();
    const sleeper = String(r.sleeper_id || "").trim();
    const name = String(r.name || "").trim();
    if (!espn || espn === "NA") continue;
    map.set(espn, { sleeper_id: sleeper && sleeper !== "NA" ? sleeper : null, name });
  }
  return map;
}

function playerLabel(idMap, espnId) {
  const hit = idMap.get(String(espnId));
  if (hit && hit.name) return hit.name;
  return `espn-player:${espnId}`;
}

function playerKey(idMap, espnId) {
  const hit = idMap.get(String(espnId));
  if (hit && hit.sleeper_id) return `player:${hit.sleeper_id}`;
  return `espn-player:${espnId}`;
}

function memberId(raw) {
  const id = raw && (raw.id != null ? raw.id : raw.displayName);
  return id != null ? `espn:${id}` : null;
}

function teamOwnerId(team, membersBySwid) {
  const primary = team && (team.primaryOwner || (team.owners && team.owners[0]));
  if (primary && membersBySwid.has(primary)) return membersBySwid.get(primary);
  if (primary) return `espn:${primary}`;
  if (team && team.id != null) return `espn-team:${team.id}`;
  return null;
}

function teamName(team) {
  const loc = String(team.location || "").trim();
  const nick = String(team.nickname || "").trim();
  const both = `${loc} ${nick}`.trim();
  return both || team.abbrev || `Team ${team.id}`;
}

function recordOf(team) {
  const rec = (team && team.record && team.record.overall) || {};
  return {
    wins: Number(rec.wins) || 0,
    losses: Number(rec.losses) || 0,
    ties: Number(rec.ties) || 0,
    fpts: Number(rec.pointsFor) || 0,
  };
}

function viewsQs(views) {
  return views.map((v) => `view=${encodeURIComponent(v)}`).join("&");
}

async function fetchSeason(season) {
  const views = ["mTeam", "mSettings", "mStandings", "mRoster", "mDraftDetail", "mMatchup", "mMatchupScore"];
  const qs = viewsQs(views);
  const urls = [
    `${ESPN_READS}/seasons/${season}/segments/0/leagues/${ESPN_ID}?${qs}`,
    `${ESPN_WEB}/seasons/${season}/segments/0/leagues/${ESPN_ID}?${qs}`,
    `${ESPN_WEB}/leagueHistory/${ESPN_ID}?seasonId=${season}&${qs}`,
    `${ESPN_READS}/leagueHistory/${ESPN_ID}?seasonId=${season}&${qs}`,
  ];
  let last = { ok: false, status: 0, json: null };
  for (const url of urls) {
    last = await espnGet(url);
    if (last.ok && last.json) {
      const body = Array.isArray(last.json) ? last.json[0] : last.json;
      if (body && (body.teams || body.settings || body.id)) {
        return { season, body, status: last.status, url };
      }
    }
  }
  return { season, body: null, status: last.status, url: last.url || urls[0] };
}

async function fetchSchedule(season) {
  const qs = viewsQs(["mMatchup", "mMatchupScore", "mTeam"]);
  const urls = [
    `${ESPN_READS}/seasons/${season}/segments/0/leagues/${ESPN_ID}?${qs}`,
    `${ESPN_WEB}/seasons/${season}/segments/0/leagues/${ESPN_ID}?${qs}`,
    `${ESPN_WEB}/leagueHistory/${ESPN_ID}?seasonId=${season}&${qs}`,
  ];
  for (const url of urls) {
    const res = await espnGet(url);
    if (res.ok && res.json) {
      const body = Array.isArray(res.json) ? res.json[0] : res.json;
      if (body && Array.isArray(body.schedule) && body.schedule.length) return body.schedule;
    }
  }
  return [];
}

async function fetchTrades(season) {
  const filter = encodeURIComponent(JSON.stringify({
    transactions: { filterType: { value: ["TRADE"] } },
  }));
  const urls = [
    `${ESPN_READS}/seasons/${season}/segments/0/leagues/${ESPN_ID}?view=mTransactions2`,
    `${ESPN_WEB}/seasons/${season}/segments/0/leagues/${ESPN_ID}?view=mTransactions2`,
    `${ESPN_WEB}/leagueHistory/${ESPN_ID}?seasonId=${season}&view=mTransactions2`,
    `${ESPN_READS}/leagueHistory/${ESPN_ID}?seasonId=${season}&view=mTransactions2`,
  ];
  for (const url of urls) {
    const res = await espnGet(url + `&scoringPeriodId=0&X-Fantasy-Filter=${filter}`);
    if (res.ok && res.json) {
      const body = Array.isArray(res.json) ? res.json[0] : res.json;
      return Array.isArray(body && body.transactions) ? body.transactions : [];
    }
  }
  return [];
}

function parseMembers(body, season) {
  const rows = [];
  for (const m of body.members || []) {
    const uid = memberId(m);
    if (!uid) continue;
    rows.push({
      user_id: uid,
      espn_id: m.id != null ? String(m.id) : null,
      canonical_name: m.displayName || [m.firstName, m.lastName].filter(Boolean).join(" ") || uid,
      aliases: [
        m.displayName,
        m.firstName,
        m.lastName,
        [m.firstName, m.lastName].filter(Boolean).join(" "),
      ].filter(Boolean).map((name) => ({ name, kind: "espn_display", first_seen_season: String(season) })),
    });
  }
  return rows;
}

function parseSeason(body, season, idMap) {
  const settings = body.settings || {};
  const schedule = settings.scheduleSettings || {};
  const scoring = settings.scoringSettings || {};
  const roster = settings.rosterSettings || {};
  const members = parseMembers(body, season);
  const membersBySwid = new Map();
  for (const m of members) {
    if (m.espn_id) membersBySwid.set(m.espn_id, m.user_id);
    membersBySwid.set(m.user_id, m.user_id);
  }
  const leagueRow = {
    league_id: `espn:${ESPN_ID}:${season}`,
    provider: "espn",
    espn_league_id: ESPN_ID,
    season: String(season),
    name: settings.name || body.name || `ESPN ${season}`,
    previous_league_id: null,
    num_teams: (body.teams || []).length || schedule.numTeams || null,
    playoff_teams: schedule.playoffTeamCount || null,
    superflex: false,
    roster_positions: Object.keys(roster.lineupSlotCounts || {}),
    settings: { type: 0, num_teams: (body.teams || []).length || schedule.numTeams || null },
    scoring_settings: { rec: scoring.scoringItems ? null : null },
  };

  const seats = [];
  const standings = [];
  let champ = null;
  for (const team of body.teams || []) {
    const uid = teamOwnerId(team, membersBySwid);
    const rec = recordOf(team);
    const place = Number(team.rankCalculatedFinal || team.playoffSeed || team.rank) || null;
    seats.push({
      league_id: leagueRow.league_id,
      provider: "espn",
      season: String(season),
      roster_id: team.id,
      owner_id: uid,
      team_name: teamName(team),
    });
    const row = {
      season: String(season),
      roster_id: team.id,
      user_id: uid,
      name: teamName(team),
      place,
      ...rec,
    };
    standings.push(row);
    if (place === 1) champ = row;
  }
  if (!champ && standings.length) {
    const byPts = standings.slice().sort((a, b) => (a.place || 99) - (b.place || 99) || b.fpts - a.fpts);
    champ = byPts[0];
  }

  const titles = [];
  if (champ && champ.user_id) {
    titles.push({
      season: String(season),
      user_id: champ.user_id,
      name: champ.name,
      roster_id: champ.roster_id,
      place: 1,
      provider: "espn",
      record: {
        wins: champ.wins,
        losses: champ.losses,
        ties: champ.ties,
        fpts: champ.fpts,
        ppts: null,
        sit: null,
        fpts_rank: null,
        teams: standings.length,
        trades: 0,
        league_mean_trades: null,
      },
      final: null,
      final_missing: "espn_history",
      prior: null,
      repeat: null,
      draft: { used: [], startup: false },
      opening: { n: 0, starters: 0 },
      title_lineup: { n: 0, from_opening: 0, starters: [] },
      turnover: { vs_prev_end: null, vs_prev_opening: null, core_from_prev_end: null },
      windows: { previous: null, offseason: null, regular: null, playoffs: null },
      thesis: `${season} ESPN champion. Standings imported; championship final tape is not on this book yet.`,
    });
  }

  return { leagueRow, members, seats, standings, titles, idMap };
}

function parseTrades(txs, season, seats, idMap) {
  const ownerByRoster = new Map(seats.map((s) => [Number(s.roster_id), s.owner_id]));
  const trades = [];
  const legs = [];
  for (const tx of txs || []) {
    const type = String(tx.type || tx.typeId || "").toUpperCase();
    if (type !== "TRADE" && tx.typeId !== 4) continue;
    const status = String(tx.status || "").toUpperCase();
    if (status && status !== "EXECUTED" && status !== "SUCCESSFUL") continue;
    const id = String(tx.id || tx.proposedDate || `${season}-${trades.length}`);
    const when = tx.proposedDate || tx.processDate || tx.executionDate;
    const date = when ? new Date(when).toISOString().slice(0, 10) : `${season}-09-01`;
    const rosterIds = [];
    const userIds = [];
    const seenR = new Set();
    for (const item of tx.items || tx.messages || []) {
      const from = item.fromTeamId ?? item.sourceTeamId;
      const to = item.toTeamId ?? item.destinationTeamId;
      for (const rid of [from, to]) {
        if (rid == null || seenR.has(rid)) continue;
        seenR.add(rid);
        rosterIds.push(rid);
        userIds.push(ownerByRoster.get(Number(rid)) || null);
      }
      const pid = item.playerId ?? item.playerId;
      if (pid == null) continue;
      const toUid = ownerByRoster.get(Number(to));
      const fromUid = ownerByRoster.get(Number(from));
      const key = playerKey(idMap, pid);
      const label = playerLabel(idMap, pid);
      if (to != null) {
        legs.push({
          transaction_id: `espn:${id}`,
          direction: "in",
          to_user_id: toUid || null,
          to_roster_id: to,
          kind: "player",
          asset_key: key,
          label,
          provider: "espn",
        });
      }
      if (from != null) {
        legs.push({
          transaction_id: `espn:${id}`,
          direction: "out",
          from_user_id: fromUid || null,
          from_roster_id: from,
          kind: "player",
          asset_key: key,
          label,
          provider: "espn",
        });
      }
    }
    if (rosterIds.length < 2) continue;
    trades.push({
      transaction_id: `espn:${id}`,
      league_id: `espn:${ESPN_ID}:${season}`,
      provider: "espn",
      season: String(season),
      week: tx.scoringPeriodId || 0,
      created: when || null,
      date,
      roster_ids: rosterIds,
      user_ids: userIds,
    });
  }
  return { trades, legs };
}

async function main() {
  const cookie = espnCookieHeader();
  const idMap = loadEspnIdMap();
  const books = emptyBooks();
  const memberMap = new Map();
  const yearNow = new Date().getUTCFullYear();
  const lastYear = THROUGH || Math.min(yearNow - 1, 2024);
  const status = {
    espn_league_id: ESPN_ID,
    sleeper_league_id: LEAGUE_ID,
    cookie: !!cookie,
    authorized: false,
    reason: null,
    seasons: [],
    tried: [],
  };

  if (!ESPN_ID) {
    status.reason = "no_espn_league_id";
    writeBooks(books, status);
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  let sawAuthBlock = false;
  for (let year = lastYear; year >= FROM; year--) {
    const got = await fetchSeason(year);
    status.tried.push({ season: year, status: got.status });
    if (got.status === 401 || got.status === 403) {
      sawAuthBlock = true;
      continue;
    }
    if (!got.body) continue;
    status.authorized = true;
    const parsed = parseSeason(got.body, year, idMap);
    books.seasons.push(parsed.leagueRow);
    books.seats.push(...parsed.seats);
    books.standings.push(...parsed.standings);
    books.titles.push(...parsed.titles);
    for (const m of parsed.members) {
      if (!memberMap.has(m.user_id)) memberMap.set(m.user_id, m);
      else {
        const row = memberMap.get(m.user_id);
        for (const a of m.aliases) {
          if (!row.aliases.some((x) => x.name === a.name && x.kind === a.kind)) row.aliases.push(a);
        }
      }
    }
    const txs = await fetchTrades(year);
    const bag = parseTrades(txs, year, parsed.seats, idMap);
    books.trades.push(...bag.trades);
    books.trade_legs.push(...bag.legs);
    const ownerByRoster = new Map(parsed.seats.map((s) => [Number(s.roster_id), s.owner_id]));
    const pws = espnPlayoffWeekStart(got.body.settings);
    let schedule = Array.isArray(got.body.schedule) ? got.body.schedule : [];
    if (!schedule.length) schedule = await fetchSchedule(year);
    books.weekly.push(...espnScoresFromSchedule(
      schedule,
      year,
      parsed.leagueRow.league_id,
      ownerByRoster,
      pws,
    ));
    status.seasons.push(String(year));
  }

  books.members = [...memberMap.values()].sort((a, b) =>
    a.canonical_name.localeCompare(b.canonical_name),
  );

  if (!status.authorized) {
    status.reason = sawAuthBlock
      ? (cookie ? "espn_unauthorized_with_cookie" : "espn_private_needs_cookie")
      : "espn_no_season_payload";
  }

  writeBooks(books, status);
  console.log(JSON.stringify({
    ...status,
    members: books.members.length,
    seats: books.seats.length,
    trades: books.trades.length,
    titles: books.titles.length,
    weekly: books.weekly.length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
