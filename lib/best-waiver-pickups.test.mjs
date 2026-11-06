import assert from "node:assert/strict";
import {
  buildBestWaiverPickupsBook,
  extractPickups,
  firstLeagueEntries,
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
    // Drafted first, later waiver — original-only out; any-claim in.
    { type: "waiver", date: "2022-09-01", season: "2022", transaction_id: "t4",
      adds: { "400": 5 } },
  ];
  const draftPicks = [
    { player_id: "400", as_of: "2022-05-01", season: "2022" },
  ];
  const orig = extractPickups(moves, draftPicks, { originalOnly: true });
  assert.equal(orig.length, 2);
  assert.equal(orig[0].player_id, "100");
  assert.equal(orig[1].type, "free_agent");
  assert.ok(!orig.some((l) => l.player_id === "400"));

  const any = extractPickups(moves, draftPicks, { originalOnly: false });
  assert.ok(any.some((l) => l.player_id === "400"));
  assert.ok(any.length >= 3);
}

{
  const draftPicks = [{ player_id: "1", as_of: "2021-05-01", season: "2021" }];
  const moves = [
    { type: "waiver", date: "2021-09-01", season: "2021", created: 2, adds: { "1": 2 } },
    { type: "free_agent", date: "2020-08-01", season: "2020", created: 1, adds: { "2": 3 } },
  ];
  const first = firstLeagueEntries(moves, draftPicks);
  assert.equal(first.get("1").source, "draft");
  assert.equal(first.get("2").source, "free_agent");
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
    { asset_key: "player:12", as_of: "2020-01-01", value: 20 },
    { asset_key: "player:12", as_of: "2021-01-01", value: 100 },
    { asset_key: "player:12", as_of: "2025-01-01", value: 5000 },
  ];
  const moves = [
    { type: "waiver", date: "2020-06-01", season: "2020", transaction_id: "a",
      adds: { "10": 1 } },
    { type: "free_agent", date: "2020-07-01", season: "2020", transaction_id: "b",
      adds: { "11": 2 } },
    // Drafted May 2020, waiver later — original out; any-claim in (huge lift).
    { type: "waiver", date: "2021-09-01", season: "2021", transaction_id: "c",
      adds: { "12": 3 } },
  ];
  const draftPicks = [
    { player_id: "12", as_of: "2020-05-01", season: "2020" },
  ];
  const seatBy = new Map([
    ["2020:1", { user_id: "u1", name: "Alice" }],
    ["2020:2", { user_id: "u2", name: "Bob" }],
    ["2021:3", { user_id: "u3", name: "Cara" }],
  ]);
  const nameById = new Map([["10", "Star A"], ["11", "Peak B"], ["12", "Reclaim C"]]);
  const book = buildBestWaiverPickupsBook({
    leagueId: "1",
    formatKey: "2qb",
    curve,
    moves,
    draftPicks,
    nameById,
    seatBy,
    topN: 10,
  });
  assert.equal(book.v, 3);
  assert.equal(book.to_today[0].player, "Star A");
  assert.equal(book.to_today[0].delta, 850); // 900-50
  assert.ok(!book.to_today.some((r) => r.player_id === "12"));
  assert.ok(!book.to_peak.some((r) => r.player_id === "12"));
  assert.equal(book.to_peak[1].player, "Peak B");
  assert.equal(book.to_peak[1].delta, 660);
  // Any claim → today includes the drafted-then-waived skyrocket.
  assert.equal(book.to_today_any[0].player, "Reclaim C");
  assert.equal(book.to_today_any[0].delta, 4900); // 5000-100 at waiver date
  assert.equal(book.to_today_any[0].picker, "Cara");
  assert.match(book.rule.any_claim, /reclamations/i);
}

console.log(JSON.stringify({ ok: true, lib: "best-waiver-pickups" }));
