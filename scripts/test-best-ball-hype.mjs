#!/usr/bin/env node
/**
 * Best Ball Hype door: optimal-lineup weekly records in League Data.
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
  "If every week used the best lineup",
  "Rest + playoffs (current roster)",
  "Scored weeks use that week",
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
  if (doors.includes('"draft_board"') || def.includes('"draft_board"')) {
    fail("Draft capital left the default 13 doors — Best Ball Hype took that slot");
  }
}

const book = JSON.parse(
  fs.readFileSync("data/leagues/1315431339301806080/ui/best-ball-hype.json", "utf8"),
);
if (Number(book.v) < 1 || !Array.isArray(book.seats) || book.seats.length < 8) {
  fail("best-ball-hype book missing seats");
}
const lead = book.seats[0];
if (!lead.record || !lead.actual_record || !Array.isArray(lead.weeks) || !lead.weeks.length) {
  fail("seat rows need BB record, actual record, and weeks");
}
// At least one seat should differ from set lineup (hype / anti-hype).
if (!book.seats.some((s) => Number(s.delta_wins) !== 0)) {
  fail("expected at least one seat with BB wins ≠ set lineup wins");
}
if (Number(book.v) >= 2) {
  if (!book.proj_through_week || !Array.isArray(lead.future_weeks)) {
    fail("v2 book needs proj_through_week + future_weeks");
  }
  if (!lead.proj_record) fail("v2 seats need proj_record from current-roster rest of season");
  if (!book.seats.some((s) => (s.future_weeks || []).length > 0)) {
    fail("expected projected future weeks on at least one seat");
  }
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

console.log(JSON.stringify({
  ok: true,
  week: book.week,
  lead: lead.name,
  bb: lead.record,
  actual: lead.actual_record,
  delta: lead.delta_wins,
}));
