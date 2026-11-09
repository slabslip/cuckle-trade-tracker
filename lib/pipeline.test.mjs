import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPipelineBook,
  creditForLook,
  pipelineSearchHits,
  pipelinePosList,
  attachPosSeasonRanks,
  scorePipelineSeats,
  stintsFromEvents,
  PIPELINE_SHORT_DAYS,
  PIPELINE_BOOK_V,
  PIPELINE_W_USE,
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
  const { seats } = scorePipelineSeats(stints, () => ({ value: 1000 }), {
    byUser: new Map([["finder", 40]]),
    first: { user_id: "finder" },
    max: 40,
  });
  const finder = seats.find((s) => s.user_id === "finder");
  const flip = seats.find((s) => s.user_id === "flip");
  assert.ok(finder);
  assert.ok(flip);
  assert.ok(finder.score > flip.score);
  assert.equal(flip.score, 0); // pure short flips, not first owner, no starts
  assert.equal(finder.is_first, true);
  assert.ok(finder.starts === 40);
  assert.ok(PIPELINE_W_USE === 0.5);
});

test("belief: starter beats bench-stash discoverer", () => {
  const stints = [
    {
      user_id: "stash", name: "Stash", start: "2022-05-01", end: "2024-06-01",
      days: 700, acquire: "fa", exit: "trade", short: false,
    },
    {
      user_id: "believer", name: "Believer", start: "2024-06-01", end: "2026-11-01",
      days: 500, acquire: "trade", exit: "held", short: false,
    },
  ];
  const { seats } = scorePipelineSeats(stints, () => ({ value: 2000 }), {
    byUser: new Map([["believer", 30], ["stash", 0]]),
    first: { user_id: "believer" },
    max: 30,
  });
  const stash = seats.find((s) => s.user_id === "stash");
  const believer = seats.find((s) => s.user_id === "believer");
  assert.ok(believer.score > stash.score, `believer ${believer.score} vs stash ${stash.score}`);
  assert.equal(stash.starts, 0);
  assert.ok(stash.bench_pen < 1);
  assert.ok(believer.is_first_starter);
});

test("buildPipelineBook + search + credit looks + starts", () => {
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
    playerStarts: {
      by_player: {
        "player:100": {
          starts_by_user: { "1": 25, "2": 40 },
          first_start: { user_id: "1", season: "2023", week: 1 },
          n_starts: 65,
        },
      },
    },
  });
  assert.equal(book.v, PIPELINE_BOOK_V);
  assert.equal(book.players.length, 1);
  const p = book.players[0];
  assert.equal(p.name, "Puka Nacua");
  assert.ok(p.stints.length >= 2);
  assert.equal(p.facts.first_owned.name, "ARae");
  assert.ok(p.facts.most_started);
  assert.equal(p.facts.most_started.name, "TrumanCooper");
  assert.equal(p.facts.first_started.name, "ARae");
  // ARae found + first-started them; Truman started more — either can win, but both score.
  assert.ok(p.facts.pipeline);
  assert.ok(p.facts.pipeline.starts > 0);
  assert.ok(/started/.test(p.facts.pipeline.because));
  assert.equal(creditForLook(p.facts, "first").name, "ARae");
  assert.equal(creditForLook(p.facts, "longest").name, "TrumanCooper");
  assert.equal(creditForLook(p.facts, "paid").name, "TrumanCooper");
  const hits = pipelineSearchHits(book, "puka");
  assert.equal(hits.length, 1);
  assert.ok(PIPELINE_SHORT_DAYS === 21);
  assert.ok(/0\.50 starts/.test(book.rule.metric));
});

test("pos season ranks order by fantasy pts", () => {
  const players = [
    { sleeper_id: "a", name: "Alpha WR", asset_key: "player:a" },
    { sleeper_id: "b", name: "Beta WR", asset_key: "player:b" },
    { sleeper_id: "c", name: "Gamma QB", asset_key: "player:c" },
  ];
  attachPosSeasonRanks(players, {
    season: 2026,
    nfl: {
      a: { position: "WR" },
      b: { position: "WR" },
      c: { position: "QB" },
    },
    stats: {
      a: { pts_ppr: 80, gp: 8 },
      b: { pts_ppr: 120, gp: 8 },
      c: { pts_ppr: 200, gp: 8 },
    },
  });
  assert.equal(players.find((p) => p.sleeper_id === "b").pos_rank, 1);
  assert.equal(players.find((p) => p.sleeper_id === "a").pos_rank, 2);
  assert.equal(players.find((p) => p.sleeper_id === "c").pos_rank, 1);
  const book = { players };
  const wr = pipelinePosList(book, "WR");
  assert.equal(wr[0].name, "Beta WR");
  assert.equal(pipelineSearchHits(book, "alph", 5, "WR").length, 1);
  assert.equal(pipelineSearchHits(book, "alph", 5, "QB").length, 0);
});
