#!/usr/bin/env node
/** Write week-scores.json from the on-disk weekly tape. No Sleeper calls. */
import { existsSync, readFileSync } from "node:fs";
import { leagueRawDir, setLeagueId } from "./lib.mjs";
import { writeWeekScoreUi } from "./lib/week-score-lists.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

const tapePath = `${leagueRawDir()}/weekly_scores.json`;
if (!existsSync(tapePath)) {
  console.error("missing " + tapePath);
  process.exit(1);
}
const tape = JSON.parse(readFileSync(tapePath, "utf8"));
const book = writeWeekScoreUi(tape);
function line(rows) {
  return (rows || []).map((r, i) =>
    `${i + 1}. ${r.name} ${r.season} W${r.week} ${r.phase} ${r.points}`
  ).join("\n");
}
console.log(
  `week-scores.json n=${book.n} regular=${book.n_regular} playoff=${book.n_playoff} hunt=${book.n_playoff_hunt}`,
);
console.log("HIGHEST\n" + line(book.all.high));
console.log("LOWEST\n" + line(book.all.low));
