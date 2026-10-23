#!/usr/bin/env node
/**
 * Home digest cleanup + Your board Arrange hub (List/Board/Pick/Home4/Catalog).
 */
import fs from "node:fs";

const page = fs.readFileSync("index.html", "utf8");
const gen = fs.readFileSync("generate-page.mjs", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function fnSrc(name) {
  const start = page.indexOf("function " + name + "(");
  if (start < 0) fail("missing " + name);
  const end = page.indexOf("\n    function ", start + 10);
  return page.slice(start, end < 0 ? start + 4000 : end);
}

if (!page.includes('const DATA_V = "boardArrangeAll20261023"')) {
  fail("DATA_V must bump for board arrange all ship");
}
if (!sw.includes("chuckle-shell-v367-board-arrange-all")) {
  fail("sw.js must bump CACHE for board arrange all ship");
}

{
  const race = fnSrc("homeYouRaceLine");
  if (race.includes(">Race</button>") || race.includes(">Type</button>")) {
    fail("Expected finish must not mount Race / Type chips");
  }
}

{
  const lip = fnSrc("leagueInProgress");
  if (lip.includes("homeCapitalStripHtml()")) fail("Home must not mount Your firsts");
  if (!lip.includes("homePulseHtml()") || !lip.includes("homeYouHtml()")) {
    fail("Home must keep Expected finish (pulse is a no-op mount)");
  }
}

{
  const pulse = fnSrc("homePulseHtml");
  if (pulse.includes("You slipped") || pulse.includes("Race movers") || !pulse.includes('return ""')) {
    fail("Home pulse must be empty");
  }
}

{
  if (!page.includes("function dataDashBeginArrange(")
    || !page.includes("function dataDashArrangeHtml(")
    || !page.includes("function dataDashSaveArrange(")
    || !page.includes("Tap Arrange to reorganize")
    || !page.includes('data-dash-arrange="list"')
    || !page.includes('data-dash-arrange-mode="')
    || !fnSrc("dataDashArrangeHtml").includes('"List")')
    || !fnSrc("dataDashArrangeHtml").includes('"Board")')
    || !fnSrc("dataDashArrangeHtml").includes('"Pick")')
    || !fnSrc("dataDashArrangeHtml").includes('"Home 4")')
    || !fnSrc("dataDashArrangeHtml").includes('"Catalog")')
    || !page.includes("data-dash-pick=")
    || !page.includes("data-dash-home-slot=")
    || !page.includes("data-dash-catalog=")
    || !page.includes("is-jiggle")
    || !fnSrc("dataDashHtml").includes(">Arrange</button>")
    || !fnSrc("dataDashCommitFromBoard").includes("dataDashArrangeOpen()")
    || !fnSrc("dataDashEnterOrgMode").includes("dataDashCanEdit()")) {
    fail("Arrange hub with five modes must ship");
  }
}

{
  if (gen.includes("@keyframes door-jiggle") || gen.includes("door-jiggle")) {
    fail("jiggle must stay static (no @keyframes)");
  }
}

console.log("home-board-org ok");
