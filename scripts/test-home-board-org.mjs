#!/usr/bin/env node
/**
 * Home digest cleanup + League Data organization mode (long-press reorder).
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

if (!page.includes('const DATA_V = "homeBoardOrg20261023"')) {
  fail("DATA_V must bump for home board org ship");
}
if (!sw.includes("chuckle-shell-v361-home-board-org")) {
  fail("sw.js must bump CACHE for home board org ship");
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
    || !page.includes("Hold a tile to organize")
    || !page.includes("Tap a tile to finish")) {
    fail("organization mode helpers + copy must ship");
  }
  const endDrag = fnSrc("dataDashEndDrag");
  if (!endDrag.includes("!drag.enteredOrg")
    || !endDrag.includes("dataDashEdit = false")
    || !endDrag.includes("dataDashDragDid = true")) {
    fail("quick tap while organizing must exit edit and swallow open");
  }
  const down = page.slice(page.indexOf('document.addEventListener("pointerdown"'));
  if (!down.includes("holdMs") || !down.includes("420") || !down.includes("160")) {
    fail("pointerdown must use longer hold to enter org, shorter when already organizing");
  }
  const move = page.slice(page.indexOf('document.addEventListener("pointermove"'));
  if (!move.includes("organizing") || !move.includes("dist2 > 36")) {
    fail("pointermove must lift freely while organizing (no vertical cancel)");
  }
}

// Edge: vertical cancel only outside org mode
{
  const moveStart = page.indexOf('document.addEventListener("pointermove"');
  const moveFn = page.slice(moveStart, moveStart + 1800);
  if (!moveFn.includes("Math.abs(dy) > Math.abs(dx) + 6")
    || !moveFn.includes("Outside org mode")) {
    fail("scroll cancel must remain for non-organizing touches");
  }
}

console.log("home-board-org ok");
