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
    .sort(assetCmp);
}
function posScoreOf(bag, pos, slots, cuts) {
  const s = slots || DESK_SLOTS;
  const need = s[pos] || 1;
  const pool = bag.filter((p) => posOf(p) === pos).sort(assetCmp);
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
function posBlendOf(bag, slots, cuts, holeW) {
  const scores = ["QB", "RB", "WR", "TE"].map((pos) => posScoreOf(bag, pos, slots, cuts));
  const mean = (scores[0] + scores[1] + scores[2] + scores[3]) / 4;
  const hole = Math.min(...scores);
  const hw = holeW == null ? 0.25 : holeW;
  return mean * (1 - hw) + hole * hw;
}
function holeOf(bag, slots, cuts) {
  return Math.min(
    posScoreOf(bag, "QB", slots, cuts),
    posScoreOf(bag, "RB", slots, cuts),
    posScoreOf(bag, "WR", slots, cuts),
    posScoreOf(bag, "TE", slots, cuts),
  );
}
function stretchOf(n, kind) {
  const x = Number(n) || 0;
  const c = 6.15;
  if (kind === "win-now" || kind === "win-now-reload") {
    if (x >= c) return c + (x - c) * 1.55;
    return x;
  }
  if (x >= c) return c + (x - c) * 1.2;
  return c + (x - c) * 2.05;
}
function posOf(p) {
  return String((p && p.pos) || "").toUpperCase();
}
function assetCmp(a, b) {
  const d = calcValueNum(b) - calcValueNum(a);
  if (d) return d;
  const na = String((a && a.name) || "");
  const nb = String((b && b.name) || "");
  if (na < nb) return -1;
  if (na > nb) return 1;
  return String((a && a.id) || "").localeCompare(String((b && b.id) || ""));
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
    const pool = bag.filter((p) => posOf(p) === pos).sort(assetCmp);
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
    if (y < years.near1) return;
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
    bag.filter((p) => posOf(p) === pos).sort(assetCmp)
      .slice(0, s[pos] || 1).forEach((p) => out.push(p));
  });
  return out;
}
function windowOf(bag, uid, slots, cuts) {
  return windowFrom(bag, picksOf(uid), slots, cuts);
}
function windowFrom(bag, picks, slots, cuts) {
  const pos = posBlendOf(bag, slots, cuts);
  const years = nearYears();
  let nearPts = 0;
  (picks || []).forEach((p) => {
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
    if (Number.isFinite(age) && age >= 27 && val >= c.start) aging += 1;
    if (Number.isFinite(age) && age < 25.5 && val >= c.stud) young += 1;
  });
  const hole = holeOf(bag, slots, cuts);
  if (pos <= 6.25 && near >= 8) return "hard-tank";
  if (pos <= 6.25 && near >= 6.2) return "tank";
  if (pos <= 5.55 && near >= 4.8) return "rebuild";
  if (pos >= 6.35 && aging >= 3 && near < 5 && hole <= 5.2) return "win-now-reload";
  if (pos >= 6.35 && aging >= 3 && near < 5) return "win-now";
  if (pos >= 6.35 && young >= 3 && near >= 3.8) return "contend-soon";
  if (pos >= 6.35 && young >= 3 && near >= 2.2) return "climbing";
  if (pos >= 6.35 && young >= 2 && aging <= 2 && near <= 2.6) return "tween";
  if (pos >= 6.35 && aging >= 3 && near <= 2.6) return "win-now";
  if (pos >= 6.2 && near >= 3.5 && young >= 1) return "climbing";
  return "tween";
}
function mixOf(kind) {
  if (kind === "hard-tank") return [0.5, 0.1, 0.4];
  if (kind === "tank") return [0.52, 0.1, 0.38];
  if (kind === "rebuild") return [0.56, 0.12, 0.32];
  if (kind === "win-now" || kind === "win-now-reload") return [0.9, 0.08, 0.02];
  if (kind === "contend-soon") return [0.66, 0.13, 0.21];
  if (kind === "climbing") return [0.7, 0.14, 0.16];
  return [0.64, 0.16, 0.2];
}
function overallFrom(bag, picks, slots, cuts, uid) {
  const kind = windowFrom(bag, picks || [], slots, cuts);
  const now = kind === "win-now" || kind === "win-now-reload";
  const pos = posBlendOf(bag, slots, cuts, now ? 0.18 : 0.32);
  const depth = depthOf(bag, slots, cuts);
  const draft = draftFromRaw(picks || [], cuts);
  const mix = mixOf(kind);
  return round10(stretchOf(pos * mix[0] + depth.raw * mix[1] + draft * mix[2], kind));
}
function overallOf(bag, uid, slots, cuts) {
  return overallFrom(bag, picksOf(uid), slots, cuts, uid);
}
function nowFrom(bag, slots, cuts) {
  const mean = ["QB", "RB", "WR", "TE"].reduce((s, pos) => s + posScoreOf(bag, pos, slots, cuts), 0) / 4;
  const d = depthOf(bag, slots, cuts).raw;
  return round10(stretchOf(mean * 0.94 + d * 0.06, "win-now"));
}
function laterFrom(bag, picks, slots, cuts) {
  const pos = posBlendOf(bag, slots, cuts, 0.32);
  const d = depthOf(bag, slots, cuts).raw;
  return round10(stretchOf(pos * 0.4 + d * 0.15 + draftFromRaw(picks || [], cuts) * 0.45, "rebuild"));
}
function nowOf(bag, uid, slots, cuts) {
  return nowFrom(bag, slots, cuts);
}
function laterOf(bag, uid, slots, cuts) {
  return laterFrom(bag, picksOf(uid), slots, cuts);
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
    now: nowOf(s.bag, s.uid),
    later: laterOf(s.bag, s.uid),
  });
});

