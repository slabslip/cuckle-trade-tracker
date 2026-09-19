#!/usr/bin/env node
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const page = fs.readFileSync(`${ROOT}index.html`, "utf8");
const gen = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");
const plan = fs.readFileSync(`${ROOT}docs/plans/dynasty_daily_habit.md`, "utf8");

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

function fnSrc(src, name) {
  const re = new RegExp("function " + name + "\\([\\s\\S]*?\\n    function ");
  const m = src.match(re);
  return m ? m[0] : "";
}

need(page.includes("function teamAnalyzerHtml(") && page.includes("function teamAnalyzerEnabled(")
  && page.includes("teamAnalyzerHtml(me.user_id"),
  "dynasty team home must paint the analyzer for the open seat");
need(fnSrc(page, "teamAnalyzerEnabled").includes("isGmLeague()")
  && fnSrc(page, "teamAnalyzerEnabled").includes("isRedraftLeague()"),
  "team analyzer must stay off GM / redraft");
need(fnSrc(page, "renderGmTeamHome").includes("teamAnalyzerHtml") === false,
  "GM team home must not paint the dynasty analyzer");
["Starting lineup", "Depth score", "3-year outlook", "Cornerstones",
  "Look to trade", "Players to target", "Contend / rebuild", "Positional grades",
  "Draft capital"].forEach(function (label) {
  need(fnSrc(page, "teamAnalyzerHtml").includes(label),
    "team analyzer must include " + label);
});
need(fnSrc(page, "teamAnalyzerHtml").includes("fmt(") === false
  && fnSrc(page, "teamAnalyzerGrades").includes("deskCuts().start")
  && fnSrc(page, "teamAnalyzerGrades").includes("deskSlots()"),
  "analyzer grades are startable vs desk slots, not a new formula");
need(fnSrc(page, "teamAnalyzerHtml").includes("schematicSettingsHtml()")
  && page.includes("team-sch-gbar") && page.includes("team-sch-cr"),
  "analyzer must use the navy schematic settings grid, grade bars, and C↔R");
need(gen.includes("function teamAnalyzerHtml(") && gen.includes("teamAnalyzerHtml(me.user_id")
  && gen.includes("function schematicSettingsHtml(") && gen.includes("team-sch-gbar"),
  "generate-page.mjs team analyzer must stay in sync (do not execute it)");
need(plan.includes("team analyzer") && plan.includes("schematic"),
  "plan must lock the schematic team analyzer");

console.log("team analyzer ok");
