import test from "node:test";
import assert from "node:assert/strict";
import {
  badWeight,
  buildAssDenominatorBook,
  overlapDays,
  seasonWindow,
} from "./ass-denominator.mjs";

test("badWeight is zero in top half and peaks at sacko", () => {
  assert.equal(badWeight(1, 10), 0);
  assert.equal(badWeight(5, 10), 0);
  assert.ok(badWeight(6, 10) > 0);
  assert.ok(badWeight(10, 10) > badWeight(9, 10));
  assert.equal(badWeight(10, 10), 1.5);
});

test("season window and overlap", () => {
  const w = seasonWindow("2024");
  assert.equal(w.start, "2024-03-01");
  assert.equal(w.end, "2025-02-28");
  assert.equal(overlapDays("2024-09-01", "2024-09-10", w.start, w.end), 10);
});

test("ass denominator ranks time on sacko seats over good seats", () => {
  const finishes = {
    seats: [
      {
        user_id: "bad",
        name: "SackoSeat",
        places: [
          { season: "2024", place: 10 },
          { season: "2025", place: 10 },
        ],
      },
      {
        user_id: "good",
        name: "ChampSeat",
        places: [
          { season: "2024", place: 1 },
          { season: "2025", place: 2 },
        ],
      },
    ],
  };

  const book = buildAssDenominatorBook({
    leagueId: "L1",
    asOf: "2025-12-01",
    finishes,
    members: [
      { user_id: "bad", name: "SackoSeat" },
      { user_id: "good", name: "ChampSeat" },
    ],
    draftPicks: [
      { player_id: "111", label: "Ass Denom", drafted_by_user_id: "bad", as_of: "2024-05-01" },
      { player_id: "222", label: "Champ Pet", drafted_by_user_id: "good", as_of: "2024-05-01" },
    ],
    trades: [],
    tradeLegs: [],
    moves: [],
    seats: [],
    rostersNow: [],
  });

  assert.equal(book.v, 1);
  assert.ok(book.players.length >= 1);
  assert.equal(book.players[0].player_id, "111");
  assert.ok(book.players[0].bad_days > 0);
  assert.ok(book.players[0].seats.some((s) => s.name === "SackoSeat"));
  assert.ok(!book.players.some((p) => p.player_id === "222"),
    "champ-only pets stay off the board");
});
