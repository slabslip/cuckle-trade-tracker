#!/usr/bin/env node
/**
 * Home digest cleanup + Your board Apple Home–style jiggle edit
 * (Edit/Done, drag reflow, − remove; More → List/Pick/Home4/Catalog hub).
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

if (!page.includes('const DATA_V = "boardJiggleEdge20261023"')) {
  fail("DATA_V must bump for board jiggle edge ship");
}
if (!sw.includes("chuckle-shell-v370-board-jiggle-edge")) {
  fail("sw.js must bump CACHE for board jiggle edge ship");
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
  if (!page.includes("function dataDashEnterJiggle(")
    || !page.includes("function dataDashExitJiggle(")
    || !page.includes("function dataDashBeginArrange(")
    || !page.includes("function dataDashArrangeHtml(")
    || !page.includes("Hold a door to edit")
    || !page.includes("Drag doors to rearrange like the Home Screen")
    || !page.includes("data-tile-del")
    || !page.includes("is-jiggle-face")
    || !page.includes("is-jiggle")
    || !fnSrc("dataDashTileHtml").includes("data-dash-remove=")
    || !fnSrc("dataDashTileHtml").includes("data-tile-del")
    || !fnSrc("dataDashHtml").includes("data-dash-org-bar")
    || !fnSrc("dataDashHtml").includes(': "Edit")')
    || !fnSrc("dataDashHtml").includes('? "Done"')
    || !fnSrc("dataDashHtml").includes('data-dash-arrange="list"')
    || !fnSrc("dataDashBeginArrange").includes("dataDashEnterJiggle")
    || !page.includes('data-dash-arrange-mode="')
    || !fnSrc("dataDashArrangeHtml").includes('"List")')
    || !fnSrc("dataDashArrangeHtml").includes('"Pick")')
    || !fnSrc("dataDashArrangeHtml").includes('"Catalog")')
    || !fnSrc("dataDashEnterOrgMode").includes("dataDashEnterJiggle")
    || !fnSrc("dataDashEnterOrgMode").includes("dataDashCanEdit()")
    || !fnSrc("dataDashCommitFromBoard").includes("dataDashArrangeOpen()")
    || !page.includes("Long-press enters Apple-style jiggle")) {
    fail("Apple Home jiggle edit + More arrange hub must ship");
  }
}

{
  if (gen.includes("@keyframes door-jiggle") || gen.includes("door-jiggle")) {
    fail("jiggle must stay static (no @keyframes)");
  }
}

console.log("home-board-org ok");
