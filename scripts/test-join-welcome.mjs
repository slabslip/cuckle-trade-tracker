#!/usr/bin/env node
/** Smoke: join welcome derives correct book stats + cosmetics per Cuckle seat. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const finishes = JSON.parse(fs.readFileSync(
  path.join(ROOT, "data/leagues/1315431339301806080/ui/finishes.json"),
  "utf8",
));
const titles = JSON.parse(fs.readFileSync(
  path.join(ROOT, "data/leagues/1315431339301806080/ui/titles.json"),
  "utf8",
));
const cosmetics = JSON.parse(fs.readFileSync(
  path.join(ROOT, "data/leagues/1315431339301806080/ui/cosmetics.json"),
  "utf8",
));

function fail(msg) {
  throw new Error(msg);
}

for (const src of [page, gen]) {
  for (const need of [
    "function joinLandDerive(",
    "function joinLandAchievementsHtml(",
    "function joinLandShowcaseForSeat(",
    "Open my dashboard",
    "Best achievements",
    "Team stats",
    "Career finish avg",
    "data-join-land-ach=",
    "data-join-land-years=",
    "join-land-plate",
    "cosmeticsCallingCardHtml(",
  ]) {
    if (!src.includes(need)) fail("join welcome missing " + need);
  }
  if (src.includes('data-join-enter-dash="1">Next<')) {
    fail("welcome CTA must say Open my dashboard, not bare Next");
  }
}

if (!page.includes("joinWelcome20261023") || !sw.includes("join-welcome")) {
  fail("welcome ship must bust DATA_V and SW cache");
}

const champs = new Map();
for (const t of titles.titles || []) {
  const k = String(t.user_id);
  if (!champs.has(k)) champs.set(k, []);
  champs.get(k).push(t);
}

const expect = {
  TrumanCooper: { titles: 0, finals: 2, best: 2, avg: 5.4 },
  ARae: { titles: 3, finals: 4, best: 1, avg: 3.6 },
  SF69erss: { titles: 2, finals: 2, best: 1, avg: 6.3 },
  TedCumberbatch: { titles: 1, finals: 1, best: 1, avg: 4.7 },
  ChiefGumby: { titles: 1, finals: 2, best: 1, avg: 5.1 },
};

const report = [];
for (const seat of finishes.seats || []) {
  const places = (seat.places || []).filter((p) => Number(p.place) > 0);
  const avg = seat.avg != null
    ? Number(seat.avg)
    : places.reduce((a, p) => a + Number(p.place), 0) / (places.length || 1);
  const best = Math.min(...places.map((p) => Number(p.place)));
  const finals = places.filter((p) => Number(p.place) <= 2).length;
  const won = (champs.get(String(seat.user_id)) || []).length;
  const unlocks = cosmetics.unlocks[String(seat.user_id)] || {};
  const emblemN = (cosmetics.catalog || []).filter(
    (c) => c.kind === "emblem" && unlocks[c.id],
  ).length;
  const row = {
    name: seat.name,
    n: places.length || seat.n,
    avg: Number(avg.toFixed(1)),
    best,
    finals,
    titles: won,
    emblems: emblemN,
    unlocks: Object.keys(unlocks).length,
  };
  report.push(row);
  const exp = expect[seat.name];
  if (!exp) continue;
  if (row.titles !== exp.titles) fail(seat.name + " titles want " + exp.titles + " got " + row.titles);
  if (row.finals !== exp.finals) fail(seat.name + " finals want " + exp.finals + " got " + row.finals);
  if (row.best !== exp.best) fail(seat.name + " best want " + exp.best + " got " + row.best);
  if (Math.abs(row.avg - exp.avg) > 0.05) fail(seat.name + " avg want " + exp.avg + " got " + row.avg);
  if (row.emblems < 1) fail(seat.name + " should have at least one emblem unlock");
}

if (report.length !== 10) fail("Cuckle welcome analysis expects 10 seats, got " + report.length);

console.log(JSON.stringify({ ok: true, seats: report }, null, 2));