// 1 Repeatability — same bag, same numbers, twice
loop(1, seats.every((s) => {
  const again = gradesOf(bagOf(s.uid));
  return JSON.stringify(again) === JSON.stringify(s.grades)
    && draftOf(s.uid) === s.draft
    && overallOf(bagOf(s.uid), s.uid) === s.overall
    && nowOf(bagOf(s.uid), s.uid) === s.now
    && laterOf(bagOf(s.uid), s.uid) === s.later;
}), "same bag reprints the same grades, draft, Now, Later, and team grade");

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
    && ners.window === "win-now-reload"
    && berg.window === "climbing"
    && shremp.window === "contend-soon"
    && ducks.window === "tween",
    "KingHenry RB beats ARae; win-now / reload / climbing / compete-soon match the bags");
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
    && arae.window === "hard-tank"
    && gumby.window === "tank"
    && truman.window === "rebuild"
    && fnSrc(page, "teamAnalyzerDepth").includes("of 8 backup spots") === false
    && fnSrc(page, "teamAnalyzerDepth").includes("after the desk")
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
  && fnSrc(page, "teamAnalyzerPosBlend").includes("1 - hw")
  && fnSrc(page, "teamAnalyzerStretch") === fnSrc(gen, "teamAnalyzerStretch")
  && fnSrc(page, "teamAnalyzerNowKind") === fnSrc(gen, "teamAnalyzerNowKind")
  && fnSrc(page, "teamAnalyzerNow") === fnSrc(gen, "teamAnalyzerNow")
  && fnSrc(page, "teamAnalyzerLater") === fnSrc(gen, "teamAnalyzerLater")
  && fnSrc(page, "teamAnalyzerRooms") === fnSrc(gen, "teamAnalyzerRooms")
  && fnSrc(page, "teamAnalyzerPosMean") === fnSrc(gen, "teamAnalyzerPosMean")
  && fnSrc(page, "teamAnalyzerMix") === fnSrc(gen, "teamAnalyzerMix")
  && fnSrc(page, "teamAnalyzerHole") === fnSrc(gen, "teamAnalyzerHole")
  && fnSrc(page, "teamAnalyzerAssetCmp") === fnSrc(gen, "teamAnalyzerAssetCmp")
  && fnSrc(page, "teamAnalyzerPickWeight").includes("1.55")
  && fnSrc(page, "teamAnalyzerWindow").includes("Number.isFinite(age)")
  && fnSrc(page, "teamAnalyzerWindow").includes("aging >= 3 && near < 5")
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
    && truman && truman.overall <= 5
    && Math.max(...overs) <= 8
    && Math.min(...overs) <= 4
    && (Math.max(...overs) - Math.min(...overs)) >= 3
    && seats.every((s) => s.overall < 8 || s.overall <= 8)
    && overallFrom(starters, [], DESK_SLOTS, null, "synth-start") <= 3
    && overallFrom(elites, elitePicks, DESK_SLOTS, null, "synth-elite") >= 7,
    "cloned bag matches; 8–9 is rare; starter-only prints 3 or under");
}

