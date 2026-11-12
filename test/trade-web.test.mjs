import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTradeWebBook,
  buildTradeWebRoot,
  buildAssetCareerWeb,
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
  { transaction_id: "tx1", direction: "out", from_user_id: "truman", kind: "player", asset_key: "player:g", label: "Matthew Golden" },
  { transaction_id: "tx1", direction: "in", to_user_id: "sf", kind: "player", asset_key: "player:g", label: "Matthew Golden" },
  { transaction_id: "tx1", direction: "out", from_user_id: "sf", kind: "player", asset_key: "player:r", label: "Calvin Ridley" },
  { transaction_id: "tx1", direction: "in", to_user_id: "truman", kind: "player", asset_key: "player:r", label: "Calvin Ridley" },
  { transaction_id: "tx1", direction: "out", from_user_id: "sf", kind: "player", asset_key: "player:b", label: "Chris Bell" },
  { transaction_id: "tx1", direction: "in", to_user_id: "truman", kind: "player", asset_key: "player:b", label: "Chris Bell" },
  { transaction_id: "tx1", direction: "out", from_user_id: "sf", kind: "pick", asset_key: "pick:2029:2:5", label: "2029 2nd" },
  { transaction_id: "tx1", direction: "in", to_user_id: "truman", kind: "pick", asset_key: "pick:2029:2:5", label: "2029 2nd" },
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
  { asset_key: "player:g", as_of: "2026-11-12", value: 2200 },
  { asset_key: "player:top", as_of: "2026-10-01", value: 10000 },
  { asset_key: "player:top", as_of: "2026-11-03", value: 10000 },
  { asset_key: "player:top", as_of: "2026-11-12", value: 10000 },
  { asset_key: "pickval:2029:2:Mid", as_of: "2026-10-01", value: 400 },
  { asset_key: "pickval:2029:4:Mid", as_of: "2026-11-03", value: 150 },
];

const PICKS = {
  "pick:2029:2:5": { label: "2029 2nd", still_pick: true, holder: "TrumanCooper", hops: [] },
  "pick:2029:4:2": { label: "2029 4th", still_pick: true, holder: "TrumanCooper", hops: [] },
};

test("Golden career web follows him to SF and packages Ridley flip", () => {
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
    picksBook: PICKS,
    moves: [],
    asOf: "2026-11-12",
  });
  assert.equal(web.seat, "TrumanCooper");
  assert.ok(web.root_node);
  assert.equal(web.root_node.status, "traded");
  assert.equal(web.root_node.exit.to, "SF69erss");
  const kids = web.root_node.children || [];
  const ridley = kids.find((b) => b.label === "Calvin Ridley");
  const bell = kids.find((b) => b.label === "Chris Bell");
  const spine = kids.find((b) => b.role === "spine" && b.asset_key === "player:g");
  assert.ok(ridley);
  assert.equal(ridley.status, "traded");
  assert.equal(ridley.children.length, 1);
  assert.equal(ridley.children[0].label, "2029 4th");
  assert.equal(bell.status, "held");
  assert.ok(spine);
  assert.equal(spine.seat, "SF69erss");
  assert.match(web.thesis, /Matthew Golden/);
  const g = webToGraph(web);
  assert.ok(g.nodes.length >= 5);
});

test("career web is league-wide — not truncated at depth 2", () => {
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
    picksBook: PICKS,
  });
  assert.equal(book.v, 3);
  const golden = book.players.find((p) => p.player_id === "g");
  assert.ok(golden);
  assert.equal(golden.webs.length, 1);
  const web = golden.webs[0];
  assert.ok(web.origin && web.now);
  assert.ok(web.root_node);
  // Ridley flip child must survive slim depth
  function find(node, name) {
    if (!node) return null;
    if (node.label === name) return node;
    for (const c of node.children || []) {
      const hit = find(c, name);
      if (hit) return hit;
    }
    return null;
  }
  const ridley = find(web.root_node, "Calvin Ridley");
  assert.ok(ridley);
  assert.ok((ridley.children || []).some((c) => /4th/i.test(c.label)));
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
        hops: [{
          date: "2026-08-14",
          from: "SF69erss",
          to: "TrumanCooper",
          t0: 2787,
          out: 2787,
          exit: "flip",
          transaction_id: "txA",
        }],
      },
    },
    leagueId: "L1",
    asOf: "2026-11-12",
  });
  const golden = book.players.find((p) => p.player_id === "g");
  assert.ok(golden);
  function find(node, pred) {
    if (!node) return null;
    if (pred(node)) return node;
    for (const c of node.children || []) {
      const hit = find(c, pred);
      if (hit) return hit;
    }
    return null;
  }
  const pick = find(golden.webs[0].root_node, (n) => n.asset_key === "pick:2027:2:1");
  assert.ok(pick);
  assert.equal(pick.status, "still_pick");
  // Must not recurse CeeDee under the pick.
  assert.equal((pick.children || []).length, 0);
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
  assert.equal(book.v, 3);
  const golden = book.players.find((p) => p.player_id === "g");
  assert.ok(golden);
  assert.equal(golden.webs.length, 1);
  assert.ok(golden.webs[0].root_node);
});
