#!/usr/bin/env node
/**
 * Standing book + applyVa feed check.
 * Extracts applyVa from generated index.html (not generate-page.mjs) and
 * compares it to value-adjust.mjs on every shipped side.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, leagueUiDir } from "./lib.mjs";
import { applyToSide } from "./value-adjust.mjs";
import { cuffMove, cuffInsurance, cuffPairAdds } from "./cuff-formula.mjs";

const hard = [];
function fail(msg) { hard.push(msg); }
let reportTape = null;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function close(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-6;
}

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
const src = scripts.find((s) => s.includes("function applyVa(s, noVa)")) || "";
if (!src) throw new Error("index.html missing app script");
const start = src.indexOf("function applyVa(s, noVa) {");
if (start < 0) throw new Error("generated page lost applyVa");
if (!src.includes("/^pick:\\d{4}:4:/")) {
  throw new Error("generated applyVa lost the 4th-round half-weight regex");
}
let i = start + "function applyVa(s, noVa) {".length;
let depth = 1;
while (i < src.length && depth) {
  const ch = src[i++];
  if (ch === "{") depth += 1;
  else if (ch === "}") depth -= 1;
}
const fnSrc = src.slice(start, i);
let applyVa;
try {
  applyVa = new Function("return (" + fnSrc + ")")();
} catch (err) {
  throw new Error("could not eval generated applyVa: " + (err && err.message));
}

const barAt = src.indexOf("function calcBarFill(gap) {");
if (barAt < 0) throw new Error("generated page lost calcBarFill");
let bj = barAt + "function calcBarFill(gap) {".length;
let bd = 1;
while (bj < src.length && bd) {
  const ch = src[bj++];
  if (ch === "{") bd += 1;
  else if (ch === "}") bd -= 1;
}
let pageBarFill;
try {
  pageBarFill = new Function("return (" + src.slice(barAt, bj) + ")")();
} catch (err) {
  throw new Error("could not eval generated calcBarFill: " + (err && err.message));
}

const cuffBlockAt = src.indexOf("const CUFF_POS_W = { QB: 0.5");
const pairAt = src.indexOf("function cuffPairAdds(opts)");
if (cuffBlockAt < 0 || pairAt < 0) throw new Error("generated page lost cuff formula block");
let pairEnd = src.indexOf("{", pairAt) + 1;
let pd = 1;
while (pairEnd < src.length && pd) {
  const ch = src[pairEnd++];
  if (ch === "{") pd += 1;
  else if (ch === "}") pd -= 1;
}
let pageCuff;
try {
  pageCuff = new Function(src.slice(cuffBlockAt, pairEnd) + "; return { cuffMove, cuffInsurance, cuffPairAdds };")();
} catch (err) {
  throw new Error("could not eval generated cuff formula: " + (err && err.message));
}
const cuffCases = [
  { pos: "RB", cuff: 49, starter: 6002, week: 1, weeksOut: 8 },
  { pos: "RB", cuff: 2029, starter: 9505, week: 1, weeksOut: 8 },
  { pos: "QB", cuff: 199, starter: 8762, week: 3, weeksOut: 10 },
  { pos: "WR", cuff: 250, starter: 4000, week: 2, weeksOut: 8 },
];
for (const c of cuffCases) {
  if (pageCuff.cuffMove(c) !== cuffMove(c)) fail("inline cuffMove != cuff-formula.mjs " + JSON.stringify(c));
  const ins = { pos: c.pos, cuff: c.cuff, starter: c.starter, holdW: 1 };
  if (pageCuff.cuffInsurance(ins) !== cuffInsurance(ins)) fail("inline cuffInsurance != module " + c.pos);
}
const pairOpts = {
  rows: [{ pos: "RB", cuff_id: "8154", starter_id: "9509", starter_value: 9505 }],
  recv: { "8154": 2029 },
  haveAfter: { "9509": true, "8154": true },
  hadStarter: { "9509": true },
  catalog: { "9509": 9505 },
  week: 1,
};
if (pageCuff.cuffPairAdds(pairOpts) !== cuffPairAdds(pairOpts)) fail("inline cuffPairAdds != cuff-formula.mjs");
if (pageCuff.cuffPairAdds(pairOpts) !== 91) fail("Bijan / B-Rob Handcuff must be +91, got " + pageCuff.cuffPairAdds(pairOpts));
if (!src.includes("function calcCuffBump(uid, sendLegs, recvLegs)")
  || !src.includes("span>Handcuff</span>")) {
  fail("calc lost Handcuff line");
}

const ui = leagueUiDir();
const meDir = path.join(ui, "me");
const files = fs.existsSync(meDir)
  ? fs.readdirSync(meDir).filter((f) => f.endsWith(".json"))
  : [];
if (files.length !== 10) fail("expected 10 seat files, found " + files.length);

let sides = 0;
let vaMismatch = 0;
let storeMismatch = 0;
let nanN = 0;
const pair = new Map();

for (const f of files) {
  const seat = JSON.parse(fs.readFileSync(path.join(meDir, f), "utf8"));
  for (const t of seat.trades || []) {
    const noVa = (t.others || []).length > 1;
    const bags = [t.even, ...Object.values(t.windows || {})].filter(Boolean);
    for (const side of bags) {
      sides += 1;
      const stored = side;
      if (![stored.today, stored.sent_today, stored.today_delta, stored.value_adjust]
        .every((n) => n == null || Number.isFinite(Number(n)))) {
        nanN += 1;
      }
      const live = applyToSide(clone(side), { noVa: noVa || !!side.incomplete });
      const browser = applyVa(clone(side), noVa || !!side.incomplete);
      if (!close(live.today, browser.today) || !close(live.sent_today, browser.sent_today)
        || !close(live.value_adjust, browser.value_adjust)
        || !close(live.today_delta, browser.today_delta)) {
        vaMismatch += 1;
      }
      if (stored.today != null && stored.sent_today != null) {
        if (!close(stored.today, live.today) || !close(stored.sent_today, live.sent_today)
          || !close(stored.value_adjust || 0, live.value_adjust || 0)) {
          storeMismatch += 1;
        }
        const sumGot = (stored.legs || []).reduce((s, l) => s + (Number(l.value) || 0), 0);
        const sumSent = (stored.sent || []).reduce((s, l) => s + (Number(l.value) || 0), 0);
        if (!close(stored.today, sumGot + (stored.value_adjust || 0))) {
          storeMismatch += 1;
        }
        if (!close(stored.sent_today, sumSent + (stored.value_adjust_sent || 0))) {
          storeMismatch += 1;
        }
      }
    }
    if (t.even && t.even.today_delta != null && (t.others || []).length === 1 && !t.incomplete) {
      const k = t.transaction_id;
      if (!pair.has(k)) pair.set(k, []);
      pair.get(k).push(t.even.today_delta);
    }
  }
}

let zeroBreaks = 0;
for (const ds of pair.values()) {
  if (ds.length === 2 && Math.abs(ds[0] + ds[1]) >= 1) zeroBreaks += 1;
}

function pricedN(legs) {
  return (legs || []).filter((l) => l.value != null && Number.isFinite(Number(l.value))).length;
}

/** Calc cards are send piles: card A paints VA on pile A (receive B's got-VA). */
function calcCardPair(sendA, sendB, noVa) {
  const a = applyToSide({ legs: sendB, sent: sendA }, { noVa: !!noVa });
  const b = applyToSide({ legs: sendA, sent: sendB }, { noVa: !!noVa });
  const rawA = (sendA || []).reduce((s, l) => s + (Number(l.value) || 0), 0);
  const rawB = (sendB || []).reduce((s, l) => s + (Number(l.value) || 0), 0);
  const vaPileA = (b && b.value_adjust) || 0;
  const vaPileB = (a && a.value_adjust) || 0;
  return {
    cardA: Math.round(vaPileA),
    cardB: Math.round(vaPileB),
    receiveA: Math.round(a.today || 0),
    receiveB: Math.round(b.today || 0),
    vaReceiveA: Math.round(a.value_adjust || 0),
    vaReceiveB: Math.round(b.value_adjust || 0),
    rawA: Math.round(rawA),
    rawB: Math.round(rawB),
    totA: Math.round(rawA + vaPileA),
    totB: Math.round(rawB + vaPileB),
  };
}

