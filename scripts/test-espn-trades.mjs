#!/usr/bin/env node
/** ESPN trade parse: executed TRADE_ACCEPT with two bags. */
import { parseTrades } from "../espn-sync.mjs";

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

const seats = [
  { roster_id: 3, owner_id: "espn:aaa" },
  { roster_id: 7, owner_id: "espn:bbb" },
];
const txs = [
  {
    id: "t1",
    type: "TRADE_PROPOSAL",
    status: "EXECUTED",
    scoringPeriodId: 4,
    proposedDate: Date.parse("2023-10-03T12:00:00Z"),
    items: [
      { playerId: 16800, fromTeamId: 3, toTeamId: 7 },
      { playerId: 3138095, fromTeamId: 7, toTeamId: 3 },
    ],
  },
  {
    id: "t2",
    type: "TRADE_ACCEPT",
    status: "EXECUTED",
    scoringPeriodId: 4,
    proposedDate: Date.parse("2023-10-03T12:00:00Z"),
    items: [
      { playerId: 16800, fromTeamId: 3, toTeamId: 7 },
      { playerId: 3138095, fromTeamId: 7, toTeamId: 3 },
    ],
  },
];

const bag = parseTrades(txs, 2023, seats, new Map());
need(bag.trades.length === 1, "only TRADE_ACCEPT is a landed trade");
need(bag.trades[0].transaction_id === "espn:t2", "landed id");
need(bag.trades[0].season === "2023", "season");
need(bag.trades[0].user_ids.includes("espn:aaa") && bag.trades[0].user_ids.includes("espn:bbb"),
  "both seats on the trade");
need(bag.legs.filter((l) => l.direction === "in").length === 2, "two in-legs");
need(!bag.trades.some((t) => t.transaction_id === "espn:t1"), "proposals stay off the tape");

const src = await (await import("node:fs/promises")).readFile(new URL("../espn-sync.mjs", import.meta.url), "utf8");
need(src.includes("TRADE_ACCEPT") && src.includes("scoringPeriodId=${week}"),
  "fetch must walk weeks for TRADE_ACCEPT, not week-0 TRADE");
need(src.includes("kept_last_good_book"),
  "a cookie-less run must not wipe a last-good ESPN book");

console.log("espn trades parse ok", { trades: bag.trades.length, legs: bag.legs.length });
