#!/usr/bin/env node
/**
 * Expected Finish must ship the same champ + toilet cut as Best Ball Hype:
 * Top 6 / Bottom 4 bands, championship board, toilet 10v7 / 8v9 board.
 */
import fs from "node:fs";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

if (!page.includes('const DATA_V = "') || !/^const CACHE = "chuckle-shell-v\d+/m.test(sw)) {
  fail("EF bracket ship must keep DATA_V and SW cache");
}

for (const need of [
  "function projectedPlayoffBracket(",
  "function projectedPlayoffBracketBoardHtml(",
  "function projectedToiletBracketBoardHtml(",
  "Championship bracket",
  "Toilet bowl",
  "Toilet semis",
  "pf-brack-toilet",
  "10v7",
  "8v9",
  "best-ball format so nobody can purposely lose",
  'band: seed <= playoffN ? "top" : "bot"',
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}

// List banding treats EF like Best Ball (Championship bracket / Toilet bowl).
{
  const bands = (page.match(/function dataListBandsHtml\([\s\S]*?\n    \}/) || [])[0] || "";
  if (!bands.includes('id === "projected_finish"')
    || !bands.includes('band("Championship bracket"')
    || !bands.includes('band("Toilet bowl"')) {
    fail("dataListBandsHtml must label EF Championship bracket + Toilet bowl");
  }
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/projected-finish.json", "utf8"),
);
if (!Array.isArray(book.seats) || book.seats.length < 8) fail("EF book missing seats");
if (!(Number(book.week) >= 7)) fail("EF week stale");

console.log(JSON.stringify({
  ok: true,
  week: book.week,
  lead: book.seats[0] && book.seats[0].name,
  DATA_V: (page.match(/const DATA_V = "([^"]+)"/) || [])[1] || "",
}));
