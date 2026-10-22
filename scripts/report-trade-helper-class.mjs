#!/usr/bin/env node
/**
 * League-wide foundational / riser classification report (mirrors tradeHelperClassOf).
 * Writes JSON + markdown under /opt/cursor/artifacts when present, else ./tmp.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE = "1315431339301806080";
const bookPath = path.join(ROOT, "data/leagues", LEAGUE, "ui/calculator.json");
const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
const players = book.players || [];
const STUD = 5500;
const START = 2200;
const MID = 1800;
const NEAR = STUD * 0.92;

function isPick(a) {
  return !a || a.kind === "pick" || String(a.pos || "").toUpperCase() === "PICK";
}
function isAging(a) {
  const pos = String(a.pos || "").toUpperCase();
  const age = Number(a.age);
  if (!Number.isFinite(age)) return false;
  if (pos === "RB") return age >= 27;
  if (pos === "WR") return age >= 28;
  if (pos === "QB") return age >= 32;
  if (pos === "TE") return age >= 29;
  return false;
}
function isYoung(a) {
  const age = Number(a.age);
  return Number.isFinite(age) && age < 24.5;
}
function classify(a, bagByOwner) {
  if (isPick(a)) {
    return { foundational: false, riser: false, reasons: ["pick"], badges: [] };
  }
  const v = Number(a.value) || 0;
  const age = Number(a.age);
  const hasAge = Number.isFinite(age);
  const aging = isAging(a);
  const young = isYoung(a);
  const stud = v >= STUD;
  const nearStud = v >= NEAR;
  let bagTop = false;
  if (!stud && !nearStud && v >= STUD * 0.85) {
    const bag = bagByOwner.get(String(a.owner_id || "")) || [];
    const pos = String(a.pos || "").toUpperCase();
    let best = -1;
    let second = -1;
    for (const o of bag) {
      if (isPick(o) || String(o.pos || "").toUpperCase() !== pos) continue;
      const ov = Number(o.value) || 0;
      if (ov > best) { second = best; best = ov; }
      else if (ov > second) second = ov;
    }
    const isTop = best >= 0 && Math.abs(best - v) < 1;
    const clearLead = second < 0 || v >= second * 1.12;
    bagTop = isTop && clearLead;
  }
  const foundational = stud || nearStud || bagTop;
  const reasons = [];
  if (stud) reasons.push("stud book value");
  else if (nearStud) reasons.push("near-stud cornerstone");
  else if (bagTop) reasons.push("clear top " + String(a.pos || "").toUpperCase() + " on their roster");
  if (aging && foundational) reasons.push("aging cornerstone — sell-high only");

  let riser = false;
  const flat = Number(a.value_flat);
  const marketUp = Number.isFinite(flat) && flat > 0 && ((v - flat) / Math.max(v, flat)) >= 0.12;
  if (!aging) {
    if (young && v >= MID) {
      riser = true;
      reasons.push(hasAge ? ("young upside · age " + age.toFixed(1)) : "young upside");
    } else if (hasAge && age <= 25 && marketUp && v >= Math.max(1400, MID * 0.75)) {
      riser = true;
      reasons.push("market riser vs flat book");
    } else if (hasAge && age <= 23.5 && v >= START && String(a.roster_slot || "") === "taxi") {
      riser = true;
      reasons.push("taxi upside stash");
    }
  }
  const badges = [];
  if (foundational) badges.push("Foundational");
  if (riser) badges.push(young || (hasAge && age <= 23.5) ? "Riser" : "Upside");
  return { foundational, riser, aging, reasons, badges, value: v, age: hasAge ? age : null };
}

const bagByOwner = new Map();
for (const p of players) {
  const uid = String(p.owner_id || "");
  if (!bagByOwner.has(uid)) bagByOwner.set(uid, []);
  bagByOwner.get(uid).push(p);
}

const rows = players.map((p) => {
  const cls = classify(p, bagByOwner);
  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    age: p.age,
    value: p.value,
    owner: p.owner,
    owner_id: p.owner_id,
    roster_slot: p.roster_slot,
    injury: p.injury || "",
    ...cls,
  };
});

const foundations = rows.filter((r) => r.foundational);
const risers = rows.filter((r) => r.riser);
const both = rows.filter((r) => r.foundational && r.riser);
const agingF = foundations.filter((r) => r.aging);
const irF = foundations.filter((r) => r.roster_slot === "ir");
const taxiR = risers.filter((r) => r.roster_slot === "taxi");

const byOwner = new Map();
for (const r of rows) {
  const k = r.owner || "—";
  if (!byOwner.has(k)) byOwner.set(k, { owner: k, foundational: [], risers: [], depth: null });
  const o = byOwner.get(k);
  if (r.foundational) o.foundational.push(r);
  if (r.riser && !r.foundational) o.risers.push(r);
  else if (r.riser && r.foundational) o.risers.push(r);
}

function sortVal(arr) {
  return arr.slice().sort((a, b) => (b.value || 0) - (a.value || 0));
}

const teams = [...byOwner.values()].map((t) => ({
  owner: t.owner,
  foundational_n: t.foundational.length,
  riser_n: t.risers.length,
  foundational: sortVal(t.foundational).map((r) => ({
    name: r.name, pos: r.pos, age: r.age, value: r.value, badges: r.badges, reasons: r.reasons,
  })),
  risers: sortVal(t.risers).map((r) => ({
    name: r.name, pos: r.pos, age: r.age, value: r.value, badges: r.badges, reasons: r.reasons,
  })),
})).sort((a, b) => a.owner.localeCompare(b.owner));

const edgeCases = {
  aging_foundations: agingF.map((r) => ({ name: r.name, age: r.age, pos: r.pos, value: r.value, owner: r.owner })),
  ir_foundations: irF.map((r) => ({ name: r.name, value: r.value, owner: r.owner })),
  taxi_risers: taxiR.map((r) => ({ name: r.name, age: r.age, value: r.value, owner: r.owner })),
  young_foundations: both.map((r) => ({ name: r.name, age: r.age, value: r.value, owner: r.owner })),
  teams_with_few_foundations: teams.filter((t) => t.foundational_n <= 2).map((t) => t.owner),
  near_stud_band: foundations.filter((r) => r.value < STUD && r.value >= NEAR).map((r) => ({
    name: r.name, value: r.value, age: r.age, pos: r.pos, owner: r.owner, reasons: r.reasons,
  })),
};

const report = {
  league: LEAGUE,
  as_of: book.as_of || null,
  cuts: { STUD, NEAR, START, MID },
  totals: {
    players: players.length,
    foundational: foundations.length,
    risers: risers.length,
    foundational_and_riser: both.length,
    foundation_pct: Math.round((1000 * foundations.length) / players.length) / 10,
  },
  edgeCases,
  teams,
};

const outDir = fs.existsSync("/opt/cursor/artifacts") ? "/opt/cursor/artifacts" : path.join(ROOT, "tmp");
fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, "trade-helper-class-report.json");
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

let md = `# Trade helper class report\n\n`;
md += `- Players: ${report.totals.players}\n`;
md += `- Foundational: ${report.totals.foundational} (${report.totals.foundation_pct}%)\n`;
md += `- Risers / upside: ${report.totals.risers}\n`;
md += `- Both (young cornerstone): ${report.totals.foundational_and_riser}\n\n`;
md += `## Edge cases\n\n`;
md += `- Aging foundations: ${edgeCases.aging_foundations.map((x) => x.name).join(", ") || "—"}\n`;
md += `- IR foundations: ${edgeCases.ir_foundations.map((x) => x.name).join(", ") || "—"}\n`;
md += `- Taxi risers: ${edgeCases.taxi_risers.map((x) => x.name).join(", ") || "—"}\n`;
md += `- Thin foundation seats: ${edgeCases.teams_with_few_foundations.join(", ") || "—"}\n\n`;
md += `## By team\n\n`;
for (const t of teams) {
  md += `### ${t.owner}\n`;
  md += `- Foundational (${t.foundational_n}): ${t.foundational.map((x) => x.name).join(", ") || "—"}\n`;
  md += `- Risers (${t.riser_n}): ${t.risers.map((x) => x.name).join(", ") || "—"}\n\n`;
}
const mdPath = path.join(outDir, "trade-helper-class-report.md");
fs.writeFileSync(mdPath, md);

console.log(JSON.stringify({
  ok: true,
  jsonPath,
  mdPath,
  totals: report.totals,
  edge: {
    aging: edgeCases.aging_foundations.length,
    ir: edgeCases.ir_foundations.length,
    taxiRisers: edgeCases.taxi_risers.length,
    thinSeats: edgeCases.teams_with_few_foundations,
  },
}, null, 2));
