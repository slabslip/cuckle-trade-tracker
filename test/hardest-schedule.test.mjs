import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHardestScheduleBook,
  sosLabelForRank,
  seatsFromProjectedFinish,
} from "../lib/hardest-schedule.mjs";

const FIXTURE = {
  as_of: "2025-11-10",
  league_id: "L1",
  season: 2025,
  week: 9,
  playoff_week_start: 15,
  remaining_weeks: [10, 11, 12, 13, 14],
  remaining_week_count: 5,
  remaining_games: 5,
  seats: [
    {
      user_id: "u1",
      name: "HardSeat",
      roster_id: 1,
      sos: 0.58,
      sos_ease: 0.42,
      record: "5-4",
      place_now: 6,
      proj_finish: 7.2,
      pf: 1100,
      pa: 1050,
      expected_remaining_wins: 1.8,
      remaining: [
        { week: 10, opp: "SoftSeat", opp_roster_id: 2, p_win: 0.35 },
        { week: 11, opp: "MidSeat", opp_roster_id: 3, p_win: 0.45 },
      ],
    },
    {
      user_id: "u2",
      name: "SoftSeat",
      roster_id: 2,
      sos: 0.40,
      sos_ease: 0.60,
      record: "7-2",
      place_now: 1,
      proj_finish: 2.1,
      pf: 1300,
      pa: 1000,
      expected_remaining_wins: 3.5,
      remaining: [
        { week: 10, opp: "HardSeat", opp_roster_id: 1, p_win: 0.65 },
        { week: 11, opp: "MidSeat", opp_roster_id: 3, p_win: 0.55 },
      ],
    },
    {
      user_id: "u3",
      name: "MidSeat",
      roster_id: 3,
      sos: 0.49,
      sos_ease: 0.51,
      record: "5-4",
      place_now: 5,
      proj_finish: 5.0,
      pf: 1150,
      pa: 1120,
      expected_remaining_wins: 2.4,
      remaining: [
        { week: 10, opp: "HardSeat", opp_roster_id: 1, p_win: 0.48 },
        { week: 11, opp: "SoftSeat", opp_roster_id: 2, p_win: 0.40 },
      ],
    },
  ],
};

test("sosLabelForRank: hardest → Hellscape, easiest → Cupcake", () => {
  assert.equal(sosLabelForRank(1, 8), "Hellscape");
  assert.equal(sosLabelForRank(8, 8), "Cupcake");
});

test("seats ranked hardest first by sos", () => {
  const rows = seatsFromProjectedFinish(FIXTURE);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, "HardSeat");
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].sos_lab, "Hellscape");
  assert.equal(rows[2].name, "SoftSeat");
  assert.ok(rows[0].opponents.length === 2);
  assert.ok(rows[0].opponents[0].difficulty != null);
  assert.match(rows[0].thesis, /toughest draws/);
});

test("buildHardestScheduleBook copies rem weeks + rule", () => {
  const book = buildHardestScheduleBook({ projectedFinish: FIXTURE, leagueId: "L1" });
  assert.equal(book.v, 1);
  assert.equal(book.n, 3);
  assert.deepEqual(book.remaining_weeks, [10, 11, 12, 13, 14]);
  assert.ok(book.rule && book.rule.metric);
  assert.equal(book.seats[0].key, "u1");
});
