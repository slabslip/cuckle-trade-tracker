import test from "node:test";
import assert from "node:assert/strict";
import { buildDayTradedBook } from "./day-traded.mjs";

test("day traded ranks by adds + drops on the wire", () => {
  const book = buildDayTradedBook({
    leagueId: "L1",
    asOf: "2026-11-01",
    members: [
      { user_id: "a", name: "Alpha" },
      { user_id: "b", name: "Bravo" },
    ],
    seats: [
      { season: "2025", roster_id: 1, owner_id: "a" },
      { season: "2025", roster_id: 2, owner_id: "b" },
      { season: "2026", roster_id: 1, owner_id: "a" },
      { season: "2026", roster_id: 2, owner_id: "b" },
    ],
    nameHints: [
      { sleeper_id: "111", name: "Wire Spinner" },
      { sleeper_id: "222", name: "One Claim" },
    ],
    moves: [
      {
        date: "2025-09-01", season: "2025", type: "waiver", transaction_id: "1",
        adds: { "111": 1 }, drops: {},
      },
      {
        date: "2025-09-08", season: "2025", type: "free_agent", transaction_id: "2",
        drops: { "111": 1 }, adds: {},
      },
      {
        date: "2025-09-15", season: "2025", type: "waiver", transaction_id: "3",
        adds: { "111": 2 }, drops: {},
      },
      {
        date: "2025-09-22", season: "2025", type: "waiver", transaction_id: "4",
        drops: { "111": 2 }, adds: { "222": 1 },
      },
      {
        date: "2025-10-01", season: "2025", type: "commissioner", transaction_id: "5",
        adds: { "111": 1 }, drops: {},
      },
    ],
  });

  assert.equal(book.v, 1);
  assert.equal(book.players[0].player_id, "111");
  assert.equal(book.players[0].adds, 2);
  assert.equal(book.players[0].drops, 2);
  assert.equal(book.players[0].churn, 4);
  assert.ok(book.players[0].recent.length >= 2);
  const one = book.players.find((p) => p.player_id === "222");
  assert.ok(one);
  assert.equal(one.churn, 1);
});
