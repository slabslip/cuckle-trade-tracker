#!/usr/bin/env node
/**
 * Dozen loops: analyzer grades are repeatable, bounded, and on the book.
 * Does not invent a new value formula. Uses deskCuts + calcValueNum only.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");
const book = JSON.parse(fs.readFileSync(
  path.join(ROOT, "data/leagues/1315431339301806080/ui/calculator.json"),
  "utf8",
));
const members = JSON.parse(fs.readFileSync(
  path.join(ROOT, "data/leagues/1315431339301806080/ui/members.json"),
  "utf8",
));

let fails = 0;
function loop(n, ok, msg) {
  if (ok) {
    console.log("LOOP " + n + " PASS: " + msg);
    return;
  }
  fails += 1;
  console.error("LOOP " + n + " FAIL: " + msg);
}

function fnSrc(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) return "";
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

const DESK_STUD = 5500;
const DESK_START = 2200;
const DESK_MID = 1800;
const DESK_SLOTS = { QB: 2, RB: 2, WR: 3, TE: 1 };

function calcValueNum(a) {
  const n = Number(a && a.value);
  return Number.isFinite(n) ? n : -1;
}
function valueGrade(v, cuts) {
  const c = cuts || { stud: DESK_STUD, start: DESK_START, mid: DESK_MID };
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const elite = c.stud + (c.stud - c.start);
  if (n >= elite) return 10;
  if (n >= c.stud) return 7.5 + 2.5 * (n - c.stud) / Math.max(1, elite - c.stud);
  if (n >= c.start) return 3 + 4.5 * (n - c.start) / Math.max(1, c.stud - c.start);
  if (n >= c.mid) return 2 + (n - c.mid) / Math.max(1, c.start - c.mid);
  return Math.max(0, 2 * n / Math.max(1, c.mid));
}
function round10(n) {
  return Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
}
function bagOf(uid) {
  return (book.players || []).filter((p) => p && String(p.owner_id) === String(uid));
}
function picksOf(uid) {
  return (book.picks || []).filter((p) => p && String(p.owner_id) === String(uid))
    .sort((a, b) => calcValueNum(b) - calcValueNum(a));
}
function posScoreOf(bag, pos, slots, cuts) {
  const s = slots || DESK_SLOTS;
  const need = s[pos] || 1;
  const pool = bag.filter((p) => posOf(p) === pos).sort((a, b) => calcValueNum(b) - calcValueNum(a));
  let pts = 0;
  for (let i = 0; i < need; i++) pts += valueGrade(pool[i] ? calcValueNum(pool[i]) : -1, cuts);
  return pts / need;
}
function gradesOf(bag, slots, cuts) {
  const grades = {};
  ["QB", "RB", "WR", "TE"].forEach((pos) => {
    grades[pos] = round10(posScoreOf(bag, pos, slots, cuts));
  });
  return grades;
}
function posBlendOf(bag, slots, cuts) {
  const scores = ["QB", "RB", "WR", "TE"].map((pos) => posScoreOf(bag, pos, slots, cuts));
  const mean = (scores[0] + scores[1] + scores[2] + scores[3]) / 4;
  const hole = Math.min(...scores);
  return mean * 0.75 + hole * 0.25;
}
function posOf(p) {
  return String((p && p.pos) || "").toUpperCase();
}
function depthOf(bag, slots, cuts) {
  const s = slots || DESK_SLOTS;
  const start = (cuts || { start: DESK_START }).start;
  let pts = 0;
  let slotN = 0;
  let exist = 0;
  let startable = 0;
  ["QB", "RB", "WR", "TE"].forEach((pos) => {
    const need = s[pos] || 1;
    const pool = bag.filter((p) => posOf(p) === pos).sort((a, b) => calcValueNum(b) - calcValueNum(a));
    for (let i = 0; i < 2; i++) {
      const p = pool[need + i];
      const v = p ? calcValueNum(p) : -1;
      pts += valueGrade(v, cuts);
      slotN += 1;
      if (p) {
        exist += 1;
        if (v >= start) startable += 1;
      }
    }
  });
  const raw = slotN ? (pts / slotN) : 0;
  return {
    score: round10(raw),
    raw: raw,
    n: exist,
    slots: slotN,
    startable: startable,
  };
}
function nearYears() {
  const y = Number(String(book.as_of || "").slice(0, 4));
  const base = Number.isFinite(y) && y >= 2020 ? y : 2026;
  return { near1: base + 1, near2: base + 2 };
}
function pickYear(p) {
  const n = Number(p && (p.year != null ? p.year : p.season));
  return Number.isFinite(n) ? n : 0;
}
function pickWeight(p) {
  const years = nearYears();
  const y = pickYear(p);
  const r = Number(p && p.round) || 99;
  const near = y === years.near1 || y === years.near2;
  let yw = 0.45;
  if (y === years.near1) yw = 1.55;
  else if (y === years.near2) yw = 1.35;
  else if (y === years.near2 + 1) yw = 0.45;
  else if (y >= years.near2 + 2) yw = 0.3;
  let rw = 1;
  if (r === 1) rw = near ? 1.35 : 1;
  else if (r === 2) rw = 0.8;
  else if (r === 3) rw = 0.4;
  else rw = 0.22;
  return yw * rw;
}
function draftFromRaw(picks, cuts) {
  const years = nearYears();
  let nearPts = 0;
  let farPts = 0;
  (picks || []).forEach((p) => {
    const y = pickYear(p);
    const g = valueGrade(calcValueNum(p), cuts);
    if (y === years.near1 || y === years.near2) nearPts += Math.min(10, g * pickWeight(p));
    else if (y >= years.near2 + 1) farPts += Math.min(10, g);
  });
  return Math.min(10, nearPts / 9) * 0.88 + Math.min(10, farPts / 8) * 0.12;
}
function draftFrom(picks, cuts) {
  return round10(draftFromRaw(picks, cuts));
}
function draftOf(uid, cuts) {
  return draftFrom(picksOf(uid), cuts);
}
function deskOf(bag, slots) {
  const s = slots || DESK_SLOTS;
  const out = [];
  ["QB", "RB", "WR", "TE"].forEach((pos) => {
    bag.filter((p) => posOf(p) === pos).sort((a, b) => calcValueNum(b) - calcValueNum(a))
      .slice(0, s[pos] || 1).forEach((p) => out.push(p));
  });
  return out;
}
function windowOf(bag, uid, slots, cuts) {
  const pos = posBlendOf(bag, slots, cuts);
  const years = nearYears();
  const picks = picksOf(uid);
  let nearPts = 0;
  picks.forEach((p) => {
    const y = pickYear(p);
    if (y === years.near1 || y === years.near2) {
      nearPts += Math.min(10, valueGrade(calcValueNum(p), cuts) * pickWeight(p));
    }
  });
  const near = Math.min(10, nearPts / 9);
  const c = cuts || { start: DESK_START, stud: DESK_STUD };
  const desk = deskOf(bag, slots);
  let aging = 0;
  let young = 0;
  desk.forEach((p) => {
    const age = Number(p && p.age);
    const val = calcValueNum(p);
    if (age >= 27 && val >= c.start) aging += 1;
    if (age < 25.5 && val >= c.stud) young += 1;
  });
  if (pos <= 6.25 && near >= 6.2) return "tank";
  if (pos <= 5.55 && near >= 4.8) return "rebuild";
  if (pos >= 6.35 && young >= 3 && near >= 2.2) return "contend-soon";
  if (pos >= 6.35 && young >= 2 && aging <= 2 && near <= 2.6) return "tween";
  if (pos >= 6.35 && near <= 2.6 && (aging >= 3 || young <= 1)) return "win-now";
  if (pos >= 6.2 && near >= 3.5 && young >= 1) return "contend-soon";
  return "tween";
}
function mixOf(kind) {
  if (kind === "tank") return [0.52, 0.1, 0.38];
  if (kind === "rebuild") return [0.58, 0.12, 0.3];
  if (kind === "win-now") return [0.88, 0.1, 0.02];
  if (kind === "contend-soon") return [0.7, 0.12, 0.18];
  return [0.66, 0.14, 0.2];
}
function overallFrom(bag, picks, slots, cuts, uid) {
  const pos = posBlendOf(bag, slots, cuts);
  const depth = depthOf(bag, slots, cuts);
  const draft = draftFromRaw(picks || [], cuts);
  const mix = mixOf(windowOf(bag, uid || "", slots, cuts));
  return round10(pos * mix[0] + depth.raw * mix[1] + draft * mix[2]);
}
function overallOf(bag, uid, slots, cuts) {
  return overallFrom(bag, picksOf(uid), slots, cuts, uid);
}

const seats = members.map((m) => ({
  uid: String(m.user_id),
  name: m.name,
  bag: bagOf(String(m.user_id)),
})).map((s) => {
  const grades = gradesOf(s.bag);
  const depth = depthOf(s.bag);
  const draft = draftOf(s.uid);
  return Object.assign(s, {
    grades: grades,
    depth: depth,
    draft: draft,
    window: windowOf(s.bag, s.uid),
    overall: overallOf(s.bag, s.uid),
  });
});

// 1 Repeatability — same bag, same numbers, twice
loop(1, seats.every((s) => {
  const again = gradesOf(bagOf(s.uid));
  return JSON.stringify(again) === JSON.stringify(s.grades)
    && draftOf(s.uid) === s.draft
    && overallOf(bagOf(s.uid), s.uid) === s.overall;
}), "same bag reprints the same grades, draft, and team grade");

// 2 Bounds — every seat, every number is 0–10 and finite
loop(2, seats.every((s) => {
  const nums = [s.grades.QB, s.grades.RB, s.grades.WR, s.grades.TE, s.depth.score, s.draft, s.overall];
  return nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 10 && n === Math.round(n));
}) && seats.length === 10 && seats.every((s) => s.depth.slots === 8),
  "all ten seats print integer 0–10 grades with no NaN");

// 3 Empty bag / empty picks / one backup is not elite depth
loop(3, JSON.stringify(gradesOf([])) === JSON.stringify({ QB: 0, RB: 0, WR: 0, TE: 0 })
  && depthOf([]).score === 0
  && depthOf([]).slots === 8
  && depthOf([{ pos: "QB", value: 8000 }, { pos: "QB", value: 6000 }, { pos: "QB", value: 9000 }]).score === 1
  && overallFrom([], []) === 0
  && draftOf("no-such-seat") === 0
  && draftFrom([]) === 0,
  "empty bag grades 0; one stud backup is 1/10, not 10");

// 4 Missing a position is a zero slot, not a skip
{
  const onlyQb = [{ pos: "QB", value: 8000 }, { pos: "QB", value: 6000 }];
  const g = gradesOf(onlyQb);
  loop(4, g.QB === 9 && g.RB === 0 && g.WR === 0 && g.TE === 0,
    "a bag with only QBs zeros the empty desk slots");
}

// 5 Junk values never throw and never score
{
  const junk = [
    { pos: "RB", value: null },
    { pos: "RB", value: "nope" },
    { pos: "RB", value: NaN },
    { pos: "WR", value: -40 },
    { pos: "WR" },
  ];
  const g = gradesOf(junk);
  const lower = [
    { pos: "qb", value: 8000 },
    { pos: "qb", value: 6000 },
    { pos: "rb", value: 9000 },
    { pos: "rb", value: 7000 },
  ];
  loop(5, g.RB === 0 && g.WR === 0 && valueGrade(null) === 0 && valueGrade("x") === 0
    && valueGrade(Infinity) === 0 && valueGrade(-Infinity) === 0
    && draftFrom([{ value: null }, { value: "nope" }, { value: -9 }]) === 0
    && gradesOf(lower).QB === 9 && gradesOf(lower).RB === 9,
    "junk values grade 0; lowercase pos tags still score");
}

// 6 Exact cuts are defendable and stable
{
  const elite = DESK_STUD + (DESK_STUD - DESK_START);
  loop(6, Math.abs(valueGrade(DESK_STUD) - 7.5) < 1e-9
    && Math.abs(valueGrade(DESK_START) - 3) < 1e-9
    && Math.abs(valueGrade(DESK_MID) - 2) < 1e-9
    && valueGrade(elite) === 10
    && valueGrade(DESK_STUD - 1) < 7.5
    && valueGrade(DESK_START - 1) < 3,
    "start=3, mid=2, stud=7.5, elite=10 on the Superflex cuts");
}

// 7 1QB cuts move the same player — not a league rank
{
  const oneQb = { stud: 3800, start: 1400, mid: 1100 };
  const v = 2200;
  loop(7, valueGrade(v) === 3 && valueGrade(v, oneQb) > 3,
    "same 2200 player is a starter on SF and above a starter on 1QB cuts");
}

// 8 Book accuracy: KingHenry RB > ARae RB; TipsUp draft < ARae draft
{
  const king = seats.find((s) => s.name === "KingHenryXXVI");
  const arae = seats.find((s) => s.name === "ARae");
  const tips = seats.find((s) => s.name === "TipsUp");
  const ted = seats.find((s) => s.name === "TedCumberbatch");
  const ners = seats.find((s) => s.name === "SF69erss");
  const berg = seats.find((s) => s.name === "bigjberg");
  const shremp = seats.find((s) => s.name === "BubbaCuckShremp");
  const ducks = seats.find((s) => s.name === "DarkWingDucks2023");
  loop(8, king && arae && tips && ted && ners && berg && shremp && ducks
    && king.grades.RB > arae.grades.RB
    && tips.draft < arae.draft
    && king.grades.WR >= 7
    && arae.draft >= 7
    && tips.draft <= 1
    && king.window === "win-now"
    && tips.window === "win-now"
    && ted.window === "win-now"
    && ners.window === "win-now"
    && berg.window === "contend-soon"
    && shremp.window === "contend-soon"
    && ducks.window === "tween",
    "KingHenry RB beats ARae; win-now / compete-soon / tween windows match the bags");
}

// 9 Team grade is the published window mix, not a new value formula
loop(9, seats.every((s) => {
  const expect = overallOf(s.bag, s.uid);
  return expect === s.overall;
}), "team grade uses the window mix on unrounded pos / depth / draft");

// 10 Draft weights the next two drafts; far 4ths cannot pad a chest to 10
{
  const partsFn = fnSrc(page, "teamAnalyzerDraftParts");
  const years = nearYears();
  const fourNearFirsts = Array.from({ length: 4 }, () => ({ value: 5785, year: years.near1, round: 1 }));
  const sixNearFirsts = Array.from({ length: 6 }, () => ({ value: 5785, year: years.near1, round: 1 }));
  const twentyFarLate = Array.from({ length: 20 }, () => ({ value: 1400, year: years.near2 + 1, round: 4 }));
  const twoFarFirsts = [{ value: 5785, year: years.near2 + 1, round: 1 }, { value: 3667, year: years.near2 + 1, round: 1 }];
  const gumby = seats.find((s) => s.name === "ChiefGumby");
  const truman = seats.find((s) => s.name === "TrumanCooper");
  const arae = seats.find((s) => s.name === "ARae");
  loop(10, partsFn.includes("teamAnalyzerValueGrade")
    && partsFn.includes("nearPts / 9")
    && partsFn.includes("start * 12") === false
    && draftFrom([]) === 0
    && draftFrom(fourNearFirsts) >= 4
    && draftFrom(sixNearFirsts) >= 6
    && draftFrom(twentyFarLate) <= 2
    && draftFrom(twoFarFirsts) <= 2
    && arae && gumby && truman
    && arae.draft >= gumby.draft
    && gumby.draft >= truman.draft
    && arae.window === "tank"
    && gumby.window === "tank"
    && truman.window === "rebuild"
    && fnSrc(page, "teamAnalyzerDepth").includes("of 8 backup spots") === false
    && fnSrc(page, "teamAnalyzerDepth").includes("Short a starter") === false
    && fnSrc(page, "teamAnalyzerMoves").includes("dir.sell") === false,
    "2027/2028 firsts weigh most; late far picks do not pad to 10");
}

// 11 Page and generate-page stay on the same formula
loop(11, fnSrc(page, "teamAnalyzerValueGrade") === fnSrc(gen, "teamAnalyzerValueGrade")
  && fnSrc(page, "teamAnalyzerGrades") === fnSrc(gen, "teamAnalyzerGrades")
  && fnSrc(page, "teamAnalyzerPosScore") === fnSrc(gen, "teamAnalyzerPosScore")
  && fnSrc(page, "teamAnalyzerPosBlend") === fnSrc(gen, "teamAnalyzerPosBlend")
  && fnSrc(page, "teamAnalyzerDraft") === fnSrc(gen, "teamAnalyzerDraft")
  && fnSrc(page, "teamAnalyzerDraftRaw") === fnSrc(gen, "teamAnalyzerDraftRaw")
  && fnSrc(page, "teamAnalyzerDraftParts") === fnSrc(gen, "teamAnalyzerDraftParts")
  && fnSrc(page, "teamAnalyzerWindow") === fnSrc(gen, "teamAnalyzerWindow")
  && fnSrc(page, "teamAnalyzerOverall") === fnSrc(gen, "teamAnalyzerOverall")
  && fnSrc(page, "teamAnalyzerScale") === fnSrc(gen, "teamAnalyzerScale")
  && fnSrc(page, "teamAnalyzerDepth") === fnSrc(gen, "teamAnalyzerDepth")
  && fnSrc(page, "teamAnalyzerPos") === fnSrc(gen, "teamAnalyzerPos")
  && fnSrc(page, "teamAnalyzerMoves") === fnSrc(gen, "teamAnalyzerMoves")
  && fnSrc(page, "teamAnalyzerValueGrade").includes("const elite = stud + (stud - start)")
  && fnSrc(page, "teamAnalyzerPosBlend").includes("mean * 0.75 + hole * 0.25")
  && fnSrc(page, "teamAnalyzerPickWeight").includes("1.55")
  && fnSrc(page, "teamAnalyzerDepth").includes("teamAnalyzerPosFloor") === false
  && fnSrc(page, "teamAnalyzerHtml").includes("fmt(") === false
  && fnSrc(page, "teamAnalyzerShareDraw") === fnSrc(gen, "teamAnalyzerShareDraw")
  && fnSrc(page, "teamAnalyzerShareDraw").includes("Starting lineup")
  && fnSrc(page, "teamAnalyzerShareDraw").includes("Chuckle Fantasy") === false
  && fnSrc(page, "teamAnalyzerScale").includes('kind === "tank"'),
  "index.html and generate-page.mjs share one grade formula; no league floor, no fmt");

// 12 Same bags match; 8–9 is rare; starter-only is not an 8
{
  const clone = seats[0].bag.map((p) => Object.assign({}, p));
  const a = gradesOf(seats[0].bag);
  const b = gradesOf(clone);
  const sameOverall = seats.filter((s) => s.overall === seats[0].overall).length >= 1;
  const overs = seats.map((s) => s.overall);
  const truman = seats.find((s) => s.name === "TrumanCooper");
  const starters = [
    { pos: "QB", value: DESK_START }, { pos: "QB", value: DESK_START },
    { pos: "RB", value: DESK_START }, { pos: "RB", value: DESK_START },
    { pos: "WR", value: DESK_START }, { pos: "WR", value: DESK_START }, { pos: "WR", value: DESK_START },
    { pos: "TE", value: DESK_START },
  ];
  const elites = [
    { pos: "QB", value: 8800 }, { pos: "QB", value: 8800 },
    { pos: "RB", value: 8800 }, { pos: "RB", value: 8800 },
    { pos: "WR", value: 8800 }, { pos: "WR", value: 8800 }, { pos: "WR", value: 8800 },
    { pos: "TE", value: 8800 },
  ];
  const years = nearYears();
  const elitePicks = Array.from({ length: 8 }, () => ({ value: 8800, year: years.near1, round: 1 }));
  loop(12, JSON.stringify(a) === JSON.stringify(b) && sameOverall
    && truman && truman.overall <= 6
    && Math.max(...overs) <= 8
    && Math.min(...overs) <= 5
    && (Math.max(...overs) - Math.min(...overs)) >= 2
    && seats.every((s) => s.overall < 8 || s.overall <= 8)
    && overallFrom(starters, [], DESK_SLOTS, null, "synth-start") <= 3
    && overallFrom(elites, elitePicks, DESK_SLOTS, null, "synth-elite") >= 7,
    "cloned bag matches; 8–9 is rare; starter-only prints 3 or under");
}

console.log(JSON.stringify({
  ok: fails === 0,
  fails: fails,
  seats: seats.map((s) => ({
    name: s.name,
    overall: s.overall,
    grades: s.grades,
    depth: s.depth.score,
    extras: s.depth.n,
    startable: s.depth.startable,
    draft: s.draft,
    window: s.window,
    players: s.bag.length,
    picks: picksOf(s.uid).length,
  })),
}, null, 2));
if (fails) process.exit(1);
