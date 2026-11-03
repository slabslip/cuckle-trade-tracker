#!/usr/bin/env node
/**
 * Biggest Choker book for League Data.
 *
 *   node build-biggest-choker.mjs [league_id]
 *
 * Reads season-arcs + titles + standings → ui/biggest-choker.json
 */
import {
  LEAGUE_ID,
  readJson,
  readUi,
  setLeagueId,
  writeUi,
} from "./lib.mjs";
import { buildBiggestChokerBook } from "./lib/biggest-choker.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function main() {
  const leagueId = LEAGUE_ID;
  const today = new Date().toISOString().slice(0, 10);
  const arcs = readUi("season-arcs.json", null) || {};
  const titles = readUi("titles.json", null) || { titles: [] };
  const standings = readJson("sleeper_season_standings.json", []) || [];
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
    console.log(
      " ",
      s.rank + ".",
      s.season,
      s.name,
      s.kind,
      s.year_biggest ? "(year)" : "",
      "→",
      s.lab,
    );
  }
}

main();
