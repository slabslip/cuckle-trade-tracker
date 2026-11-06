import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCornerstoneTradesBook,
  scoreCornerstoneAssets,
  tradeT0Packages,
} from "./cornerstone-trades.mjs";

function side(name, uid, legs) {
  return {
    name,
    t0: legs.reduce((a, l) => a + l.value, 0),
    t0_delta: 0,
    t0_legs: legs,
    legs: [],
    sent: [],
  };
}

function trade(tid, date, sides) {
  return {
    transaction_id: tid,
    date,
    season: date.slice(0, 4),
    week: 1,
    names: Object.values(sides).map((s) => s.name),
    user_ids: Object.keys(sides),
    lenses: { realized: { sides } },
  };
}

test("tradeT0Packages reads realized t0_legs", () => {
  const t = trade("1", "2025-09-04", {
    a: side("Alpha", "a", [
      { label: "CeeDee Lamb", kind: "player", asset_key: "player:1", value: 8518 },
    ]),
    b: side("Beta", "b", [
      { label: "Christian McCaffrey", kind: "player", asset_key: "player:2", value: 3197 },
      { label: "2028 1st", kind: "pick", asset_key: "pick:2028:1:1", value: 1958 },
    ]),
  });
  const pack = tradeT0Packages(t);
  assert.equal(pack.sides.length, 2);
  assert.equal(pack.assets.length, 3);
  assert.equal(pack.assets[0].to_name, "Alpha");
});

test("scoreCornerstoneAssets keeps players only and dedupes by highest t0", () => {
  const low = trade("low", "2026-01-01", {
    a: side("A", "a", [
      { label: "Justin Jefferson", kind: "player", asset_key: "player:jj", value: 7000 },
    ]),
    b: side("B", "b", [
      { label: "Depth", kind: "player", asset_key: "player:x", value: 400 },
    ]),
  });
  const high = trade("high", "2026-08-14", {
    a: side("A", "a", [
      { label: "Justin Jefferson", kind: "player", asset_key: "player:jj", value: 7934 },
    ]),
    b: side("C", "c", [
      { label: "2027 1st", kind: "pick", asset_key: "pick:2027:1:1", value: 9000 },
    ]),
  });
  const scored = scoreCornerstoneAssets([low, high]);
  assert.equal(scored.length, 2);
  const jj = scored.find((r) => r.asset_key === "player:jj");
  assert.ok(jj);
  assert.equal(jj.value, 7934);
  assert.equal(jj.transaction_id, "high");
  assert.ok(!scored.some((r) => r.kind === "pick"));
});

test("buildCornerstoneTradesBook ranks top N by t0 value", () => {
  const trades = [];
  for (let i = 0; i < 12; i++) {
    trades.push(trade(`t${i}`, `2024-0${(i % 9) + 1}-01`, {
      a: side("A", "a", [
        {
          label: `Star ${i}`,
          kind: "player",
          asset_key: `player:${i}`,
          value: 1000 + i * 100,
        },
      ]),
      b: side("B", "b", [
        { label: "Filler", kind: "player", asset_key: `player:f${i}`, value: 50 },
      ]),
    }));
  }
  const book = buildCornerstoneTradesBook({
    leagueId: "L1",
    asOf: "2026-11-06",
    trades,
    topN: 10,
  });
  assert.equal(book.v, 1);
  assert.equal(book.pricing, "trade_meter_t0");
  assert.equal(book.trades.length, 10);
  assert.equal(book.trades[0].asset, "Star 11");
  assert.equal(book.trades[0].value, 2100);
  assert.equal(book.trades[0].rank, 1);
  assert.ok(book.trades[0].sides.length >= 2);
  assert.ok(book.trades[0].from_names.includes("B"));
});