function calcBarFill(gap) {
  const g = Math.abs(Number(gap) || 0);
  if (g < 25) return 0;
  return Math.max(3, Math.min(50, Math.round((g / 3000) * 50)));
}

function expectAdd(row, label) {
  if (row.totA !== row.receiveB) fail(label + " card A total must equal B receive");
  if (row.totB !== row.receiveA) fail(label + " card B total must equal A receive");
  if (row.totA !== row.rawA + row.cardA && Math.abs(row.totA - (row.rawA + row.cardA)) > 1) {
    fail(label + " card A tot != raw + VA");
  }
  if (row.totB !== row.rawB + row.cardB && Math.abs(row.totB - (row.rawB + row.cardB)) > 1) {
    fail(label + " card B tot != raw + VA");
  }
}

function expectCard(label, got, want) {
  if (got !== want) fail(label + ": got " + got + " want " + want);
}

{
  const star = [{ value: 8585, asset_key: "player:1", became: true }];
  const pile = [
    { value: 5773, asset_key: "pick:2027:1:mid" },
    { value: 2215, asset_key: "player:2", became: true },
    { value: 1800, asset_key: "pick:2028:2:mid" },
  ];
  const gotStar = applyToSide({ legs: star, sent: pile });
  const gotPile = applyToSide({ legs: pile, sent: star });
  if (Math.round(gotStar.value_adjust) !== 2576) {
    fail("worked example VA should be 2576, got " + Math.round(gotStar.value_adjust));
  }
  if (Math.round(gotStar.today) !== 11161) {
    fail("worked example star receive should be 11161, got " + Math.round(gotStar.today));
  }
  if (Math.round(gotPile.today) !== 9788) {
    fail("worked example pile receive should stay 9788, got " + Math.round(gotPile.today));
  }
  if (Math.round(gotPile.value_adjust || 0) !== 0) {
    fail("quantity receive must not bank VA, got " + Math.round(gotPile.value_adjust || 0));
  }
  const br = applyVa({ legs: star, sent: pile }, false);
  if (!close(br.today, gotStar.today)) fail("browser applyVa missed the worked example");

  // Team 1 sends star, Team 2 sends three. Gold line on Team 1's card.
  const ex = calcCardPair(star, pile);
  expectCard("worked card star", ex.cardA, 2576);
  expectCard("worked card extras", ex.cardB, 0);
  expectCard("worked receive extras-side", ex.receiveB, 11161);
  expectCard("worked receive star-side", ex.receiveA, 9788);
  expectCard("worked star card total", ex.totA, 11161);
  expectCard("worked extras card total", ex.totB, 9788);
  expectAdd(ex, "worked");
  expectCard("worked meter", calcBarFill(ex.receiveB - ex.receiveA), 23);
}