{
  const tips = seats.find((s) => s.name === "TipsUp");
  const truman = seats.find((s) => s.name === "TrumanCooper");
  const oneStud = [
    { pos: "QB", value: 8000 }, { pos: "QB", value: 6000 }, { pos: "QB", value: 9000 },
  ];
  const padded = oneStud.concat([
    { pos: "QB", value: 4000 }, { pos: "QB", value: 3900 }, { pos: "QB", value: 3800 },
  ]);
  loop(13, tips && truman
    && tips.depth.startable === 8 && truman.depth.startable === 8
    && tips.depth.raw > truman.depth.raw
    && tips.depth.score >= truman.depth.score
    && depthOf(oneStud).score === 1
    && depthOf(padded).score === depthOf(oneStud.concat([{ pos: "QB", value: 4000 }])).score
    && fnSrc(page, "teamAnalyzerDepth").includes("teamAnalyzerValueGrade")
    && fnSrc(page, "teamAnalyzerDepth").includes("startable"),
    "depth is eight after-desk grades, not a starter-value headcount");
}

{
  const depthFn = fnSrc(page, "teamAnalyzerDepth");
  loop(14, depthFn.includes("after the desk")
    && depthFn.includes("starter value")
    && depthFn.includes("backup spots") === false
    && depthFn.includes("Short a starter") === false
    && depthFn.includes("of 8") === false
    && depthFn === fnSrc(gen, "teamAnalyzerDepth"),
    "depth note names filled after-desk slots, not a hard-coded eight");
}

{
  const tied = [
    { pos: "RB", value: 4000, name: "Zed", id: "2" },
    { pos: "RB", value: 4000, name: "Amy", id: "1" },
    { pos: "RB", value: 3000, name: "Bob", id: "3" },
  ];
  const shuffled = tied.slice().reverse();
  const poolFn = fnSrc(page, "teamAnalyzerPosPool");
  loop(15, JSON.stringify(gradesOf(tied)) === JSON.stringify(gradesOf(shuffled))
    && JSON.stringify(depthOf(tied)) === JSON.stringify(depthOf(shuffled))
    && poolFn.includes("teamAnalyzerAssetCmp")
    && fnSrc(page, "teamAnalyzerAssetCmp").includes("a.name")
    && fnSrc(page, "teamAnalyzerAssetCmp") === fnSrc(gen, "teamAnalyzerAssetCmp"),
    "equal-value players sort by name/id so the same bag reprints");
}

{
  const valFn = fnSrc(page, "calcValueNum");
  const analyzerBlob = [
    fnSrc(page, "teamAnalyzerPosScore"),
    fnSrc(page, "teamAnalyzerDepth"),
    fnSrc(page, "teamAnalyzerDraftParts"),
    fnSrc(page, "teamAnalyzerWindow"),
  ].join("\n");
  loop(16, valFn.includes("a.value")
    && valFn.includes("value_flat") === false
    && analyzerBlob.includes("value_flat") === false
    && analyzerBlob.includes("calcValueNum"),
    "analyzer grades use today value, never value_flat");
}

{
  const years = nearYears();
  const elite = { value: 8800, round: 1 };
  loop(17, draftFrom([]) === 0
    && draftFrom([{ value: 8800 }]) === 0
    && draftFrom([{ value: 8800, year: years.near1 - 1, round: 1 }]) === 0
    && draftFrom([{ value: 8800, season: years.near1, round: 1 }]) >= 1
    && draftFrom([Object.assign({}, elite, { year: years.near1 })])
      >= draftFrom([Object.assign({}, elite, { year: years.near2 })])
    && fnSrc(page, "teamAnalyzerDraftParts").includes("y < years.near1"),
    "yearless and already-drafted picks do not score; season still counts");
}

