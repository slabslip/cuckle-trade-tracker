#!/usr/bin/env node
/**
 * Career finishes for How I finished. Complete Sleeper seasons plus remapped
 * ESPN standings when cookies have unlocked them. In-progress years stay out.
 */
import {
  LEAGUE_ID,
  detectLeagueFormat,
  readJson,
  readUi,
  setLeagueId,
  sleeperGet,
  writeJson,
  writeUi,
  ymd,
} from "./lib.mjs";
import { standingsFor, standingsForRedraft } from "./lib/standings.mjs";
import { buildFinishesBook, remapEspnStanding } from "./lib/finishes.mjs";
import { applyRedraftSeason, applyRedraftSeasons, champBySeasonFromTitles } from "./lib/redraft-season.mjs";
import { buildBridge, buildFranchiseMap } from "./merge-provider-history.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function slimRows(rows) {
  return (rows || []).map((r) => ({
    roster_id: r.roster_id,
    user_id: r.user_id || null,
    name: r.name,
    place: r.place,
    from: r.from || null,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    fpts: r.fpts,
  }));
}

async function fetchSleeperSeason(league) {
  const id = league.league_id;
  const live = (await sleeperGet(`/league/${id}`)) || league;
  if (live.status !== "complete") return null;
  const users = (await sleeperGet(`/league/${id}/users`)) || [];
  const rosters = (await sleeperGet(`/league/${id}/rosters`)) || [];
  const wb = (await sleeperGet(`/league/${id}/winners_bracket`)) || [];
  const names = Object.fromEntries(users.map((u) => [u.user_id, u.display_name || u.user_id]));
  const owner = Object.fromEntries(rosters.map((r) => [r.roster_id, r.owner_id]));
  const season = String(live.season || league.season);
  const liveFormat = detectLeagueFormat(live);
  const placeFn = liveFormat.kind === "redraft" ? standingsForRedraft : standingsFor;
  const rows = slimRows(placeFn({ season, rosters, owner, names, wb, league: live }, names));
  return { season, league_id: String(id), status: "complete", rows };
}

async function sleeperSeasons() {
  const cached = readJson("sleeper_season_standings.json", null);
  if (Array.isArray(cached) && cached.length) {
    return cached.filter((s) => s && s.status !== "in_season" && Array.isArray(s.rows) && s.rows.length);
  }
  const leagues = readJson("leagues.json", []) || [];
  const out = [];
  for (const league of leagues) {
    try {
      const season = await fetchSleeperSeason(league);
      if (season) out.push(season);
    } catch (err) {
      console.error(`finishes: skip ${league.season} ${league.league_id}: ${err.message}`);
    }
  }
  writeJson("sleeper_season_standings.json", out);
  return out;
}

function espnRows() {
  const espnStatus = readJson("espn_status.json", { authorized: false }) || {};
  if (!espnStatus.authorized) return [];
  const raw = readJson("espn_standings.json", []) || [];
  if (!raw.length) return [];
  const sleeperMembers = readJson("members.json", []) || [];
  const espnMembers = readJson("espn_members.json", []) || [];
  const espnSeats = readJson("espn_seats.json", []) || [];
  const explicit = readJson("espn_bridge.json", {}) || {};
  const person = buildBridge(espnMembers, sleeperMembers, explicit, espnSeats);
  const franchise = buildFranchiseMap(espnSeats, person, explicit);
  return raw.map((row) => remapEspnStanding(row, person, franchise)).filter(Boolean);
}

const sleeper = await sleeperSeasons();
const espn = espnRows();
const members = readUi("members.json", []) || [];
const format = detectLeagueFormat(readJson("leagues.json", []) || []);
const tape = readJson("weekly_scores.json", { scores: [] }) || {};
const titles = readUi("titles.json", { titles: [] }) || { titles: [] };
const champs = champBySeasonFromTitles(titles.titles || []);
const sleeperFixed = format.kind === "redraft"
  ? sleeper.map((season) => ({
    ...season,
    rows: applyRedraftSeason(
      (season.rows || []).map((r) => ({ ...r, season: r.season || season.season })),
      tape.scores || [],
      champs[String(season.season)],
    ),
  }))
  : sleeper;
const espnFixed = format.kind === "redraft"
  ? applyRedraftSeasons(espn, tape.scores || [], champs)
  : espn;
const book = buildFinishesBook({
  sleeperSeasons: sleeperFixed,
  espnStandings: espnFixed,
  members,
  leagueId: LEAGUE_ID,
  asOf: ymd(Date.now()),
  sleeperYears: sleeperFixed.map((s) => s.season),
});
if (format.kind === "redraft") writeJson("sleeper_season_standings.json", sleeperFixed);
writeUi("finishes.json", book);
const lead = book.seats[0];
console.log(
  `finishes.json n=${book.n} seasons=${book.seasons.join(",") || "—"}`
  + (lead ? ` · 1. ${lead.name} ${lead.avg} avg / ${lead.n}` : ""),
);
