import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTradeWebBook,
  buildTradeWebRoot,
  indexTradeLegs,
} from "../lib/trade-web.mjs";

const TRADES = [
  {
    transaction_id: "tx1",
    date: "2026-10-02",
    season: "2026",
    week: 4,
  },
  {
    transaction_id: "tx2",
    date: "2026-11-03",
    season: "2026",
    week: 9,
  },
];

const LEGS = [
  // Golden: Truman → SF for Ridley + Bell + pick
  { transaction_id: "tx1", direction: "out", from_user_id: "truman", kind: "player", asset_key: "player:g", label: "Matthew Golden" },
  { transaction_id: "tx1", direction: "in", to_user_id: "sf", kind: "player", asset_key: "player:g", label: "Matthew Golden" },
  { transaction_id: "tx1", direction: "out", from_user_id: "sf", kind: "player", asset_key: "player:r", label: "Calvin Ridley" },
  { transaction_id: "tx1", direction: "in", to_user_id: "truman", kind: "player", asset_key: "player:r", label: "Calvin Ridley" },
  { transaction_id: "tx1", direction: "out", from_user_id: "sf", kind: "player", asset_key: "player:b", label: "Chris Bell" },
  { transaction_id: "tx1", direction: "in", to_user_id: "truman", kind: "player", asset_key: "player:b", label: "Chris Bell" },
  { transaction_id: "tx1", direction: "out", from_user_id: "sf", kind: "pick", asset_key: "pick:2029:2:5", label: "2029 2nd" },
  { transaction_id: "tx1", direction: "in", to_user_id: "truman", kind: "pick", asset_key: "pick:2029:2:5", label: "2029 2nd" },
  // Ridley flipped later: Truman → SF for a 4th
  { transaction_id: "tx2", direction: "out", from_user_id: "truman", kind: "player", asset_key: "player:r", label: "Calvin Ridley" },
  { transaction_id: "tx2", direction: "in", to_user_id: "sf", kind: "player", asset_key: "player:r", label: "Calvin Ridley" },
  { transaction_id: "tx2", direction: "out", from_user_id: "sf", kind: "pick", asset_key: "pick:2029:4:2", label: "2029 4th" },
  { transaction_id: "tx2", direction: "in", to_user_id: "truman", kind: "pick", asset_key: "pick:2029:4:2", label: "2029 4th" },
];

const NAMES = { truman: "TrumanCooper", sf: "SF69erss" };

test("Golden web: Truman return bag + Ridley flip", () => {
  const legsIndex = indexTradeLegs(LEGS);
  const tradesById = new Map(TRADES.map((t) => [t.transaction_id, t]));
  const web = buildTradeWebRoot({
    rootAssetKey: "player:g",
    rootLabel: "Matthew Golden",
    seatUserId: "truman",
    transactionId: "tx1",
    nameByUser: NAMES,
    legsIndex,
    tradesById,
    picksBook: {
      "pick:2029:2:5": { label: "2029 2nd", still_pick: true, holder: "TrumanCooper", hops: [] },
      "pick:2029:4:2": { label: "2029 4th", still_pick: true, holder: "TrumanCooper", hops: [] },
    },
    moves: [],
  });
  assert.equal(web.seat, "TrumanCooper");
  assert.equal(web.partner, "SF69erss");
  assert.equal(web.branches.length, 3);
  const ridley = web.branches.find((b) => b.label === "Calvin Ridley");
  assert.ok(ridley);
  assert.equal(ridley.status, "traded");
  assert.equal(ridley.children.length, 1);
  assert.equal(ridley.children[0].label, "2029 4th");
  const bell = web.branches.find((b) => b.label === "Chris Bell");
  assert.equal(bell.status, "held");
  assert.match(web.thesis, /Matthew Golden/);
});

test("buildTradeWebBook indexes traded players", () => {
  const book = buildTradeWebBook({
    legs: LEGS,
    trades: TRADES,
    nameByUser: NAMES,
    playersNfl: {
      g: { full_name: "Matthew Golden" },
      r: { full_name: "Calvin Ridley" },
      b: { full_name: "Chris Bell" },
    },
    leagueId: "L1",
  });
  assert.equal(book.v, 1);
  const golden = book.players.find((p) => p.player_id === "g");
  assert.ok(golden);
  assert.equal(golden.n_exits, 1);
  assert.equal(golden.webs[0].branches.length, 3);
});
