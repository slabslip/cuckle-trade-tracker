#!/usr/bin/env node
/**
 * Best Ball Hype door: Top 6 champ / Bottom 4 toilet brackets.
 */
import fs from "node:fs";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const build = fs.readFileSync("build.mjs", "utf8");

if (!page.includes('const DATA_V = "') || !/^const CACHE = "chuckle-shell-v\d+/m.test(sw)) {
  fail("best ball hype must keep DATA_V and SW cache");
}
if (!build.includes("build-best-ball-hype.mjs")) {
  fail("build.mjs must run build-best-ball-hype.mjs");
}
for (const need of [
  'id: "best_ball_hype"',
  'lab: "Best Ball Hype"',
  "function bestBallHypeDetailHtml(",
  'data-best-ball-hype-open="',
  'closest("[data-best-ball-hype-open]")',
  'getLeagueJson("best-ball-hype.json")',
  "bestBallHypeOpenKey",
  "Top 6 make the champ bracket",
  "toilet bowl in best ball",
  "Bracket path",
  "Toilet bowl scores best ball",
  'band("Top 6", "top"',
  'band("Bottom 4", "bot"',
  'band: seed <= playoffN ? "top" : "bot"',
  'src[draftAt] = "best_ball_hype"',
]) {
  if (!page.includes(need) && !gen.includes(need)) fail("missing: " + need);
}
{
  const doors = (page.match(/const DATA_DOORS = \[([\s\S]*?)\];/) || [])[1] || "";
  const def = (page.match(/const DATA_DASH_DEFAULT = \[([\s\S]*?)\];/) || [])[1] || "";
  if (!doors.includes('"best_ball_hype"') || !def.includes('"best_ball_hype"')) {
    fail("Best Ball Hype must sit on DATA_DOORS + DATA_DASH_DEFAULT");
  }
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/best-ball-hype.json", "utf8"),
);
if (Number(book.v) < 3 || !Array.isArray(book.seats) || book.seats.length < 8) {
  fail("best-ball-hype v3 book missing seats");
}
if (!book.champ || !book.toilet || !Array.isArray(book.seeding)) {
  fail("v3 book needs champ, toilet, seeding");
}
if (Number(book.playoff_teams) !== 6) fail("expected 6 playoff teams");
const champN = book.seats.filter((s) => s.bracket === "champ").length;
const toiletN = book.seats.filter((s) => s.bracket === "toilet").length;
if (champN !== 6 || toiletN !== 4) fail("expected 6 champ + 4 toilet seats");
if (!book.seats.every((s) => s.place_proj >= 1 && s.place_proj <= 10 && s.path)) {
  fail("each seat needs place_proj + path");
}
const toiletGames = (book.toilet.rounds || []).flatMap((r) => r.games || []);
if (!toiletGames.length || toiletGames.some((g) => g.mode !== "best_ball")) {
  fail("toilet games must be best_ball");
}
const champPlay = (book.champ.rounds || [])
  .flatMap((r) => r.games || [])
  .filter((g) => !g.bye);
if (!champPlay.length || champPlay.some((g) => g.mode !== "set_lineup")) {
  fail("champ games must be set_lineup");
}

const design = "design-best-ball-hype.html";
if (!fs.existsSync(design)) fail("missing " + design);
{
  const html = fs.readFileSync(design, "utf8");
  if (!html.includes("cuckle.auth.v2") || html.includes("cuckle.auth.v1")) {
    fail(design + " must seed auth v2");
  }
  if (html.includes("src=share")) fail(design + " must not use src=share");
}

const lead = book.seats.find((s) => Number(s.place_proj) === 1) || book.seats[0];
console.log(JSON.stringify({
  ok: true,
  week: book.week,
  champ1: lead.name,
  place: lead.place_proj,
  toilet_sacko: (book.seats.find((s) => Number(s.place_proj) === 10) || {}).name,
}));
