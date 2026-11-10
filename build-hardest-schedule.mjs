#!/usr/bin/env node
/**
 * Hardest Remaining Schedule book for League Data.
 *
 *   node build-hardest-schedule.mjs [league_id]
 *
 * Ranks every seat by rest-of-RS SoS from projected-finish.json so the tile
 * rebuilds automatically each week with Expected finish.
 */
import {
  CUCKLE_LEAGUE_ID,
  LEAGUE_ID,
  readUi,
  setLeagueId,
  writeUi,
} from "./lib.mjs";
import { buildHardestScheduleBook } from "./lib/hardest-schedule.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID || CUCKLE_LEAGUE_ID);

const projectedFinish = readUi("projected-finish.json", null);
if (!projectedFinish || !Array.isArray(projectedFinish.seats) || !projectedFinish.seats.length) {
  console.error("missing projected-finish.json — run build-projected-finish first");
  process.exit(1);
}

const book = buildHardestScheduleBook({
  projectedFinish,
  leagueId: LEAGUE_ID,
});
writeUi("hardest-schedule.json", book);

const top = (book.seats || []).slice(0, 3)
  .map((s) => `${s.rank}. ${s.name} sos=${s.sos} (${s.sos_lab})`)
  .join(" | ");
console.log(JSON.stringify({
  ok: true,
  v: book.v,
  n: book.n,
  week: book.week,
  remaining_weeks: book.remaining_weeks,
  top3: (book.seats || []).slice(0, 3).map((s) => ({
    rank: s.rank,
    name: s.name,
    sos: s.sos,
    sos_lab: s.sos_lab,
  })),
  softest: book.seats && book.seats.length
    ? {
      rank: book.seats[book.seats.length - 1].rank,
      name: book.seats[book.seats.length - 1].name,
      sos: book.seats[book.seats.length - 1].sos,
      sos_lab: book.seats[book.seats.length - 1].sos_lab,
    }
    : null,
  note: top,
}, null, 2));
