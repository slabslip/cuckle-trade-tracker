#!/usr/bin/env node
import { mergeLatestCurve, mergeLatestSnapshots } from "../value-snapshot.mjs";

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

const asOf = "2026-10-20";
const existing = [
  { as_of: "2026-09-30", asset_key: "player:1", value: 100 },
  { as_of: "2026-10-20", asset_key: "player:1", value: 90 },
];
const latest = [{ as_of: asOf, asset_key: "player:1", value: 95 }];
const curve = mergeLatestCurve(existing, latest, asOf);
need(curve.length === 2, "keep history and one today row");
need(curve[0].value === 100 && curve[1].value === 95, "today replaces the smashed same-day row");
need(mergeLatestCurve([], latest, asOf).length === 1, "empty book just takes latest");

const snaps = mergeLatestSnapshots(
  [{ as_of: "2026-09-30", source: "latest" }, { as_of: "2026-08-28", source: "abc" }, { as_of: asOf, source: "stale" }],
  { as_of: asOf, source: "latest" },
  asOf,
);
need(snaps[0].as_of === asOf && snaps[0].source === "latest", "today snap leads");
need(snaps.length === 3 && snaps.filter((s) => s.as_of === asOf).length === 1, "no duplicate today snap");

console.log("value-snapshot merge ok");
