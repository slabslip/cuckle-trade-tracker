#!/usr/bin/env node
/** Dashboard copy must say team, not bag. */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const arcs = fs.readFileSync("lib/season-arcs.mjs", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

// Stamp moves with each ship; assert content, not a frozen DATA_V.
if (!page.includes('const DATA_V = "') || !sw.includes("chuckle-shell-v")) {
  fail("bag→team page must keep DATA_V and SW cache");
}

const banned = [
  "your bag",
  "their bag",
  "Hide bag",
  "Add from your bag",
  "the bag is empty",
  "received bag",
  "The bags stayed",
  " · Bag ",
  'dataDashFact("Bag"',
  "VA on that bag",
  "Reload bag",
  "flat bag",
];
for (const b of banned) {
  if (page.includes(b)) fail("index still has user-facing bag copy: " + b);
}

const need = [
  "your team",
  "their team",
  "Hide team",
  "Add from your team",
  "the team is empty",
  "received team",
  "The teams stayed",
  " · Team ",
  'dataDashFact("Team"',
  "VA on that team",
  "Reload team",
];
for (const n of need) {
  if (!page.includes(n) && !arcs.includes(n) && !gen.includes(n)) {
    fail("missing team copy: " + n);
  }
}
if (!arcs.includes("Reload team")) fail("season-arcs archetype why must say Reload team");
if (arcs.includes("Reload bag")) fail("season-arcs still says Reload bag");

console.log(JSON.stringify({ ok: true, DATA_V: "bagToTeam20261021" }));
