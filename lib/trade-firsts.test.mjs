import test from "node:test";
import assert from "node:assert/strict";
import { buildTradeFirstsBook, isFirstRoundPickLeg } from "./trade-firsts.mjs";

test("isFirstRoundPickLeg reads nested pick.round and asset_key", () => {
  assert.equal(isFirstRoundPickLeg({
    kind: "pick", asset_key: "pick:2027:1:5", pick: { round: 1, season: "2027" },
  }), true);
  assert.equal(isFirstRoundPickLeg({
    kind: "pick", asset_key: "pick:2027:2:5", pick: { round: 2 },
  }), false);
  assert.equal(isFirstRoundPickLeg({
    kind: "player", asset_key: "player:1",
  }), false);
});

test("trade firsts lists deals where a seat sent a first", () => {
  const book = buildTradeFirstsBook({
    leagueId: "L1",
    asOf: "2026-11-01",
    members: [
      { user_id: "a", name: "Alpha" },
      { user_id: "b", name: "Bravo" },
      { user_id: "c", name: "Charlie" },
    ],
    trades: [
      { transaction_id: "t1", date: "2025-05-01", season: "2025" },
      { transaction_id: "t2", date: "2024-08-01", season: "2024" },
    ],
    tradeLegs: [
      // Alpha sends 2026 1st to Bravo, gets a player back
      {
        transaction_id: "t1", kind: "pick", direction: "out",
        asset_key: "pick:2026:1:1", label: "2026 R1",
        from_user_id: "a", to_user_id: "b", origin_roster_id: 1,
        pick: { season: "2026", round: 1, roster_id: 1 },
      },
      {
        transaction_id: "t1", kind: "pick", direction: "in",
        asset_key: "pick:2026:1:1", label: "2026 R1",
        from_user_id: "a", to_user_id: "b", origin_roster_id: 1,
        pick: { season: "2026", round: 1, roster_id: 1 },
      },
      {
        transaction_id: "t1", kind: "player", direction: "in",
        asset_key: "player:99", label: "Stud Guy",
        from_user_id: "b", to_user_id: "a",
      },
      {
        transaction_id: "t1", kind: "player", direction: "out",
        asset_key: "player:99", label: "Stud Guy",
        from_user_id: "b", to_user_id: "a",
      },
      // Alpha sends a 2nd — should not count as a firsts deal by itself
      {
        transaction_id: "t2", kind: "pick", direction: "out",
        asset_key: "pick:2025:2:1", label: "2025 R2",
        from_user_id: "a", to_user_id: "c",
        pick: { season: "2025", round: 2, roster_id: 1 },
      },
      {
        transaction_id: "t2", kind: "pick", direction: "in",
        asset_key: "pick:2025:2:1", label: "2025 R2",
        from_user_id: "a", to_user_id: "c",
        pick: { season: "2025", round: 2, roster_id: 1 },
      },
    ],
  });

  assert.equal(book.v, 1);
  const alpha = book.seats.find((s) => s.user_id === "a");
  assert.ok(alpha);
  assert.equal(alpha.n_firsts, 1);
  assert.equal(alpha.n_trades, 1);
  assert.equal(alpha.trades[0].partner_name, "Bravo");
  assert.equal(alpha.trades[0].firsts_out[0].label, "2026 R1");
  assert.ok(alpha.trades[0].in_labels.includes("Stud Guy"));
  const charlie = book.seats.find((s) => s.user_id === "c");
  assert.ok(charlie);
  assert.equal(charlie.n_firsts, 0);
});
