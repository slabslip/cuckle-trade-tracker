#!/usr/bin/env node
/**
 * Season arcs + manager archetypes books.
 *
 *   node build-season-arcs.mjs [league_id]
 *
 * Writes:
 *   data/ui/season-arcs.json
 *   data/ui/manager-archetypes.json
 */
import {
  LEAGUE_ID,
  readJson,
  readUi,
  setLeagueId,
  writeUi,
} from "./lib.mjs";
import {
  buildArchetypesBook,
  buildSeasonArcsBook,
} from "./lib/season-arcs.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function main() {
  const leagueId = LEAGUE_ID;
  const today = new Date().toISOString().slice(0, 10);
  const weekScores = readJson("weekly_scores.json", null) || {};
  const standingsRaw = readJson("sleeper_season_standings.json", []) || [];
  const trades = readJson("trades.json", []) || [];
  const tradeLegs = readJson("trade_legs.json", []) || [];
  const members = readUi("members.json", []) || [];
  const picks = readUi("picks.json", {}) || {};
  const proj = readUi("projected-finish.json", null) || {};
  const seatDir = readUi("seat-direction.json", null) || {};
  const league = readUi("league.json", null) || {};

  const teams = Number(league.teams) || Number(proj.teams) || members.length || 10;
  const liveSeason = proj.season != null
    ? Number(proj.season)
    : (league.season != null ? Number(league.season) : null);
  const soonestPickYear = liveSeason != null ? liveSeason + 1 : 2027;

  const book = buildSeasonArcsBook({
    scores: weekScores.scores || [],
    standings: standingsRaw,
    trades,
    tradeLegs,
    members,
    picks,
    projSeats: proj.seats || [],
    teams,
    liveSeason,
    soonestPickYear,
  });
  book.as_of = today;
  book.league_id = String(leagueId);

  const arch = buildArchetypesBook(book, seatDir);
  arch.as_of = today;
  arch.league_id = String(leagueId);

  writeUi("season-arcs.json", book);
  writeUi("manager-archetypes.json", arch);

  const top = (book.seats || []).slice(0, 3)
    .map((s) => `${s.name} slow${Math.round((s.slow_burn_rate || 0) * 100)}%`)
    .join(", ");
  const proxies = (arch.seats || []).filter((s) => s.archetype === "proxy_contender").length;
  console.log(
    "season-arcs",
    (book.seasons || []).length + " seasons",
    (book.seats || []).length + " seats",
    "→",
    top || "—",
    "| archetypes proxy=" + proxies,
  );
}

main();
