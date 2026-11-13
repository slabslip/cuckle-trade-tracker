import test from "node:test";
import assert from "node:assert/strict";
import { buildMostSharedBook } from "./most-shared.mjs";

test("most shared ranks by distinct seats including waiver hops", () => {
  const book = buildMostSharedBook({
    leagueId: "L1",
    asOf: "2026-11-01",
    members: [
      { user_id: "a", name: "Alpha" },
      { user_id: "b", name: "Bravo" },
      { user_id: "c", name: "Charlie" },
    ],
    draftPicks: [
      { player_id: "111", label: "Shared Guy", drafted_by_user_id: "a", as_of: "2024-05-01" },
      { player_id: "222", label: "Homebody", drafted_by_user_id: "a", as_of: "2024-05-01" },
    ],
    trades: [
      { transaction_id: "t1", date: "2025-03-01" },
    ],
    tradeLegs: [
      { transaction_id: "t1", kind: "player", asset_key: "player:111", direction: "out", from_user_id: "a", label: "Shared Guy" },
      { transaction_id: "t1", kind: "player", asset_key: "player:111", direction: "in", to_user_id: "b", label: "Shared Guy" },
    ],
    seats: [
      { season: "2025", roster_id: 1, owner_id: "c" },
      { season: "2025", roster_id: 2, owner_id: "b" },
      { season: "2026", roster_id: 1, owner_id: "c" },
    ],
    moves: [
      {
        date: "2025-09-01",
        season: "2025",
        type: "waiver",
        transaction_id: "m1",
        drops: { "111": 2 }, // Bravo drops
        adds: {},
      },
      {
        date: "2025-09-02",
        season: "2025",
        type: "free_agent",
        transaction_id: "m2",
        adds: { "111": 1 }, // Charlie claims
        drops: {},
      },
    ],
    rostersNow: [],
  });

  assert.equal(book.v, 1);
  assert.ok(book.players.length >= 1);
  const top = book.players[0];
  assert.equal(top.player_id, "111");
  assert.equal(top.n_seats, 3);
  assert.ok(top.seats.some((s) => s.name === "Alpha"));
  assert.ok(top.seats.some((s) => s.name === "Bravo"));
  assert.ok(top.seats.some((s) => s.name === "Charlie"));
  assert.ok(!book.players.some((p) => p.player_id === "222"), "single-seat players stay off the board");
});
