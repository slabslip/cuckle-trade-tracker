#!/usr/bin/env node
/** GM team Home is the onboarding book with more year detail. Dynasty stays the trade story. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const finishes = JSON.parse(fs.readFileSync(
  path.join(ROOT, "data/leagues/1389723418827460608/ui/finishes.json"),
  "utf8",
));

function fnSrc(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing function " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

function need(src, label, strs) {
  const missing = strs.filter((s) => !src.includes(s));
  if (missing.length) throw new Error(label + " missing: " + missing.join(", "));
}

need(page, "index.html", [
  "function renderGmTeamHome()",
  "function gmTeamYearsHtml(",
  "function gmTeamCrownsHtml(",
  "Crowning achievements",
  "The book so far",
  "Past names and finishes",
  "Career record",
  "Points avg",
  "3rd-place game",
]);
need(gen, "generate-page.mjs", [
  "function renderGmTeamHome()",
  "The book so far",
]);

const home = fnSrc(page, "renderTeamHome");
if (!home.includes("isGmLeague()") || !home.includes("renderGmTeamHome()")) {
  throw new Error("renderTeamHome must hand GM to the career book");
}
if (!home.includes("seatTradeFeedCardHtml(") || !home.includes("Best deal")) {
  throw new Error("dynasty team home must keep the trade story");
}

const gm = fnSrc(page, "renderGmTeamHome");
if (gm.includes("Best deal") || gm.includes("Format page")) {
  throw new Error("GM team home must not be the dynasty trade story");
}
if (!gm.includes("join-land-stats") || !gm.includes("gmTeamYearsHtml")) {
  throw new Error("GM team home must reuse the onboarding book layout with year detail");
}

if (!page.includes("cosmeticsSeatPlateHtml()") || !page.includes('class="screen-h seat-h"')) {
  throw new Error("team name / title / emblem chrome must stay above the tabs");
}

if (!page.includes('const DATA_V = "analyzerspread20260920011500"')
  || !sw.includes("chuckle-shell-v305-analyzer-spread")) {
  throw new Error("GM team home must bust DATA_V and SW");
}

const overnightOn = fnSrc(page, "overnightEnabled");
if (!overnightOn.includes("isGmLeague()") || !overnightOn.includes("isRedraftLeague()")) {
  throw new Error("overnight letter must stay off GM / redraft Home");
}

const tbow = (finishes.seats || []).find((s) => s.name === "Tbow00");
const kotula = (finishes.seats || []).find((s) => s.name === "kotula69");
if (!tbow || tbow.net !== 2000 || !tbow.places || tbow.places.length !== 6) {
  throw new Error("Tbow book must still have 6 years and +$2000");
}
if (!kotula || kotula.net !== -1200) {
  throw new Error("kotula book must still show career net -$1,200");
}

console.log(JSON.stringify({
  ok: true,
  gm: "career-book",
  dynasty: "trade-story",
  chrome: "name-title-emblem",
}, null, 2));