{
  // Live calc screenshot: TipsUp 3 extras vs Truman Golden.
  const extras = [
    { value: 2397, asset_key: "player:white", became: true },
    { value: 1517, asset_key: "player:davis", became: true },
    { value: 1250, asset_key: "player:klein", became: true },
  ];
  const golden = [{ value: 3214, asset_key: "player:golden", became: true }];
  const shot = calcCardPair(extras, golden);
  expectCard("golden shot extras card", shot.cardA, 0);
  expectCard("golden shot star card", shot.cardB, 964);
  expectCard("golden shot TipsUp receive", shot.receiveA, 4178);
  expectCard("golden shot Truman receive", shot.receiveB, 5164);
  expectCard("golden extras card total", shot.totA, 5164);
  expectCard("golden star card total", shot.totB, 4178);
  expectAdd(shot, "golden shot");
  if (2397 + 1517 + 1250 !== 5164) fail("golden extras pieces do not add to 5164");
  if (3214 + 964 !== 4178) fail("golden star + VA do not add to 4178");
  if (shot.cardA === shot.vaReceiveA && shot.vaReceiveA) {
    fail("golden shot painted receive-VA on the extras send card");
  }
  expectCard("golden meter (gap 986)", calcBarFill(5164 - 4178), 16);
}

{
  const two = [
    { value: 4000, asset_key: "player:a", became: true },
    { value: 3500, asset_key: "player:b", became: true },
  ];
  const three = [
    { value: 2200, asset_key: "player:c", became: true },
    { value: 1800, asset_key: "player:d", became: true },
    { value: 1600, asset_key: "player:e", became: true },
  ];
  const mid = calcCardPair(three, two);
  if (!mid.cardB) fail("3-for-2 must paint VA on the 2-piece send card");
  if (mid.cardA) fail("3-for-2 extras send card must stay raw, got " + mid.cardA);
  if (mid.vaReceiveA !== mid.cardB) fail("3-for-2 receive-VA must bank on the 3-piece seat");
  if (mid.vaReceiveB) fail("3-for-2 2-piece seat must not bank receive-VA");
  expectAdd(mid, "3-for-2");
}

{
  const even = calcCardPair(
    [{ value: 3000, became: true }, { value: 2000, became: true }],
    [{ value: 2800, became: true }, { value: 2200, became: true }],
  );
  expectCard("equal-count card A", even.cardA, 0);
  expectCard("equal-count card B", even.cardB, 0);
  expectCard("equal-count receive VA A", even.vaReceiveA, 0);
  expectCard("equal-count receive VA B", even.vaReceiveB, 0);
}

