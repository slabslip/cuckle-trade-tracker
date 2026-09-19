#!/usr/bin/env node
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const calc = JSON.parse(fs.readFileSync(`${ROOT}data/leagues/1315431339301806080/ui/calculator.json`, "utf8"));
const picks = JSON.parse(fs.readFileSync(`${ROOT}data/leagues/1315431339301806080/ui/picks.json`, "utf8"));
const traded = JSON.parse(fs.readFileSync(`${ROOT}data/leagues/1315431339301806080/raw/traded_picks.json`, "utf8"));
const build = fs.readFileSync(`${ROOT}build-calculator.mjs`, "utf8");
const sync = fs.readFileSync(`${ROOT}sleeper-sync.mjs`, "utf8");
const page = fs.readFileSync(`${ROOT}index.html`, "utf8");
const TRUMAN = "458342725222133760";

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

need(sync.includes("/traded_picks"), "sleeper-sync must store live traded_picks");
need(build.includes("livePickHolders"), "calculator must assign picks from Sleeper holders");
need(page.includes("entry.holder"), "calc/receipt owner must read live holder");

need(Array.isArray(traded) && traded.some((p) => String(p.season) === "2028" && Number(p.round) === 3 && Number(p.roster_id) === 8 && Number(p.owner_id) === 8),
  "traded_picks must show Bubba still holds Bubba's 2028 3rd");

const trumanCalc = (calc.picks || []).filter((p) => p.owner_id === TRUMAN);
need(!trumanCalc.some((p) => String(p.year) === "2028" && Number(p.round) === 3),
  "Truman calculator must not offer a 2028 3rd");
need(!trumanCalc.some((p) => p.id === "pick:2028:3:8" || p.id === "pick:2028:4:8"),
  "Truman must not be offered Bubba's 2028 3rd or 4th");

const bubba3 = (calc.picks || []).find((p) => p.id === "pick:2028:3:8");
need(bubba3 && bubba3.owner === "BubbaCuckShremp", "Bubba's 2028 3rd stays on Bubba");

need(picks["pick:2028:3:8"] && picks["pick:2028:3:8"].holder === "BubbaCuckShremp",
  "picks.json holder must match Sleeper");

console.log("truman picks ok", {
  truman_picks: trumanCalc.map((p) => p.name),
});
