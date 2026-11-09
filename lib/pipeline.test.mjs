import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPipelineBook,
  creditForLook,
  pipelineSearchHits,
  scorePipelineSeats,
  stintsFromEvents,
  PIPELINE_SHORT_DAYS,
} from "./pipeline.mjs";

test("stintsFromEvents walks draft → trade → hold", () => {
  const nameById = new Map([
    ["a", "Alpha"],
    ["b", "Beta"],
  ]);
  const stints = stintsFromEvents([
    { date: "2020-05-01", kind: "draft", to: "a", from: null, ord: 1 },
    { date: "2022-08-01", kind: "trade", to: "b", from: "a", ord: 2 },
  ], "2026-11-08", nameById);
  assert.equal(stints.length, 2);
  assert.equal(stints[0].name, "Alpha");
  assert.equal(stints[0].exit, "trade");
  assert.equal(stints[0].days, (Date.parse("2022-08-01") - Date.parse("2020-05-01")) / 86400000);
  assert.equal(stints[1].name, "Beta");
  assert.equal(stints[1].exit, "held");
  assert.equal(stints[1].acquire, "trade");
});

test("scorePipelineSeats weeds out short flippers", () => {
  const stints = [
    {
      user_id: "finder", name: "Finder", start: "2022-05-01", end: "2026-11-01",
      days: 1645, acquire: "fa", exit: "held", short: false,
    },
    {
      user_id: "flip", name: "Flip", start: "2023-09-01", end: "2023-09-10",
      days: 9, acquire: "trade", exit: "trade", short: true,
    },
    {
      user_id: "flip", name: "Flip", start: "2024-01-01", end: "2024-01-05",
      days: 4, acquire: "trade", exit: "drop", short: true,
    },
  ];
  const { seats } = scorePipelineSeats(stints, () => ({ value: 1000 }));
  const finder = seats.find((s) => s.user_id === "finder");
  const flip = seats.find((s) => s.user_id === "flip");
  assert.ok(finder);
  assert.ok(flip);
  assert.ok(finder.score > flip.score);
  assert.equal(flip.score, 0); // pure short flips, not first owner
  assert.equal(finder.is_first, true);
});

test("buildPipelineBook + search + credit looks", () => {
  const book = buildPipelineBook({
    leagueId: "L1",
    asOf: "2026-11-08",
    members: [
      { user_id: "1", canonical_name: "ARae" },
      { user_id: "2", canonical_name: "TrumanCooper" },
    ],
    draftPicks: [
      {
        player_id: "100",
        label: "Puka Nacua",
        drafted_by_user_id: "1",
        as_of: "2023-05-01",
        draft_id: "d1",
      },
    ],
    tradeLegs: [
      {
        transaction_id: "t1", direction: "out", kind: "player",
        asset_key: "player:100", label: "Puka Nacua",
        from_user_id: "1",
      },
      {
        transaction_id: "t1", direction: "in", kind: "player",
        asset_key: "player:100", label: "Puka Nacua",
        to_user_id: "2",
      },
    ],
    trades: [{ transaction_id: "t1", date: "2024-06-01" }],
    moves: [],
    seats: [
      { season: "2023", roster_id: 1, owner_id: "1" },
      { season: "2024", roster_id: 2, owner_id: "2" },
    ],
    rostersNow: [{ owner_id: "2", players: ["100"] }],
    curve: [
      { asset_key: "player:100", as_of: "2023-05-01", value: 500 },
      { asset_key: "player:100", as_of: "2024-06-01", value: 4000 },
      { asset_key: "player:top", as_of: "2023-05-01", value: 10000 },
      { asset_key: "player:top", as_of: "2024-06-01", value: 10000 },
    ],
    nameHints: [{ sleeper_id: "100", name: "Puka Nacua" }],
  });
  assert.equal(book.v, 1);
  assert.equal(book.players.length, 1);
  const p = book.players[0];
  assert.equal(p.name, "Puka Nacua");
  assert.ok(p.stints.length >= 2);
  assert.equal(p.facts.first_owned.name, "ARae");
  assert.equal(p.facts.pipeline.name, "ARae"); // discoverer beats later longer hold
  assert.equal(creditForLook(p.facts, "first").name, "ARae");
  assert.equal(creditForLook(p.facts, "longest").name, "TrumanCooper");
  assert.equal(creditForLook(p.facts, "paid").name, "TrumanCooper");
  const hits = pipelineSearchHits(book, "puka");
  assert.equal(hits.length, 1);
  assert.ok(PIPELINE_SHORT_DAYS === 21);
});