{
  const one = [{ value: 5000, became: true }];
  const four = [
    { value: 1200, became: true },
    { value: 1100, became: true },
    { value: 1000, became: true },
    { value: 900, became: true },
  ];
  const cap = calcCardPair(four, one);
  if (cap.cardA) fail("4-for-1 extras card must stay raw");
  const n = 3;
  const want = Math.round(0.15 * n * 5000);
  expectCard("4-for-1 extras cap", cap.cardB, want);
}

{
  const late = calcCardPair(
    [{ value: 4000, became: true }],
    [
      { value: 2500, became: true },
      { value: 1800, asset_key: "pick:2028:4:mid" },
    ],
  );
  if (!late.cardA) fail("1-for-1+4th must still fire VA (count 1 vs 2)");
  if (late.cardB) fail("1-for-1+4th must paint VA on the 1-piece card");
}

{
  const countGate = calcCardPair(
    [
      { value: 3000, became: true },
      { value: 800, asset_key: "pick:2028:4:mid" },
    ],
    [
      { value: 2200, became: true },
      { value: 2100, became: true },
    ],
  );
  expectCard("count-gate 2v2 card A", countGate.cardA, 0);
  expectCard("count-gate 2v2 card B", countGate.cardB, 0);
}

{
  const empty = calcCardPair([{ value: 4000, became: true }], []);
  expectCard("empty other card A", empty.cardA, 0);
  expectCard("empty other card B", empty.cardB, 0);
}

{
  const off = calcCardPair(
    [{ value: 8000, became: true }],
    [{ value: 3000, became: true }, { value: 2000, became: true }, { value: 1000, became: true }],
    true,
  );
  expectCard("noVa card A", off.cardA, 0);
  expectCard("noVa card B", off.cardB, 0);
}

{
  const inc = applyToSide({
    legs: [{ value: 8000, became: true }],
    sent: [{ value: 3000, became: true }, { value: 2000, became: true }],
    incomplete: true,
  });
  if (Math.round(inc.value_adjust || 0)) fail("incomplete must zero VA");
}

{
  // Quantity bag is the high side; count-star is still the 2-pack.
  const weakTwo = [{ value: 50, became: true }, { value: 40, became: true }];
  const richThree = [{ value: 100, became: true }, { value: 90, became: true }, { value: 80, became: true }];
  const damp = calcCardPair(richThree, weakTwo);
  if (damp.cardA) fail("damp 3-pack send must stay raw");
  if (!damp.cardB) fail("damp 2-pack send is the count-star and must show VA");
  if (damp.vaReceiveB) fail("rich 3-pack receive must not bank VA");
  expectAdd(damp, "damp");
}

{
  expectCard("meter even 0", calcBarFill(0), 0);
  expectCard("meter even 24", calcBarFill(24), 0);
  expectCard("meter sliver 25", calcBarFill(25), 3);
  expectCard("meter few-hundred", calcBarFill(300), 5);
  expectCard("meter 1000", calcBarFill(1000), 17);
  expectCard("meter golden 986", calcBarFill(986), 16);
  expectCard("meter few-thousand", calcBarFill(3000), 50);
  expectCard("meter blowout", calcBarFill(8000), 50);
  expectCard("meter negative", calcBarFill(-986), 16);
  if (pageBarFill(986) !== calcBarFill(986)) fail("generated calcBarFill drifted from check");
  if (pageBarFill(24) !== 0 || pageBarFill(3000) !== 50) fail("generated meter edges drifted");
}

{
  const frac = calcCardPair(
    [{ value: 100.4, became: true }, { value: 100.4, became: true }, { value: 100.4, became: true }],
    [{ value: 200.6, became: true }],
  );
  expectAdd(frac, "frac");
  if (Math.round(frac.rawA + frac.cardA) !== frac.totA && Math.abs(Math.round(frac.rawA + frac.cardA) - frac.totA) > 1) {
    fail("frac card A rounded twice");
  }
}

