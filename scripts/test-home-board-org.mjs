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

if (!page.includes('const DATA_V = "boardReorderScrollFix20261023"')) {
  fail("DATA_V must bump for board reorder scroll fix ship");
}
if (!sw.includes("chuckle-shell-v366-board-reorder-scroll-fix")) {
  fail("sw.js must bump CACHE for board reorder scroll fix ship");
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
    fail("Home must keep Expected finish (pulse is a no-op mount)");
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
  if (pulse.includes("homeChaseTip(") || pulse.includes("home-pulse-chase")
    || pulse.includes("You slipped") || pulse.includes("Race movers")
    || !pulse.includes('return ""')) {
    fail("Home pulse must be empty (no slipped / Race movers)");
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
    || !fnSrc("dataDashHtml").includes("data-dash-org-bar")
    || !fnSrc("dataDashEnterOrgMode").includes("dataDashCanEdit()")
    || !fnSrc("dataDashCommitFromBoard").includes("dataDashCanEdit()")) {
    fail("button-first Reorder + ↑↓ / Top must ship; seat gate required");
  }
  const down = page.slice(page.indexOf('document.addEventListener("pointerdown"'));
  if (!down.includes("if (!dataDashEdit || !dataDashCanEdit()) return")) {
    fail("pointerdown drag must require edit mode already on (button-first)");
  }
  if (down.includes("holdMs") && down.includes("420")) {
    fail("long-press enter-org must stay removed");
  }
  if (fnSrc("dataDashMarkOrganizing").includes('touchAction = on ? "none"')
    || !fnSrc("dataDashMarkOrganizing").includes('touchAction = ""')) {
    fail("organizing must not pin touch-action:none (list scroll lock)");
  }
  if (!page.includes("No auto-lift on a timer")
    || !page.includes("Vertical-dominant motion is list scroll")) {
    fail("optional drag must not auto-lift on hold; vertical = scroll");
  }
  // Click handlers for mutate paths must refuse unsigned / no-seat.
  const clickAt = page.indexOf('const dashRemoveBtn = e.target.closest("[data-dash-remove]")');
  const clickChunk = page.slice(clickAt, clickAt + 4000);
  for (const need of ["dashRemoveBtn", "dashMoveBtn", "dashToBtn", "dashAddBtn", "dashSwapBtn", "dashUseBtn"]) {
    if (!clickChunk.includes(need)) fail("missing board mutate handler " + need);
  }
  if ((clickChunk.match(/if \(!dataDashCanEdit\(\)\) return;/g) || []).length < 5) {
    fail("remove/move/to/add/swap/use must gate on dataDashCanEdit");
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