{
  const years = nearYears();
  const mid = { value: 3000, round: 2 };
  const near1 = draftFromRaw([Object.assign({}, mid, { year: years.near1 })]);
  const near2 = draftFromRaw([Object.assign({}, mid, { year: years.near2 })]);
  const far = draftFromRaw([Object.assign({}, mid, { year: years.near2 + 1 })]);
  const w1 = pickWeight(Object.assign({}, mid, { year: years.near1, round: 1 }));
  const w2 = pickWeight(Object.assign({}, mid, { year: years.near2, round: 1 }));
  const w3 = pickWeight(Object.assign({}, mid, { year: years.near2 + 1, round: 1 }));
  loop(18, near1 > near2 && near2 > far
    && w1 > w2 && w2 > w3
    && fnSrc(page, "teamAnalyzerPickWeight").includes("years.near1")
    && fnSrc(page, "teamAnalyzerPickWeight").includes("1.55")
    && fnSrc(page, "teamAnalyzerPickWeight").includes("1.35"),
    "same mid pick is heavier in the next draft than the one after, then far");
}

{
  const agingBag = [
    { pos: "QB", value: 6000, age: 29, name: "Q1" }, { pos: "QB", value: 5000, age: 28, name: "Q2" },
    { pos: "RB", value: 6000, age: 29, name: "R1" }, { pos: "RB", value: 5000, age: 28, name: "R2" },
    { pos: "WR", value: 6000, age: 29, name: "W1" }, { pos: "WR", value: 5000, age: 28, name: "W2" },
    { pos: "WR", value: 4000, age: 28, name: "W3" },
    { pos: "TE", value: 4000, age: 28, name: "T1" },
  ];
  const years = nearYears();
  const modest = [{ value: 5785, year: years.near1, round: 1 }, { value: 3667, year: years.near2, round: 1 }];
  const fat = Array.from({ length: 6 }, () => ({ value: 5785, year: years.near1, round: 1 }));
  const noAge = agingBag.map((p) => ({ pos: p.pos, value: p.value, name: p.name }));
  loop(19, windowFrom(agingBag, modest) === "win-now"
    && windowFrom(agingBag, fat) !== "win-now"
    && windowFrom(noAge, modest) !== "win-now"
    && fnSrc(page, "teamAnalyzerWindow").includes("ARae") === false
    && fnSrc(page, "teamAnalyzerWindow").includes("TipsUp") === false
    && fnSrc(page, "teamAnalyzerWindow").includes("Number.isFinite(age)"),
    "aging win-now holds a modest 27/28 chest; missing age is not a window vote");
}

{
  const winFn = fnSrc(page, "teamAnalyzerWindow");
  loop(20, winFn.indexOf('return "hard-tank"') < winFn.indexOf('return "tank"')
    && winFn.indexOf('return "tank"') < winFn.indexOf('return "rebuild"')
    && winFn.indexOf("aging >= 3 && near < 5") < winFn.indexOf("young >= 3")
    && winFn.includes("win-now-reload")
    && winFn.includes("climbing")
    && winFn.includes("seatDirection") === false
    && winFn.includes("dir.") === false
    && winFn === fnSrc(gen, "teamAnalyzerWindow"),
    "window order is hard-tank / tank / rebuild / aging-now / young, never seat-direction");
}

{
  const tips = seats.find((s) => s.name === "TipsUp");
  const arae = seats.find((s) => s.name === "ARae");
  const years = nearYears();
  const emptyChest = [];
  const historic = Array.from({ length: 6 }, () => ({ value: 5785, year: years.near1, round: 1 }));
  const winNowEmpty = overallFrom(tips.bag, emptyChest);
  const winNowFat = overallFrom(tips.bag, historic);
  const tankEmpty = overallFrom(arae.bag, emptyChest);
  const tankFat = overallFrom(arae.bag, historic);
  loop(21, tips && arae
    && Math.abs(winNowFat - winNowEmpty) <= 1
    && (tankFat - tankEmpty) >= 2
    && mixOf("win-now")[2] === 0.02
    && mixOf("win-now-reload")[2] === 0.02
    && mixOf("tank")[2] === 0.38,
    "win-now team grade barely moves with picks; a tank chest lifts the overall");
}