{
  let gotStar = 0;
  let sentStar = 0;
  let equalN = 0;
  let extrasGotVa = 0;
  let bothGotVa = 0;
  let cardPaintWrong = 0;
  let sentMismatch = 0;
  let nwayVa = 0;
  const byTx = new Map();

  for (const f of files) {
    const seat = JSON.parse(fs.readFileSync(path.join(meDir, f), "utf8"));
    for (const t of seat.trades || []) {
      const nway = (t.others || []).length > 1;
      const side = t.even;
      if (!side) continue;
      const va = Math.round(side.value_adjust || 0);
      const vaS = Math.round(side.value_adjust_sent || 0);
      if (nway || side.incomplete || t.incomplete) {
        if (va || vaS) nwayVa += 1;
        continue;
      }
      if ((t.others || []).length !== 1) continue;
      const gotN = pricedN(side.legs);
      const sentN = pricedN(side.sent);
      if (!gotN || !sentN) continue;
      const cards = calcCardPair(side.sent || [], side.legs || []);
      if (cards.totA !== cards.receiveB || cards.totB !== cards.receiveA) {
        sentMismatch += 1;
        if (sentMismatch <= 3) {
          fail("tape card total != crossed receive on " + (t.transaction_id || "?"));
        }
      }
      {
        const gap = Math.abs(cards.receiveA - cards.receiveB);
        const fill = calcBarFill(gap);
        if (fill < 0 || fill > 50) fail("meter out of range on " + (t.transaction_id || "?"));
        if (gap < 25 && fill) fail("even tape filled the meter on " + (t.transaction_id || "?"));
        if (gap >= 3000 && fill !== 50) fail("blowout tape meter not full on " + (t.transaction_id || "?"));
      }
      if (cards.cardA !== vaS) {
        sentMismatch += 1;
        if (sentMismatch <= 3) {
          fail("card/send VA mismatch " + (t.transaction_id || "?") + " cardA=" + cards.cardA + " sent=" + vaS);
        }
      }
      if (cards.cardB !== va) {
        sentMismatch += 1;
        if (sentMismatch <= 3) {
          fail("card/got VA mismatch " + (t.transaction_id || "?") + " cardB=" + cards.cardB + " got=" + va);
        }
      }
      if (gotN === sentN) {
        equalN += 1;
        if (va || vaS) fail("equal-count tape VA must be 0 on " + (t.transaction_id || "?"));
      } else if (gotN < sentN) {
        gotStar += 1;
        if (vaS) fail("got-star seat must not store sent-star VA on " + (t.transaction_id || "?"));
        if (cards.cardA) {
          cardPaintWrong += 1;
          if (cardPaintWrong <= 3) fail("got-star extras send card painted VA on " + (t.transaction_id || "?"));
        }
      } else {
        sentStar += 1;
        if (va) {
          extrasGotVa += 1;
          fail("extras-receive stored got-VA on " + (t.transaction_id || "?"));
        }
        if (cards.cardB) {
          cardPaintWrong += 1;
          if (cardPaintWrong <= 3) fail("sent-star extras card painted VA on " + (t.transaction_id || "?"));
        }
      }
      const k = t.transaction_id;
      if (k) {
        if (!byTx.has(k)) byTx.set(k, []);
        byTx.get(k).push({ va: va, vaS: vaS, gotN: gotN, sentN: sentN });
      }
    }
  }

  for (const [k, rows] of byTx) {
    if (rows.length !== 2) continue;
    const [x, y] = rows;
    if (x.va && y.va) {
      bothGotVa += 1;
      fail("both seats banked got-VA on " + k);
    }
    if (x.va && x.va !== y.vaS) fail("got-VA != counterpart sent-VA on " + k);
    if (y.va && y.va !== x.vaS) fail("got-VA != counterpart sent-VA on " + k);
  }

  if (!gotStar || !sentStar) fail("tape loop missed got-star/sent-star seats");
  if (extrasGotVa) fail("extras-receive stored got-VA on " + extrasGotVa + " sides");
  if (bothGotVa) fail("both seats banked got-VA on " + bothGotVa + " trades");
  if (cardPaintWrong) fail("card paint wrong on " + cardPaintWrong + " sides");
  if (nwayVa) fail("N-way/incomplete stored VA on " + nwayVa + " sides");
  reportTape = { got_star: gotStar, sent_star: sentStar, equal: equalN, pairs: byTx.size };
}

if (vaMismatch) fail("inline applyVa != value-adjust.mjs on " + vaMismatch + " sides");
if (storeMismatch) fail("stored today != fresh applyToSide on " + storeMismatch + " sides");
if (nanN) fail("NaN/Infinity on " + nanN + " sides");
if (zeroBreaks) fail("zero-sum breaks on " + zeroBreaks + " two-team trades");
if (sides < 3000) fail("too few sides: " + sides);

const report = {
  sides,
  va_mismatch: vaMismatch,
  store_mismatch: storeMismatch,
  nan: nanN,
  zero_sum_breaks: zeroBreaks,
  two_team_pairs: pair.size,
  tape: reportTape,
  hard,
};
console.log(JSON.stringify(report, null, 2));
if (hard.length) {
  console.error("check-value-feed: " + hard.length + " hard error(s)");
  process.exit(1);
}
console.error("check-value-feed: ok " + sides + " sides");
