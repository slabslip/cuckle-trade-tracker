import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArchetypesBook,
  buildSeasonArcsBook,
  classifyArc,
  cumPfByWeek,
  originFromPickLabel,
  pickArchetype,
  rankMap,
} from "./lib/season-arcs.mjs";

test("classifyArc slow burn / fade", () => {
  assert.equal(classifyArc(8, 3, 10), "slow_burn");
  assert.equal(classifyArc(2, 9, 10), "fast_fade");
  assert.equal(classifyArc(5, 5, 10), "steady");
});

test("cumPf + rank", () => {
  const scores = [
    { season: "2025", week: 1, phase: "regular", user_id: "a", points: 100 },
    { season: "2025", week: 2, phase: "regular", user_id: "a", points: 50 },
    { season: "2025", week: 1, phase: "regular", user_id: "b", points: 80 },
    { season: "2025", week: 2, phase: "regular", user_id: "b", points: 90 },
  ];
  const totals = cumPfByWeek(scores, "2025", 4);
  assert.equal(totals.get("a"), 150);
  assert.equal(totals.get("b"), 170);
  const ranks = rankMap(totals);
  assert.equal(ranks.get("b"), 1);
  assert.equal(ranks.get("a"), 2);
});

test("originFromPickLabel", () => {
  assert.equal(originFromPickLabel("2027 1st (KingHenryXXVI)"), "KingHenryXXVI");
});

test("buildSeasonArcsBook + proxy", () => {
  const scores = [];
  const rows2025 = [];
  for (let i = 1; i <= 10; i++) {
    const uid = String(i);
    // Seat 1 (Slow) last in early PF, finishes 2nd → slow_burn
    // Seat 2 (Fade) 1st early, finishes 9th → fast_fade
    const pts = i === 1 ? 10 : (i === 2 ? 200 : (100 - i));
    scores.push({ season: "2025", week: 1, phase: "regular", user_id: uid, points: pts });
    scores.push({ season: "2025", week: 2, phase: "regular", user_id: uid, points: pts });
    const place = i === 1 ? 2 : (i === 2 ? 9 : (i === 3 ? 1 : i));
    rows2025.push({
      user_id: uid,
      name: i === 1 ? "Slow" : (i === 2 ? "Fade" : ("T" + i)),
      place,
    });
  }
  const book = buildSeasonArcsBook({
    scores,
    standings: [{ season: "2025", rows: rows2025 }],
    trades: [
      { season: "2025", week: 2, transaction_id: "t1", user_ids: ["1"] },
    ],
    tradeLegs: [
      { transaction_id: "t1", kind: "player", direction: "in", to_user_id: "1" },
    ],
    members: rows2025.map((r) => ({ user_id: r.user_id, name: r.name })),
    picks: {
      "pick:2027:1:1": {
        label: "2027 1st (Slow)",
        still_pick: true,
        holder: "Fade",
      },
      "pick:2027:1:2": {
        label: "2027 1st (Fade)",
        still_pick: true,
        holder: "Fade",
      },
    },
    projSeats: [
      { name: "Slow", band: "Late", proj_finish: 2, place_now: 2, delta_place: 1 },
      { name: "Fade", band: "Early", proj_finish: 9, place_now: 8, delta_place: -1 },
    ],
    teams: 10,
    liveSeason: 2026,
    soonestPickYear: 2027,
  });
  assert.equal(book.seasons.length, 1);
  const slowSeason = book.seasons[0].seats.find((s) => s.name === "Slow");
  assert.equal(slowSeason.arc, "slow_burn");
  assert.equal(slowSeason.early_trades_n, 1);
  assert.ok(slowSeason.bought_players_early > 0);
  const fadeSeason = book.seasons[0].seats.find((s) => s.name === "Fade");
  assert.equal(fadeSeason.arc, "fast_fade");

  const fade = book.seats.find((s) => s.name === "Fade");
  assert.equal(fade.owned_own_first, true);
  const slow = book.seats.find((s) => s.name === "Slow");
  assert.equal(slow.owned_own_first, false);
  assert.equal(slow.proxy_motive, false);

  const arch = pickArchetype({
    n: 3,
    slow_burn_rate: 0.7,
    fast_fade_rate: 0,
    bubble_rate: 0,
    proxy_motive: true,
    held_firsts: 1,
    live_band: "Mid",
  }, "Win-now");
  assert.equal(arch.id, "proxy_contender");

  const book2 = buildSeasonArcsBook({
    scores: [],
    standings: [{
      season: "2025",
      rows: [
        { user_id: "1", name: "Proxy", place: 4 },
        { user_id: "2", name: "Tank", place: 10 },
      ],
    }],
    trades: [],
    tradeLegs: [],
    members: [
      { user_id: "1", name: "Proxy" },
      { user_id: "2", name: "Tank" },
    ],
    picks: {
      "pick:2027:1:9": {
        label: "2027 1st (Tank)",
        still_pick: true,
        holder: "Proxy",
      },
      "pick:2027:1:4": {
        label: "2027 1st (Proxy)",
        still_pick: true,
        holder: "Tank",
      },
    },
    projSeats: [
      { name: "Proxy", band: "Mid", proj_finish: 4, place_now: 4, delta_place: 0 },
      { name: "Tank", band: "Early", proj_finish: 10, place_now: 10, delta_place: 0 },
    ],
    teams: 10,
    liveSeason: 2026,
    soonestPickYear: 2027,
  });
  const proxy = book2.seats.find((s) => s.name === "Proxy");
  assert.equal(proxy.proxy_motive, true);
  assert.equal(proxy.owned_own_first, false);
  assert.ok(proxy.held_early_others >= 1);

  const archBook = buildArchetypesBook(book2, {
    seats: [{ seat_user_id: "2", label: "Hard rebuild" }],
  });
  const p = archBook.seats.find((s) => s.name === "Proxy");
  assert.equal(p.archetype, "proxy_contender");
});
