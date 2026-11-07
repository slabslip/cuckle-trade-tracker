import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCornerstoneTradesBook,
  flatten,
  pricePlayerAt,
  indexCurve,
  indexVmax,
  rawAtOrBefore,
  scoreCornerstoneAssets,
  tradeDayPackages,
  tradeT0Packages,
} from "./cornerstone-trades.mjs";

function side(name, uid, legs) {
  return {
    name,
    t0: legs.reduce((a, l) => a + (l.value || 0), 0),
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

function curveRows(entries) {
  // entries: [{key, as_of, value}]
  return entries.map((e) => ({
    asset_key: e.key,
    as_of: e.as_of,
    value: e.value,
    provider: "dynastyprocess",
    format_key: "2qb",
  }));
}

test("tradeT0Packages reads realized t0_legs structure", () => {
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

test("rawAtOrBefore never uses first_snap after the trade date", () => {
  const curve = curveRows([
    { key: "player:adams", as_of: "2020-04-30", value: 8164 },
    { key: "player:adams", as_of: "2020-05-29", value: 8058 },
  ]);
  const idx = indexCurve(curve);
  assert.equal(rawAtOrBefore(idx, "player:adams", "2019-10-30"), null);
  assert.equal(rawAtOrBefore(idx, "player:adams", "2020-04-30").value, 8164);
});

test("pricePlayerAt applies calculator flatten at trade day", () => {
  const curve = curveRows([
    { key: "player:jj", as_of: "2026-07-31", value: 8051 },
    { key: "player:top", as_of: "2026-07-31", value: 10208 },
  ]);
  const idx = indexCurve(curve);
  const vmax = indexVmax(curve);
  const priced = pricePlayerAt(idx, vmax, "player:jj", "2026-08-14");
  assert.ok(priced);
  assert.equal(priced.raw, 8051);
  assert.equal(priced.value, flatten(8051, 10208));
  // Lookback-inflated meter value must not win.
  assert.notEqual(priced.value, 7934);
});

test("scoreCornerstoneAssets uses day-of flatten and skips unpriced history", () => {
  const curve = curveRows([
    { key: "player:jj", as_of: "2026-01-01", value: 6000 },
    { key: "player:jj", as_of: "2026-07-31", value: 8051 },
    { key: "player:top", as_of: "2026-01-01", value: 10000 },
    { key: "player:top", as_of: "2026-07-31", value: 10208 },
    { key: "player:x", as_of: "2026-01-01", value: 400 },
    // Adams only appears after his trade — must not score.
    { key: "player:adams", as_of: "2020-04-30", value: 8164 },
  ]);
  const idx = indexCurve(curve);
  const vmax = indexVmax(curve);

  const low = trade("low", "2026-01-01", {
    a: side("A", "a", [
      { label: "Justin Jefferson", kind: "player", asset_key: "player:jj", value: 9999 },
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
  const ghost = trade("ghost", "2019-10-30", {
    a: side("Tips", "t", [
      { label: "Davante Adams", kind: "player", asset_key: "player:adams", value: 8164 },
    ]),
    b: side("Ted", "e", [
      { label: "Filler", kind: "player", asset_key: "player:x", value: 10 },
    ]),
  });

  const scored = scoreCornerstoneAssets([low, high, ghost], idx, vmax);
  assert.ok(!scored.some((r) => r.asset_key === "player:adams"));
  const jj = scored.find((r) => r.asset_key === "player:jj");
  assert.ok(jj);
  assert.equal(jj.transaction_id, "high");
  assert.equal(jj.value, flatten(8051, 10208));
  assert.ok(!scored.some((r) => r.kind === "pick"));

  const pack = tradeDayPackages(high, idx, vmax);
  const jjLeg = pack.assets.find((a) => a.asset_key === "player:jj");
  assert.equal(jjLeg.value, flatten(8051, 10208));
});

test("buildCornerstoneTradesBook ranks top N by day-of flatten", () => {
  const curve = [];
  for (let i = 0; i < 12; i++) {
    curve.push({ asset_key: `player:${i}`, as_of: "2024-01-01", value: 1000 + i * 100 });
    curve.push({ asset_key: `player:f${i}`, as_of: "2024-01-01", value: 50 });
  }
  curve.push({ asset_key: "player:top", as_of: "2024-01-01", value: 10000 });

  const trades = [];
  for (let i = 0; i < 12; i++) {
    trades.push(trade(`t${i}`, `2024-0${(i % 9) + 1}-01`, {
      a: side("A", "a", [
        {
          label: `Star ${i}`,
          kind: "player",
          asset_key: `player:${i}`,
          value: 99999, // meter noise — must be ignored
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
    curve,
    topN: 10,
  });
  assert.equal(book.v, 2);
  assert.equal(book.pricing, "trade_day_flatten");
  assert.equal(book.trades.length, 10);
  assert.equal(book.trades[0].asset, "Star 11");
  assert.equal(book.trades[0].value, flatten(2100, 10000));
  assert.ok(book.trades[0].from_names.includes("B"));
});
