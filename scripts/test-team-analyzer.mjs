#!/usr/bin/env node
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const page = fs.readFileSync(`${ROOT}index.html`, "utf8");
const gen = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");
const plan = fs.readFileSync(`${ROOT}docs/plans/dynasty_daily_habit.md`, "utf8");
const book = JSON.parse(fs.readFileSync(
  `${ROOT}data/leagues/1315431339301806080/ui/calculator.json`,
  "utf8",
));

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
  "Draft capital", "Team grade"].forEach(function (label) {
  need(fnSrc(page, "teamAnalyzerHtml").includes(label),
    "team analyzer must include " + label);
});
need(fnSrc(page, "teamAnalyzerHtml").includes("fmt(") === false
  && fnSrc(page, "teamAnalyzerPosScore").includes("teamAnalyzerValueGrade")
  && fnSrc(page, "teamAnalyzerPosScore").includes("calcValueNum")
  && fnSrc(page, "teamAnalyzerGrades").includes("teamAnalyzerPosScore")
  && fnSrc(page, "teamAnalyzerPosScore").includes(".length") === false,
  "analyzer grades score slot values on the book, not a startable count");
need(fnSrc(page, "teamAnalyzerDepth").includes("teamAnalyzerPosFloor") === false
  && fnSrc(page, "teamAnalyzerDepth").includes("teamAnalyzerValueGrade")
  && fnSrc(page, "teamAnalyzerDepth").includes("Short a starter") === false
  && fnSrc(page, "teamAnalyzerDepth").includes("slotN")
  && fnSrc(page, "teamAnalyzerDepth").includes("starter value")
  && fnSrc(page, "teamAnalyzerDepth").includes("after the desk"),
  "depth scores eight after-desk slots on the book, not the league floor");
need(fnSrc(page, "teamAnalyzerPos").includes("toUpperCase")
  && fnSrc(page, "teamAnalyzerMoves").includes("dir.sell") === false,
  "pos tags normalize; Look to trade is leftover names, not seat-direction labels");
need(fnSrc(page, "teamAnalyzerDraft").includes("calcBook.picks")
  || fnSrc(page, "teamAnalyzerPicks").includes("calcBook.picks"),
  "draft capital must use live pick values on the calculator book");
need(fnSrc(page, "teamAnalyzerDraftParts").includes("teamAnalyzerValueGrade")
  && fnSrc(page, "teamAnalyzerDraftParts").includes("nearPts / 9")
  && fnSrc(page, "teamAnalyzerDraftParts").includes("start * 12") === false
  && fnSrc(page, "teamAnalyzerDraft").includes("teamAnalyzerDraftRaw")
  && fnSrc(page, "teamAnalyzerHtml").includes("next two drafts weigh most"),
  "draft capital must weigh the next two drafts, not a 12-slot pad");
need(fnSrc(page, "teamAnalyzerScale").includes('kind === "tank"')
  && fnSrc(page, "teamAnalyzerScale").includes("return 88"),
  "C↔R bar must map tank / win-now from the bag and chest, not only seat-direction");
need(fnSrc(page, "teamAnalyzerCard").includes("members")
  && fnSrc(page, "teamAnalyzerShareNow").includes("teamAnalyzerShareFile(")
  && page.includes('heading("Starting lineup"')
  && page.includes('heading("Cornerstones"')
  && page.includes('heading("Look to trade"')
  && page.includes('heading("Players to target"')
  && page.includes('heading("Contend / rebuild"')
  && page.includes('heading("Positional grades"')
  && page.includes('heading("Draft capital"')
  && page.includes('heading("3-year outlook"')
  && page.includes('heading("Depth score"')
  && fnSrc(page, "teamAnalyzerShareDraw").includes("Chuckle Fantasy") === false,
  "share PNG must paint the full dashboard analyzer, not a short lineup card");
need(fnSrc(page, "teamAnalyzerHtml").includes("schematicSettingsHtml()") === false
  && page.includes("team-sch-gbar") && page.includes("team-sch-cr")
  && page.includes("data-analyzer-share")
  && page.includes("function teamAnalyzerShareDraw(")
  && page.includes("function teamAnalyzerShareFile(")
  && page.includes("cuckle-")
  && page.includes(".team-schematic {\n      position: relative;")
  && page.includes("background: #121214")
  && page.includes("#0b1c33") === false,
  "analyzer must match Home dashboard chrome and save as an image");
need(gen.includes("function teamAnalyzerHtml(") && gen.includes("teamAnalyzerHtml(me.user_id")
  && gen.includes("function teamAnalyzerValueGrade(")
  && gen.includes("function teamAnalyzerShareFile(")
  && gen.includes("data-analyzer-share")
  && gen.includes("team-sch-gbar")
  && gen.includes("function teamAnalyzerPosFloor(") === false,
  "generate-page.mjs team analyzer must stay in sync (do not execute it)");
