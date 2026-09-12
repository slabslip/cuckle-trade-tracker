#!/usr/bin/env node
/** Smoke: receipt tiles, share URL, public boot, clock English. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");

const need = [
  "function shareProofNow(",
  "function receiptQueryFrom(",
  "function openPublicReceipt(",
  'appScreen = "receipt"',
  "function renderReceiptTradeTicket(",
  "function renderReceiptPickTicket(",
  "Day they traded",
  "From then to now",
  "How it aged",
  "A team, a trade, a year",
  "function receiptShareIco(",
  "grid-template-columns: 1fr 1fr",
  "Remember it differently?",
  "Get this for your league",
  "Your board",
  "trade_mark",
  "pick_print",
  "season_place",
  'params.get("tx")',
  "function receiptTermCurveHtml(",
  "function receiptOwnedPicksForSeat(",
  "function receiptPickEverOwned(",
  "function receiptPickBecameLine(",
  "What my pick became",
  "My Picks",
  "Trade NOW",
  "Trade THEN",
  "function receiptOriginPicksForSeat(",
  "Picks that started",
  "function receiptDoorIco(",
  "function receiptDoorFilterHtml(",
  "data-receipt-door-filter",
  "function receiptTradePlayerNames(",
  "function receiptTradeYearHtml(",
  "data-receipt-player-q",
  "data-receipt-door-year",
  "League year",
  "Player you rostered",
  "Type a player name",
  "function dataDashLiftDoor(",
  "function dataDashCommitFromBoard(",
  "data-dash-board",
  "Hold a tile, then drag to move it.",
  "Every pick ",
  "A year, a player, a seat",
];
const missing = need.filter((s) => !page.includes(s));
if (missing.length) {
  throw new Error("index.html missing receipt pieces: " + missing.join(", "));
}

if (!page.includes('DATA_DOORS = [')
  || !page.includes('"lopsided", "trade_mark", "pick_print", "my_picks", "past_champions"')) {
  throw new Error("default board must be the 13 door tiles");
}
if (!page.includes('class="door"') || page.includes("The number is one example")) {
  throw new Error("door tiles must be icon + label only");
}

if (page.includes("exactly like")) {
  throw new Error("generated JS must not contain exactly like");
}
if (page.includes("if (leg.became) receiptAddOwnedPlayer")) {
  throw new Error("Trade THEN/NOW player list must not include pick-became names");
}

const bootAt = page.indexOf("const receiptQboot = receiptQueryFrom(params);");
const gateAt = page.indexOf('appScreen = "gate"', bootAt);
if (bootAt < 0 || gateAt < 0 || page.indexOf("openPublicReceipt(receiptQboot)", bootAt) > gateAt) {
  throw new Error("unsigned receipt query must skip the gate");
}

if (!gen.includes("# Receipt tiles") && !fs.readFileSync(path.join(ROOT, "docs/MEMORY_SDD.md"), "utf8").includes("Closed chip catalog")) {
  throw new Error("MEMORY_SDD must lock the 16-kind catalog");
}

const mem = fs.readFileSync(path.join(ROOT, "docs/MEMORY_SDD.md"), "utf8");
for (const s of ["Day they traded", "From then to now", "Your board", "Get this for your league", "shareProofNow", "What my pick became", "every draft pick that seat ever owned", "My Picks", "Picks that started on this seat", "player you rostered", "League year"]) {
  if (!mem.includes(s)) throw new Error("MEMORY_SDD missing " + s);
}

console.log(JSON.stringify({ ok: true, checks: need.length }, null, 2));
