import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBiggestChokerBook,
  scorePlayoffMiss,
  scoreTitleLoss,
} from "./biggest-choker.mjs";

test("scorePlayoffMiss rewards late lock then miss", () => {
  const late = scorePlayoffMiss({
    place_w4: 4,
    place_w8: 4,
    place_final: 7,
    delta_early_final: -3,
  }, 6);
  const earlyOnly = scorePlayoffMiss({
    place_w4: 4,
    place_w8: 8,
    place_final: 7,
    delta_early_final: -3,
  }, 6);
  assert.ok(late && late.kind === "playoff_miss");
  assert.ok(earlyOnly && earlyOnly.score < late.score);
  assert.equal(scorePlayoffMiss({
    place_w4: 3,
    place_w8: 5,
    place_final: 6,
    delta_early_final: -3,
  }, 6), null);
});

test("scoreTitleLoss needs favorite credentials", () => {
  const title = {
    season: "2023",
    user_id: "champ",
    name: "Champ",
    record: { wins: 8, losses: 6, fpts_rank: 3 },
    final: {
      ok: true,
      opponent: "Favorite",
      opponent_user_id: "fav",
      opponent_record: { wins: 10, losses: 4 },
      champ_points: 200,
      opponent_points: 150,
      margin: 50,
      week: 17,
    },
  };
  const standPack = {
    byUser: new Map([
      ["champ", { user_id: "champ", fpts: 1800, wins: 8, losses: 6 }],
      ["fav", { user_id: "fav", fpts: 2100, wins: 10, losses: 4 }],
    ]),
    ranks: new Map([["fav", 1], ["champ", 3]]),
  };
  const hit = scoreTitleLoss({ title, standPack });
  assert.ok(hit && hit.kind === "title_loss");
  assert.ok(hit.score >= 45);
  assert.equal(
    scoreTitleLoss({
      title: {
        ...title,
        record: { wins: 12, losses: 2, fpts_rank: 1 },
        final: {
          ...title.final,
          opponent_record: { wins: 9, losses: 5 },
        },
      },
      standPack: {
        byUser: standPack.byUser,
        ranks: new Map([["fav", 4], ["champ", 1]]),
      },
    }),
    null,
  );
});

test("buildBiggestChokerBook orders year leaders then fills top 10", () => {
  const arcs = {
    seasons: [
      {
        season: "2025",
        seats: [
          { user_id: "a", name: "A", place_w4: 4, place_w8: 4, place_final: 7, delta_early_final: -3 },
          { user_id: "b", name: "B", place_w4: 5, place_w8: 5, place_final: 8, delta_early_final: -3 },
        ],
      },
      {
        season: "2024",
        seats: [
          { user_id: "c", name: "C", place_w4: 2, place_w8: 2, place_final: 9, delta_early_final: -7 },
        ],
      },
    ],
  };
  const titles = {
    titles: [{
      season: "2023",
      user_id: "champ",
      name: "Champ",
      record: { wins: 8, losses: 6, fpts_rank: 3 },
      final: {
        ok: true,
        opponent: "Truman",
        opponent_user_id: "tru",
        opponent_record: { wins: 10, losses: 4 },
        champ_points: 200,
        opponent_points: 150,
        margin: 50,
        week: 17,
      },
    }],
  };
  const standings = [{
    season: "2023",
    rows: [
      { user_id: "champ", name: "Champ", fpts: 1800, wins: 8, losses: 6, place: 1 },
      { user_id: "tru", name: "Truman", fpts: 2100, wins: 10, losses: 4, place: 2 },
    ],
  }];
  const book = buildBiggestChokerBook({
    arcs,
    titles,
    standings,
    playoffTeams: 6,
    topN: 10,
    leagueId: "1",
    asOf: "2026-01-01",
  });
  assert.equal(book.v, 1);
  assert.ok(book.seats.length >= 3);
  assert.ok(book.seats.every((s) => s.rank >= 1 && s.thesis));
  const years = new Set(book.seats.filter((s) => s.year_biggest).map((s) => s.season));
  assert.ok(years.has("2023") && years.has("2024") && years.has("2025"));
  // Year leaders come first.
  const leaders = book.seats.filter((s) => s.year_biggest);
  assert.equal(leaders.length, 3);
  assert.deepEqual(
    book.seats.slice(0, 3).map((s) => s.year_biggest),
    [true, true, true],
  );
});