need(plan.includes("team analyzer") && plan.includes("dashboard chrome")
  && plan.includes("teamAnalyzerValueGrade")
  && plan.includes("next two drafts")
  && plan.includes("no league curve")
  && plan.includes("starter is 3")
  && plan.includes("8–9 is rare"),
  "plan must lock the dashboard team analyzer and value grades");
need(fs.existsSync(`${ROOT}scripts/loop-team-analyzer.mjs`)
  && fs.readFileSync(`${ROOT}scripts/loop-team-analyzer.mjs`, "utf8").includes("loop(12,")
  && fs.readFileSync(`${ROOT}scripts/loop-team-analyzer.mjs`, "utf8").includes("loop(24,"),
  "two dozen analyzer loops must stay on the book");

const DESK_STUD = 5500;
const DESK_START = 2200;
const DESK_MID = 1800;
const DESK_SLOTS = { QB: 2, RB: 2, WR: 3, TE: 1 };

function calcValueNum(a) {
  const n = Number(a && a.value);
  return Number.isFinite(n) ? n : -1;
}
function valueGrade(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const elite = DESK_STUD + (DESK_STUD - DESK_START);
  if (n >= elite) return 10;
  if (n >= DESK_STUD) return 7.5 + 2.5 * (n - DESK_STUD) / (elite - DESK_STUD);
  if (n >= DESK_START) return 3 + 4.5 * (n - DESK_START) / (DESK_STUD - DESK_START);
  if (n >= DESK_MID) return 2 + (n - DESK_MID) / (DESK_START - DESK_MID);
  return Math.max(0, 2 * n / DESK_MID);
}
function round10(n) { return Math.max(0, Math.min(10, Math.round(n))); }
function bagOf(uid) {
  return (book.players || []).filter((p) => p && String(p.owner_id) === String(uid));
}
function gradesOf(bag) {
  const grades = {};
  ["QB", "RB", "WR", "TE"].forEach((pos) => {
    const need = DESK_SLOTS[pos];
    const pool = bag.filter((p) => p.pos === pos).sort((a, b) => calcValueNum(b) - calcValueNum(a));
    let pts = 0;
    for (let i = 0; i < need; i++) pts += valueGrade(pool[i] ? calcValueNum(pool[i]) : -1);
    grades[pos] = round10(pts / need);
  });
  return grades;
}
function draftOf(uid) {
  const y0 = Number(String(book.as_of || "").slice(0, 4));
  const base = Number.isFinite(y0) && y0 >= 2020 ? y0 : 2026;
  const near1 = base + 1;
  const near2 = base + 2;
  const picks = (book.picks || []).filter((p) => p && String(p.owner_id) === String(uid));
  let nearPts = 0;
  let farPts = 0;
  picks.forEach((p) => {
    const y = Number(p.year != null ? p.year : p.season) || 0;
    const r = Number(p.round) || 99;
    const g = valueGrade(calcValueNum(p));
    const near = y === near1 || y === near2;
    let yw = 0.45;
    if (y === near1) yw = 1.55;
    else if (y === near2) yw = 1.35;
    else if (y === near2 + 1) yw = 0.45;
    else if (y >= near2 + 2) yw = 0.3;
    let rw = 1;
    if (r === 1) rw = near ? 1.35 : 1;
    else if (r === 2) rw = 0.8;
    else if (r === 3) rw = 0.4;
    else rw = 0.22;
    if (y < near1) return;
    if (near) nearPts += Math.min(10, g * yw * rw);
    else if (y >= near2 + 1) farPts += Math.min(10, g);
  });
  return round10(Math.min(10, nearPts / 9) * 0.88 + Math.min(10, farPts / 8) * 0.12);
}

const truman = "458342725222133760";
const king = "458715702119886848";
const arae = "458004578168729600";
const gTruman = gradesOf(bagOf(truman));
const gKing = gradesOf(bagOf(king));
const gARae = gradesOf(bagOf(arae));
const gTruman2 = gradesOf(bagOf(truman));
need(JSON.stringify(gTruman) === JSON.stringify(gTruman2), "same bag must reprint the same grades");
need(gKing.RB > gARae.RB, "KingHenry RB value must grade above ARae RB");
need(gKing.WR >= 7, "KingHenry WR core must grade as starters");
need(draftOf(truman) >= draftOf(king), "Truman pick chest must grade at or above KingHenry");
need(draftOf(arae) >= 7, "ARae pick chest must grade as historic draft capital");
need(fnSrc(page, "teamAnalyzerValueGrade").includes("const elite = stud + (stud - start)")
  && fnSrc(page, "teamAnalyzerPosBlend").includes("mean * 0.75 + hole * 0.25")
  && page.includes("starter 3 · stud 7.5 · elite 10"),
  "analyzer scale must keep starter=3 / stud=7.5 / elite=10 with a weakest-slot pull");

console.log(JSON.stringify({
  ok: true,
  truman: { grades: gTruman, draft: draftOf(truman) },
  king: { grades: gKing, draft: draftOf(king) },
  arae: { grades: gARae, draft: draftOf(arae) },
}));
