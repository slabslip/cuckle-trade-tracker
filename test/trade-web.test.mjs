import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTradeWebBook,
  buildTradeWebRoot,
  indexTradeLegs,
  webToGraph,
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

const CURVE = [
  { asset_key: "player:g", as_of: "2026-10-01", value: 2000 },
  { asset_key: "player:r", as_of: "2026-10-01", value: 800 },
  { asset_key: "player:b", as_of: "2026-10-01", value: 1200 },
  { asset_key: "player:r", as_of: "2026-11-03", value: 500 },
  { asset_key: "player:b", as_of: "2026-11-12", value: 1500 },
  { asset_key: "player:top", as_of: "2026-10-01", value: 10000 },
  { asset_key: "player:top", as_of: "2026-11-03", value: 10000 },
  { asset_key: "player:top", as_of: "2026-11-12", value: 10000 },
  { asset_key: "pickval:2029:2:Mid", as_of: "2026-10-01", value: 400 },
  { asset_key: "pickval:2029:4:Mid", as_of: "2026-11-03", value: 150 },
];

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
    asOf: "2026-11-12",
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
  const g0 = webToGraph(web);
  assert.ok(g0.nodes.length >= 4);
  assert.ok(g0.edges.length >= 3);
});

test("values and deal P&L ride connectors", () => {
  const book = buildTradeWebBook({
    legs: LEGS,
    trades: TRADES,
    nameByUser: NAMES,
    playersNfl: {
      g: { full_name: "Matthew Golden" },
      r: { full_name: "Calvin Ridley" },
      b: { full_name: "Chris Bell" },
    },
    curve: CURVE,
    leagueId: "L1",
    asOf: "2026-11-12",
    picksBook: {
      "pick:2029:2:5": { label: "2029 2nd", still_pick: true, holder: "TrumanCooper", hops: [] },
      "pick:2029:4:2": { label: "2029 4th", still_pick: true, holder: "TrumanCooper", hops: [] },
    },
  });
  assert.equal(book.v, 2);
  const golden = book.players.find((p) => p.player_id === "g");
  assert.ok(golden);
  const web = golden.webs[0];
  assert.ok(web.gave_value != null);
  assert.ok(web.got_value != null);
  assert.ok(web.deal_pnl != null);
  assert.equal(web.deal_pnl, web.got_value - web.gave_value);
  const bell = web.branches.find((b) => b.label === "Chris Bell");
  assert.ok(bell.value_in != null);
  assert.ok(bell.value_now != null);
  assert.equal(bell.mark_pnl, bell.value_now - bell.value_in);
  const g = webToGraph(web);
  assert.ok(g.nodes.some((n) => n.kind === "trade"));
  assert.ok(g.edges.some((e) => e.pnl != null || e.value != null));
  assert.ok(!web.graph); // slim book omits graph; UI rebuilds it
});

test("pick receive hop does not re-expand the same trade bag", () => {
  const legs = [
    { transaction_id: "txA", direction: "out", from_user_id: "truman", kind: "player", asset_key: "player:g", label: "Matthew Golden" },
    { transaction_id: "txA", direction: "in", to_user_id: "sf", kind: "player", asset_key: "player:g", label: "Matthew Golden" },
    { transaction_id: "txA", direction: "out", from_user_id: "sf", kind: "player", asset_key: "player:c", label: "CeeDee Lamb" },
    { transaction_id: "txA", direction: "in", to_user_id: "truman", kind: "player", asset_key: "player:c", label: "CeeDee Lamb" },
    { transaction_id: "txA", direction: "out", from_user_id: "sf", kind: "pick", asset_key: "pick:2027:2:1", label: "2027 2nd" },
    { transaction_id: "txA", direction: "in", to_user_id: "truman", kind: "pick", asset_key: "pick:2027:2:1", label: "2027 2nd" },
  ];
  const trades = [{ transaction_id: "txA", date: "2026-08-14", season: "2026", week: 1 }];
  const book = buildTradeWebBook({
    legs,
    trades,
    nameByUser: { truman: "TrumanCooper", sf: "SF69erss" },
    playersNfl: { g: { full_name: "Matthew Golden" }, c: { full_name: "CeeDee Lamb" } },
    picksBook: {
      "pick:2027:2:1": {
        label: "2027 2nd (SF69erss)",
        still_pick: true,
        holder: "TrumanCooper",
        hops: [
          // Receive-day hop from prior owner — must NOT recurse the bag.
          {
            date: "2026-08-14",
            from: "SF69erss",
            to: "TrumanCooper",
            t0: 2787,
            out: 2787,
            exit: "flip",
            transaction_id: "txA",
          },
        ],
      },
    },
    leagueId: "L1",
    asOf: "2026-11-12",
  });
  const golden = book.players.find((p) => p.player_id === "g");
  assert.ok(golden);
  const pick = golden.webs[0].branches.find((b) => String(b.asset_key) === "pick:2027:2:1");
  assert.ok(pick);
  assert.equal(pick.status, "still_pick");
  assert.equal((pick.children || []).length, 0);
  // No recursive CeeDee under the pick.
  assert.ok(!(pick.children || []).some((c) => /CeeDee/i.test(c.label || "")));
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
  assert.equal(book.v, 2);
  const golden = book.players.find((p) => p.player_id === "g");
  assert.ok(golden);
  assert.equal(golden.n_exits, 1);
  assert.equal(golden.webs[0].branches.length, 3);
});
