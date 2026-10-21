#!/usr/bin/env node
import { detectLeagueFormat } from "../lib.mjs";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

const cuckleLike = detectLeagueFormat({
  roster_positions: ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "BN"],
  settings: { type: 2 },
  scoring_settings: { rec: 1, rec_te: 1 },
});
assert(cuckleLike.book === "2qb" && cuckleLike.format_key === "2qb", "superflex uses 2qb");
assert(cuckleLike.kind === "dynasty", "type 2 is dynasty");
assert(cuckleLike.tep === false, "equal TE rec is not TEP");
assert(cuckleLike.windows.includes("y1"), "dynasty keeps season clocks");

const oneQb = detectLeagueFormat({
  roster_positions: ["QB", "RB", "WR", "TE", "FLEX", "BN"],
  settings: { type: 2 },
  scoring_settings: { rec: 1, rec_te: 1.5 },
});
assert(oneQb.book === "1qb", "no SUPER_FLEX is 1qb");
assert(oneQb.tep === true, "rec_te above rec is TEP");

const redraft = detectLeagueFormat({
  roster_positions: ["QB", "RB", "WR", "TE", "FLEX", "BN"],
  settings: { type: 0 },
  scoring_settings: { rec: 1 },
});
assert(redraft.kind === "redraft", "type 0 is redraft");
assert(redraft.book === "1qb", "redraft 1QB book");
assert(redraft.windows[0] === "t0", "redraft starts at t0");
assert(!redraft.windows.includes("t365"), "redraft has no year clock");

const keeper = detectLeagueFormat({
  roster_positions: ["QB", "QB", "RB", "WR", "TE"],
  settings: { type: 1 },
});
assert(keeper.kind === "keeper", "type 1 is keeper");
assert(keeper.book === "2qb", "two QB slots is 2qb");

console.log("PASS test-league-format");
