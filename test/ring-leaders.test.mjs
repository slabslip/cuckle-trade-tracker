import test from "node:test";
import assert from "node:assert/strict";
import { buildRingLeadersBook } from "../lib/ring-leaders.mjs";

test("buildRingLeadersBook ranks by rings and lists teams", () => {
  const book = buildRingLeadersBook({
    credits: [
      { player_id: "1", player: "Ace", season: "2025", team: "SF69erss" },
      { player_id: "1", player: "Ace", season: "2024", team: "SF69erss" },
      { player_id: "1", player: "Ace", season: "2024", team: "SF69erss" }, // dup season ignored
      { player_id: "2", player: "Bee", season: "2023", team: "TedCumberbatch" },
      { player_id: "3", player: "Cee", season: "2021", team: "ARae" },
      { player_id: "3", player: "Cee", season: "2020", team: "ARae" },
      { player_id: "3", player: "Cee", season: "2019", team: "ARae" },
    ],
    topN: 25,
    leagueId: "L1",
    nTitles: 7,
  });
  assert.equal(book.v, 1);
  assert.equal(book.players[0].player, "Cee");
  assert.equal(book.players[0].rings, 3);
  assert.deepEqual(book.players[0].teams, ["ARae"]);
  assert.equal(book.players[1].player, "Ace");
  assert.equal(book.players[1].rings, 2);
  assert.equal(book.players[1].titles.length, 2);
  assert.equal(book.players.length, 3);
});

test("topN truncates", () => {
  const credits = [];
  for (let i = 0; i < 30; i++) {
    credits.push({ player_id: String(i), player: "P" + i, season: "2025", team: "T" });
  }
  const book = buildRingLeadersBook({ credits, topN: 25 });
  assert.equal(book.players.length, 25);
  assert.equal(book.players[24].rank, 25);
});