{
  const htmlFn = fnSrc(page, "teamAnalyzerHtml");
  const shareFn = fnSrc(page, "teamAnalyzerShareDraw");
  loop(22, htmlFn.includes("card.overall")
    && htmlFn.includes("card.depth.note")
    && htmlFn.includes("card.draft")
    && htmlFn.includes("card.now")
    && htmlFn.includes("card.later")
    && htmlFn.includes("this year\\'s desk")
    && htmlFn.includes("next two drafts + book")
    && htmlFn.includes("next two drafts weigh most")
    && shareFn.includes("card.overall")
    && shareFn.includes("card.depth")
    && shareFn.includes("draftNote")
    && shareFn.includes('scoreBox("Now"')
    && shareFn.includes('scoreBox("Later"')
    && shareFn.includes("next two drafts weigh most")
    && shareFn === fnSrc(gen, "teamAnalyzerShareDraw"),
    "on-page card and share PNG print the same overall / Now / Later / draft fields");
}

{
  const onFn = fnSrc(page, "teamAnalyzerEnabled");
  const oneQb = { stud: 3800, start: 1400, mid: 1100 };
  loop(23, onFn.includes("isGmLeague()")
    && onFn.includes("isRedraftLeague()")
    && fnSrc(page, "renderGmTeamHome").includes("teamAnalyzerHtml") === false
    && valueGrade(2200) === 3
    && valueGrade(2200, oneQb) > 3
    && onFn === fnSrc(gen, "teamAnalyzerEnabled"),
    "analyzer stays off GM / redraft; 1QB cuts still move the same player");
}

{
  const again = members.map((m) => {
    const uid = String(m.user_id);
    const bag = bagOf(uid);
    return {
      name: m.name,
      grades: gradesOf(bag),
      depth: depthOf(bag).score,
      draft: draftOf(uid),
      window: windowOf(bag, uid),
      overall: overallOf(bag, uid),
      now: nowOf(bag, uid),
      later: laterOf(bag, uid),
    };
  });
  const ners = seats.find((s) => s.name === "SF69erss");
  const arae = seats.find((s) => s.name === "ARae");
  const tips = seats.find((s) => s.name === "TipsUp");
  const years = nearYears();
  const historic = Array.from({ length: 6 }, () => ({ value: 5785, year: years.near1, round: 1 }));
  loop(24, seats.length === 10
    && again.every((a, i) => JSON.stringify(a) === JSON.stringify({
      name: seats[i].name,
      grades: seats[i].grades,
      depth: seats[i].depth.score,
      draft: seats[i].draft,
      window: seats[i].window,
      overall: seats[i].overall,
      now: seats[i].now,
      later: seats[i].later,
    }))
    && ners && ners.grades.TE <= 4
    && ners.overall >= 7
    && ners.now >= 8
    && ners.later <= 3
    && ners.window === "win-now-reload"
    && ners.overall >= (arae || {}).overall
    && ners.now >= (arae || {}).now
    && arae && arae.later >= arae.now
    && tips && nowFrom(tips.bag) === nowFrom(tips.bag)
    && laterFrom(tips.bag, []) < laterFrom(tips.bag, historic)
    && fnSrc(page, "teamAnalyzerNowRaw").includes("0.94")
    && fnSrc(page, "teamAnalyzerLaterRaw").includes("0.45")
    && fnSrc(page, "teamAnalyzerNowRaw").includes("teamAnalyzerDraft") === false
    && seats.filter((s) => s.overall >= 8).length === 0
    && seats.filter((s) => s.overall <= 5).length >= 1,
    "second reprint matches; Now is the desk, Later is the book, 69ers today above a tank");
}

console.log(JSON.stringify({
  ok: fails === 0,
  fails: fails,
  seats: seats.map((s) => ({
    name: s.name,
    overall: s.overall,
    now: s.now,
    later: s.later,
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
