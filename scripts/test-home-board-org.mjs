#!/usr/bin/env node
/**
 * Home digest cleanup + League Data button-first board reorder.
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

if (!page.includes('const DATA_V = "boardReorderSimple20261023"')) {
  fail("DATA_V must bump for board reorder simple ship");
}
if (!sw.includes("chuckle-shell-v363-board-reorder-simple")) {
  fail("sw.js must bump CACHE for board reorder simple ship");
}

{
  const race = fnSrc("homeYouRaceLine");
  if (race.includes(">Race</button>") || race.includes(">Type</button>")) {
    fail("Expected finish must not mount Race / Type chips");
  }
  if (!race.includes("Expected finish") || !race.includes('data-home-door="projected_finish"')) {
    fail("Expected finish open door must stay");
  }
}

{
  const lip = fnSrc("leagueInProgress");
  if (lip.includes("homeCapitalStripHtml()")) {
    fail("Home must not mount Your firsts");
  }
  if (!lip.includes("homePulseHtml()") || !lip.includes("homeYouHtml()")) {
    fail("Home must keep Expected finish + movers pulse");
  }
}

{
  const strip = fnSrc("homeCapitalStripHtml");
  if (!strip.includes('return ""') || strip.includes("Your firsts")) {
    fail("homeCapitalStripHtml must be a no-op empty return");
  }
}

{
  const chase = fnSrc("homeChaseTip");
  if (chase.includes("Defend held Early")) {
    fail("Defend held Early chase tip must be removed");
  }
  const pulse = fnSrc("homePulseHtml");
  if (pulse.includes("homeChaseTip(") || pulse.includes("home-pulse-chase")) {
    fail("Home pulse must not mount chase banners");
  }
}

{
  if (!page.includes("function dataDashEnterOrgMode(")
    || !page.includes("function dataDashMarkOrganizing(")
    || !page.includes("is-organizing")
    || !page.includes("Tap Reorder to rearrange")
    || !page.includes("Tap ↑ ↓ to move")
    || !page.includes("button-first")
    || !page.includes("data-dash-org-bar")
    || !page.includes('data-dash-to="')
    || !fnSrc("dataDashTileHtml").includes("data-dash-move=")
    || !fnSrc("dataDashTileHtml").includes(">Top</button>")
    || !fnSrc("dataDashHtml").includes('data-dash-edit="1"')
    || !fnSrc("dataDashHtml").includes(': "Reorder")')
    || !fnSrc("dataDashHtml").includes("data-dash-org-bar")) {
    fail("button-first Reorder + ↑↓ / Top must ship");
  }
  const down = page.slice(page.indexOf('document.addEventListener("pointerdown"'));
  if (!down.includes("if (!dataDashEdit || !dataDashCanEdit()) return")) {
    fail("pointerdown drag must require edit mode already on (button-first)");
  }
  if (down.includes("holdMs") && down.includes("420")) {
    fail("long-press enter-org must stay removed");
  }
}

{
  if (!gen.includes(".receipt-board.is-organizing")
    || !gen.includes("grid-template-columns: 1fr")
    || !gen.includes("min-height: 44px")) {
    fail("organizing board must be one-column list with 44px move taps");
  }
}

console.log("home-board-org ok");
