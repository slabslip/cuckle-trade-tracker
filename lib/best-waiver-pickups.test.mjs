import assert from "node:assert/strict";
import {
  buildBestWaiverPickupsBook,
  extractPickups,
  indexCurve,
  peakAfterPickup,
  playerValue,
} from "./best-waiver-pickups.mjs";

{
  const moves = [
    { type: "waiver", date: "2021-09-14", season: "2021", week: 1, transaction_id: "t1",
      adds: { "100": 3 }, drops: { "9": 3 } },
    { type: "free_agent", date: "2022-01-01", season: "2021", week: 16, transaction_id: "t2",
      adds: { "200": 1 } },
    { type: "commissioner", date: "2022-02-01", season: "2021", adds: { "300": 2 } },
    { type: "waiver", date: "2022-03-01", season: "2022", transaction_id: "t3", adds: {} },
  ];
  const legs = extractPickups(moves);
  assert.equal(legs.length, 2);
  assert.equal(legs[0].player_id, "100");
  assert.equal(legs[0].roster_id, 3);
  assert.equal(legs[1].type, "free_agent");
}

{
  const curve = [
    { asset_key: "player:1", as_of: "2021-01-01", value: 100 },
    { asset_key: "player:1", as_of: "2022-01-01", value: 500 },
    { asset_key: "player:1", as_of: "2023-01-01", value: 800 },
    { asset_key: "player:1", as_of: "2024-01-01", value: 600 },
  ];
  const idx = indexCurve(curve);
  assert.equal(playerValue(idx, "player:1", "2021-06-01").value, 100);
  assert.equal(playerValue(idx, "player:1", "2023-06-01").value, 800);
  const peak = peakAfterPickup(idx, "player:1", "2022-01-01");
  assert.equal(peak.value, 800);
  assert.equal(peak.as_of, "2023-01-01");
}

{
  const curve = [
    { asset_key: "player:10", as_of: "2020-01-01", value: 50 },
    { asset_key: "player:10", as_of: "2021-01-01", value: 200 },
    { asset_key: "player:10", as_of: "2025-01-01", value: 900 },
    { asset_key: "player:11", as_of: "2020-01-01", value: 40 },
    { asset_key: "player:11", as_of: "2022-01-01", value: 700 },
    { asset_key: "player:11", as_of: "2025-01-01", value: 300 },
  ];
  const moves = [
    { type: "waiver", date: "2020-06-01", season: "2020", transaction_id: "a",
      adds: { "10": 1 } },
    { type: "free_agent", date: "2020-07-01", season: "2020", transaction_id: "b",
      adds: { "11": 2 } },
  ];
  const seatBy = new Map([
    ["2020:1", { user_id: "u1", name: "Alice" }],
    ["2020:2", { user_id: "u2", name: "Bob" }],
  ]);
  const nameById = new Map([["10", "Star A"], ["11", "Peak B"]]);
  const book = buildBestWaiverPickupsBook({
    leagueId: "1",
    formatKey: "2qb",
    curve,
    moves,
    nameById,
    seatBy,
    topN: 10,
  });
  assert.equal(book.v, 1);
  assert.equal(book.to_today[0].player, "Star A");
  assert.equal(book.to_today[0].delta, 850); // 900-50
  assert.equal(book.to_today[0].picker, "Alice");
  // Star A also wins peak (800+ lift); Peak B is #2 on peak-only ride.
  assert.equal(book.to_peak[0].player, "Star A");
  assert.equal(book.to_peak[0].delta, 850); // 900-50
  assert.equal(book.to_peak[1].player, "Peak B");
  assert.equal(book.to_peak[1].delta, 660); // 700-40
  assert.equal(book.to_peak[1].peak_as_of, "2022-01-01");
}

console.log(JSON.stringify({ ok: true, lib: "best-waiver-pickups" }));
