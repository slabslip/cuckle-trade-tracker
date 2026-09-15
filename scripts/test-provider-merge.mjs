#!/usr/bin/env node
import { buildBridge, normName } from "../merge-provider-history.mjs";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

assert(normName("Truman Cooper") === "trumancooper", "norm strips space");
assert(normName("TaylorJohnson16") === "taylorjohnson16", "norm keeps digits");

const sleeper = [
  { user_id: "u1", canonical_name: "TrumanCooper", aliases: [{ name: "Truman" }] },
  { user_id: "u2", canonical_name: "Biff34", aliases: [] },
];
const espn = [
  { user_id: "espn:aaa", canonical_name: "TrumanCooper", aliases: [] },
  { user_id: "espn:bbb", canonical_name: "Someone Else", aliases: [] },
];
const auto = buildBridge(espn, sleeper, {});
assert(auto["espn:aaa"] === "u1", "unique display name maps to Sleeper");
assert(!auto["espn:bbb"], "unmatched ESPN member stays unmapped");

const pinned = buildBridge(espn, sleeper, { "espn:bbb": "u2" });
assert(pinned["espn:bbb"] === "u2", "explicit bridge wins");

console.log("PASS test-provider-merge");
