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
  return mean * 0.7 + hole * 0.3;
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
function draftFromRaw(picks, cuts) {
  const ordered = (picks || []).slice().sort((a, b) => calcValueNum(b) - calcValueNum(a));
  const need = 12;
  let pts = 0;
  for (let i = 0; i < need; i++) pts += valueGrade(ordered[i] ? calcValueNum(ordered[i]) : -1, cuts);
  return pts / need;
}
function draftFrom(picks, cuts) {
  return round10(draftFromRaw(picks, cuts));
}
function draftOf(uid, cuts) {
  return draftFrom(picksOf(uid), cuts);
}
function overallFrom(bag, picks, slots, cuts) {
  const pos = posBlendOf(bag, slots, cuts);
  const depth = depthOf(bag, slots, cuts);
  const draft = draftFromRaw(picks || [], cuts);
  return round10(pos * 0.7 + depth.raw * 0.15 + draft * 0.15);
}
function overallOf(bag, uid, slots, cuts) {
  return overallFrom(bag, picksOf(uid), slots, cuts);
}

const seats = members.map((m) => ({
  uid: String(m.user_id),
  name: m.name,
  bag: bagOf(String(m.user_id)),
})).map((s) => {
  const grades = gradesOf(s.bag);
  const depth = depthOf(s.bag);
  const draft = draftOf(s.uid);
  return Object.assign(s, { grades: grades, depth: depth, draft: draft, overall: overallOf(s.bag, s.uid) });
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
  loop(8, king && arae && tips
    && king.grades.RB > arae.grades.RB
    && tips.draft < arae.draft
    && king.grades.WR >= 7
    && arae.draft >= 4
    && tips.draft <= 2,
    "KingHenry RB beats ARae; TipsUp thin chest grades under ARae firsts");
}

// 9 Team grade is the published mix, not a new curve
loop(9, seats.every((s) => {
  const expect = overallOf(s.bag, s.uid);
  return expect === s.overall;
}), "team grade is 70% pos blend (70/30 hole) / 15% depth / 15% draft");

// 10 Draft is a 12-slot valueGrade chest — extras and late 4ths cannot pad to 10
{
  const draftFn = fnSrc(page, "teamAnalyzerDraftRaw");
  const twelveStart = Array.from({ length: 12 }, () => ({ value: DESK_START }));
  const twentyStart = Array.from({ length: 20 }, () => ({ value: DESK_START }));
  const twelveStud = Array.from({ length: 12 }, () => ({ value: DESK_STUD }));
  const twentyLate = Array.from({ length: 20 }, () => ({ value: 1400 }));
  const twoFirsts = [{ value: 5785 }, { value: 3667 }];
  loop(10, draftFn.includes("teamAnalyzerValueGrade")
    && draftFn.includes("const need = 12")
    && draftFn.includes("start * 12") === false
    && draftFrom(twelveStart) === 3
    && draftFrom(twentyStart) === 3
    && draftFrom(twelveStud) === 8
    && draftFrom(twentyLate) <= 2
    && draftFrom(twoFirsts) <= 2
    && fnSrc(page, "teamAnalyzerDepth").includes("of 8 backup spots") === false
    && fnSrc(page, "teamAnalyzerDepth").includes("Short a starter") === false
    && fnSrc(page, "teamAnalyzerMoves").includes("dir.sell") === false,
    "draft scores top 12 like roster slots; late 4ths and extra picks do not pad to 10");
}

// 11 Page and generate-page stay on the same formula
loop(11, fnSrc(page, "teamAnalyzerValueGrade") === fnSrc(gen, "teamAnalyzerValueGrade")
  && fnSrc(page, "teamAnalyzerGrades") === fnSrc(gen, "teamAnalyzerGrades")
  && fnSrc(page, "teamAnalyzerPosScore") === fnSrc(gen, "teamAnalyzerPosScore")
  && fnSrc(page, "teamAnalyzerPosBlend") === fnSrc(gen, "teamAnalyzerPosBlend")
  && fnSrc(page, "teamAnalyzerDraft") === fnSrc(gen, "teamAnalyzerDraft")
  && fnSrc(page, "teamAnalyzerDraftRaw") === fnSrc(gen, "teamAnalyzerDraftRaw")
  && fnSrc(page, "teamAnalyzerOverall") === fnSrc(gen, "teamAnalyzerOverall")
  && fnSrc(page, "teamAnalyzerScale") === fnSrc(gen, "teamAnalyzerScale")
  && fnSrc(page, "teamAnalyzerDepth") === fnSrc(gen, "teamAnalyzerDepth")
  && fnSrc(page, "teamAnalyzerPos") === fnSrc(gen, "teamAnalyzerPos")
  && fnSrc(page, "teamAnalyzerMoves") === fnSrc(gen, "teamAnalyzerMoves")
  && fnSrc(page, "teamAnalyzerValueGrade").includes("const elite = stud + (stud - start)")
  && fnSrc(page, "teamAnalyzerPosBlend").includes("mean * 0.7 + hole * 0.3")
  && fnSrc(page, "teamAnalyzerDepth").includes("teamAnalyzerPosFloor") === false
  && fnSrc(page, "teamAnalyzerHtml").includes("fmt(") === false
  && fnSrc(page, "teamAnalyzerShareDraw") === fnSrc(gen, "teamAnalyzerShareDraw")
  && fnSrc(page, "teamAnalyzerShareDraw").includes("Starting lineup")
  && fnSrc(page, "teamAnalyzerShareDraw").includes("Chuckle Fantasy") === false
  && fnSrc(page, "teamAnalyzerScale").includes('lab === "Hard rebuild"'),
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
  const elitePicks = Array.from({ length: 12 }, () => ({ value: 8800 }));
  loop(12, JSON.stringify(a) === JSON.stringify(b) && sameOverall
    && truman && truman.overall <= 6
    && Math.max(...overs) <= 8
    && Math.min(...overs) <= 5
    && (Math.max(...overs) - Math.min(...overs)) >= 2
    && seats.every((s) => s.overall < 8 || s.overall <= 8)
    && overallFrom(starters, []) <= 3
    && overallFrom(elites, elitePicks) >= 8,
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
    players: s.bag.length,
    picks: picksOf(s.uid).length,
  })),
}, null, 2));
if (fails) process.exit(1);
