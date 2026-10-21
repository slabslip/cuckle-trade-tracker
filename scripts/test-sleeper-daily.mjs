#!/usr/bin/env node
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const nightly = fs.readFileSync(`${ROOT}.github/workflows/league-nightly.yml`, "utf8");
const daily = fs.readFileSync(`${ROOT}.github/workflows/values-daily.yml`, "utf8");
const sync = fs.readFileSync(`${ROOT}.github/workflows/league-sync.yml`, "utf8");
const news = fs.readFileSync(`${ROOT}.github/workflows/news-refresh.yml`, "utf8");
const sleeper = fs.readFileSync(`${ROOT}sleeper-sync.mjs`, "utf8");
const ensure = fs.readFileSync(`${ROOT}ensure-players.mjs`, "utf8");
const build = fs.readFileSync(`${ROOT}build.mjs`, "utf8");
const calc = fs.readFileSync(`${ROOT}build-calculator.mjs`, "utf8");
const page = fs.readFileSync(`${ROOT}index.html`, "utf8");
const plan = fs.readFileSync(`${ROOT}docs/plans/sleeper_daily_sweep.md`, "utf8");

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

need(plan.includes("no live Sleeper webhook"), "plan must say there is no live webhook agent");
need(plan.includes("08:10") && plan.includes("22:20") && plan.includes("10:20"),
  "plan must lock morning tape, afternoon catch, and market reprice");

need(nightly.includes('cron: "10 8 * * *"') && nightly.includes('cron: "20 22 * * *"'),
  "league-nightly must run morning and afternoon");
need(nightly.includes("--fresh-players") && nightly.includes("ensure-players.mjs --fresh"),
  "nightly must force-refresh Sleeper player IR / Out");
need(!nightly.includes("node generate-page.mjs"), "nightly must never run generate-page.mjs");

need(daily.includes("--fresh-players") && daily.includes("1389723418827460608"),
  "values-daily must refresh Sleeper status and reprice GM too");
need(!/node generate-page\.mjs/.test(daily), "values-daily must not execute generate-page.mjs");

need(sync.includes("--fresh-players --skip-page --allow-revalue-fail"),
  "manual league-sync must refresh players and still ship when revalue fails");

need(!news.includes("sleeper-sync"), "news-refresh is tweets, not the league sweep");

need(sleeper.includes("wantFreshPlayers") && sleeper.includes("writeInjuryNow"),
  "sleeper-sync must force-fresh players and write injury_now");
need(sleeper.includes("free_agent") && sleeper.includes("moves.json"),
  "sleeper-sync must store waiver / FA / commissioner moves");
need(ensure.includes("SLEEPER_FRESH_PLAYERS") && build.includes("--fresh-players"),
  "ensure-players and build.mjs must honor --fresh-players");
need(calc.includes("roster_slot") && calc.includes("injury"),
  "calculator book must carry IR slot and NFL injury");
need(page.includes("a.roster_slot === \"ir\"") && page.includes("a.injury"),
  "calc trade options must paint IR / injury");
need(page.includes('String(a.injury || "").toUpperCase() === "IR"'),
  "NFL IR on the bench must still paint IR");

const injuryCuckle = `${ROOT}data/leagues/1315431339301806080/raw/injury_now.json`;
need(fs.existsSync(injuryCuckle), "Cuckle injury_now.json must exist after the sweep write");
const inj = JSON.parse(fs.readFileSync(injuryCuckle, "utf8"));
need(inj && inj.n > 0 && inj.players && Object.values(inj.players).some((p) => p.injury_status === "IR"),
  "Cuckle injury_now must list at least one IR player");
const book = JSON.parse(fs.readFileSync(`${ROOT}data/leagues/1315431339301806080/ui/calculator.json`, "utf8"));
need((book.players || []).some((p) => p.roster_slot === "ir" && p.injury),
  "Cuckle calculator must mark league-IR players with injury");

console.log("sleeper daily sweep ok", {
  injury_n: inj.n,
  crons: ["08:10", "22:20", "10:20"],
});
