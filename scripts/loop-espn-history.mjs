#!/usr/bin/env node
/**
 * Multiple passes over ESPN ingest + merge laws.
 * Fixture: 12 franchises, 2020–2024 ESPN, 2025–2026 Sleeper, one parked→new seat.
 * Live book: when cookies have unlocked ESPN, every 2026 roster must carry 2020–2024.
 */
import fs from "node:fs";
import {
  ESPN_HISTORY_YEARS,
  SLEEPER_KEEP_YEARS,
  inheritParkedToLive,
  liveSeatsMissingHistory,
  yearsBySeat,
} from "../lib/espn-history.mjs";
import { buildFinishesBook, remapEspnStanding } from "../lib/finishes.mjs";
import {
  buildBridge,
  buildFranchiseMap,
  resolveEspnScoreUid,
} from "../merge-provider-history.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const ID = "1389723418827460608";
const raw = `${ROOT}data/leagues/${ID}/raw`;
const ui = `${ROOT}data/leagues/${ID}/ui`;
const PASSES = 3;

function load(p, fb) {
  if (!fs.existsSync(p)) return fb;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function loop(n, cond, msg) {
  if (!cond) {
    console.error("HIST " + n + " FAIL: " + msg);
    process.exit(1);
  }
  console.log("HIST " + n + " PASS: " + msg);
}

function fixtureBook() {
  const years = ESPN_HISTORY_YEARS;
  const sleeper = [];
  const espnMembers = [];
  const espnSeats = [];
  const espnStandings = [];
  const espnWeeks = [];
  for (let i = 1; i <= 11; i++) {
    sleeper.push({
      user_id: "s" + i,
      canonical_name: "Seat" + i,
      aliases: [{ name: "Seat" + i }],
    });
    espnMembers.push({
      user_id: "espn:" + i,
      espn_id: String(i),
      canonical_name: "Seat" + i,
      aliases: [{ name: "Seat" + i }],
    });
  }
  sleeper.push({
    user_id: "s-parked",
    canonical_name: "ParkedOwner",
    aliases: [{ name: "ParkedOwner" }],
  });
  sleeper.push({
    user_id: "s-new",
    canonical_name: "NewOwner",
    aliases: [{ name: "NewOwner" }],
  });
  espnMembers.push({
    user_id: "espn:parked",
    espn_id: "parked",
    canonical_name: "ParkedOwner",
    aliases: [{ name: "ParkedOwner" }],
  });

  for (const year of years) {
    for (let team = 1; team <= 12; team++) {
      const owner = team === 12 ? "espn:parked" : "espn:" + team;
      espnSeats.push({
        season: year,
        roster_id: team,
        owner_id: owner,
        team_name: "Club " + team,
      });
      espnStandings.push({
        season: year,
        roster_id: team,
        user_id: owner,
        name: team === 12 ? "ParkedOwner" : "Seat" + team,
        place: team,
      });
      espnWeeks.push({
        season: year,
        roster_id: team,
        user_id: owner,
        points: 80 + team,
        week: 3,
      });
    }
  }

  const sleeperSeats = [];
  for (let i = 1; i <= 11; i++) {
    sleeperSeats.push({ season: "2025", owner_id: "s" + i, roster_id: i });
    sleeperSeats.push({ season: "2026", owner_id: "s" + i, roster_id: i });
  }
  sleeperSeats.push({ season: "2025", owner_id: "s-parked", roster_id: 12 });
  sleeperSeats.push({ season: "2026", owner_id: "s-new", roster_id: 12 });
  sleeperSeats.push({ season: "2027", owner_id: "s-new", roster_id: 12 });
  for (let i = 1; i <= 11; i++) {
    sleeperSeats.push({ season: "2027", owner_id: "s" + i, roster_id: i });
  }

  const person = buildBridge(espnMembers, sleeper, {}, espnSeats);
  const rawMap = buildFranchiseMap(espnSeats, person, {});
  const franchise = inheritParkedToLive(rawMap, sleeperSeats);
  const live2026 = sleeperSeats.filter((s) => s.season === "2026").map((s) => s.owner_id);
  const live2027 = sleeperSeats.filter((s) => s.season === "2027").map((s) => s.owner_id);
  const bySeat = yearsBySeat(espnSeats, franchise);
  const remapped = espnStandings.map((row) => remapEspnStanding(row, person, franchise));
  const finishes = buildFinishesBook({
    sleeperSeasons: [{
      season: "2025",
      rows: sleeperSeats.filter((s) => s.season === "2025").map((s, idx) => ({
        user_id: s.owner_id,
        name: s.owner_id === "s-parked" ? "ParkedOwner" : "Seat" + (idx + 1),
        place: idx + 1,
        season: "2025",
      })),
    }],
    espnStandings: remapped,
    members: sleeper.map((m) => ({ user_id: m.user_id, name: m.canonical_name })),
    leagueId: ID,
    sleeperYears: ["2025"],
  });
  const sleeperWeekYears = new Set(SLEEPER_KEEP_YEARS);
  const mergedWeeks = [
    ...SLEEPER_KEEP_YEARS.flatMap((year) => live2026.map((uid, i) => ({
      season: year,
      user_id: uid,
      points: 90 + i,
      provider: "sleeper",
    }))),
    ...espnWeeks
      .filter((w) => !sleeperWeekYears.has(String(w.season)))
      .map((w) => ({
        ...w,
        user_id: resolveEspnScoreUid(w, person, franchise),
        provider: "espn",
      })),
  ];
  return {
    person,
    rawMap,
    franchise,
    live2026,
    live2027,
    bySeat,
    remapped,
    finishes,
    mergedWeeks,
    espnSeats,
  };
}

function runFixture(pass) {
  const tag = "p" + pass + ".";
  const fx = fixtureBook();
  loop(tag + "1", Object.keys(fx.person).length === 12,
    "12 ESPN people map onto Sleeper names");
  loop(tag + "2", fx.rawMap["12"] === "s-parked",
    "before inherit, team 12 still sits on the parked Sleeper id");
  loop(tag + "3", fx.franchise["12"] === "s-new",
    "one-for-one parked→new moves ESPN team 12 onto this year's Sleeper seat");
  loop(tag + "4", fx.live2026.length === 12 && fx.live2026.includes("s-new") && !fx.live2026.includes("s-parked"),
    "2026 live bag is 12 seats including the new owner");
  loop(tag + "5", liveSeatsMissingHistory(fx.live2026, fx.bySeat).length === 0,
    "every 2026 seat has ESPN 2020-2024");
  loop(tag + "6", liveSeatsMissingHistory(fx.live2027, fx.bySeat).length === 0,
    "2027 keeps the same franchise map — future Sleeper years inherit 2020-2024");
  loop(tag + "7", ESPN_HISTORY_YEARS.every((y) => (fx.finishes.seasons || []).includes(y))
    && (fx.finishes.seasons || []).includes("2025")
    && !(fx.finishes.seasons || []).includes("2026"),
    "finishes list 2020-2024 + 2025 Sleeper; 2026 stays out");
  const newbie = (fx.finishes.seats || []).find((s) => s.user_id === "s-new");
  loop(tag + "8", newbie && newbie.n === 5 && newbie.places.every((p) => ESPN_HISTORY_YEARS.includes(p.season)),
    "new 2026 owner carries the five ESPN places from the inherited franchise");
  const parked = (fx.finishes.seats || []).find((s) => s.user_id === "s-parked");
  loop(tag + "9", parked && parked.n === 1 && parked.places[0].season === "2025",
    "parked 2025 owner keeps Sleeper 2025 only — ESPN years moved with the team");
  loop(tag + "10", fx.mergedWeeks.filter((w) => SLEEPER_KEEP_YEARS.includes(String(w.season)))
    .every((w) => w.provider === "sleeper"),
    "2025-2026 weeks stay Sleeper");
  loop(tag + "11", fx.mergedWeeks.filter((w) => w.provider === "espn")
    .every((w) => !SLEEPER_KEEP_YEARS.includes(String(w.season))),
    "ESPN weeks never write 2025 or 2026");
  loop(tag + "12", fx.mergedWeeks.filter((w) => w.user_id === "s-new" && w.provider === "espn").length === 5,
    "inherited seat has one ESPN sample week per history year");
}

function runLive() {
  const espn = load(`${raw}/espn_status.json`, {});
  const bridge = load(`${raw}/provider_bridge.json`, {});
  const seats = load(`${raw}/seats.json`, []);
  const espnSeats = load(`${raw}/espn_seats.json`, []);
  const weekly = load(`${raw}/weekly_scores.json`, {});
  const finishes = load(`${ui}/finishes.json`, {});
  const rosters = load(`${raw}/rosters_now.json`, []);
  const live = [...new Set(rosters.map((r) => String(r.owner_id || r.user_id)).filter(Boolean))];
  const src = fs.readFileSync(`${ROOT}espn-sync.mjs`, "utf8");
  const mergeSrc = fs.readFileSync(`${ROOT}merge-provider-history.mjs`, "utf8");

  loop("L1", src.includes("got.status === 401 || got.status === 403")
    && src.includes("sawAuthBlock = true")
    && src.includes("continue;")
    && !src.includes("sawAuthBlock = true;\n      break;"),
    "espn-sync tries every year even when one season 401s");
  loop("L2", mergeSrc.includes("inheritParkedToLive(")
    && fs.readFileSync(`${ROOT}build-finishes.mjs`, "utf8").includes("inheritParkedToLive("),
    "merge and finishes inherit a parked franchise onto the live Sleeper seat");
  loop("L3", Array.isArray(ESPN_HISTORY_YEARS) && ESPN_HISTORY_YEARS.join(",") === "2020,2021,2022,2023,2024"
    && SLEEPER_KEEP_YEARS.join(",") === "2025,2026",
    "required window is ESPN 2020-2024 and Sleeper 2025-2026");
  loop("L4", live.length === 12,
    "live 2026 bag is still 12 rosters");
  loop("L5", (weekly.scores || []).filter((s) => s.provider === "espn"
    && SLEEPER_KEEP_YEARS.includes(String(s.season))).length === 0,
    "live weekly tape never lets ESPN overwrite 2025-2026");

  if (!espn.authorized) {
    loop("L6", espn.reason === "espn_private_needs_cookie" || espn.reason === "espn_unauthorized_with_cookie"
      || espn.reason === "espn_no_season_payload",
      "live ESPN book is still locked — 2020-2024 cannot be invented");
    loop("L7", (espn.seasons || []).length === 0 && (bridge.espn_seasons || []).length === 0,
      "live seasons stay empty until cookies land on league-sync");
    loop("L8", [2020, 2021, 2022, 2023, 2024].every((y) =>
      (espn.tried || []).some((t) => Number(t.season) === y && Number(t.status) === 401)),
      "2020-2024 exist on ESPN (401) — cookies unlock them; earlier years 404");
    return;
  }

  const franchise = bridge.franchise || {};
  const bySeat = yearsBySeat(espnSeats, franchise);
  const missing = liveSeatsMissingHistory(live, bySeat);
  loop("L6", ESPN_HISTORY_YEARS.every((y) => (espn.seasons || []).includes(y)),
    "live espn_status lists 2020-2024");
  loop("L7", missing.length === 0,
    "every live 2026 roster has ESPN 2020-2024 on the franchise map"
      + (missing.length ? " · gap " + JSON.stringify(missing) : ""));
  loop("L8", ESPN_HISTORY_YEARS.every((y) => (finishes.seasons || []).includes(y))
    && (finishes.seasons || []).includes("2025")
    && !(finishes.seasons || []).includes("2026"),
    "live How I finished includes 2020-2024 + 2025 and drops 2026");
  const espnWeeks = (weekly.scores || []).filter((s) => s.provider === "espn");
  loop("L8b", espnWeeks.length >= 12 * ESPN_HISTORY_YEARS.length,
    "live weekly tape has ESPN rows for the 12-team history window");
}

for (let pass = 1; pass <= PASSES; pass++) {
  console.log("— ESPN history pass " + pass + "/" + PASSES);
  runFixture(pass);
}
runLive();
console.log("PASS ESPN history loops × " + PASSES);
