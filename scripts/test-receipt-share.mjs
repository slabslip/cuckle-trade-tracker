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
  "my_trades",
  "league_trades",
  "my_draft",
  "league_draft",
  "season_place",
  'params.get("tx")',
  "function receiptTermCurveHtml(",
  "function receiptOwnedPicksForSeat(",
  "function receiptPickEverOwned(",
  "function receiptPickBecameLine(",
  "My Trade History",
  "League Trade History",
  "My Draft Picks",
  "League Draft Picks",
  "Profit / Loss",
  "function receiptPlRowsForSeat(",
  "function receiptPlRoomsHtml(",
  "data-receipt-pl-room",
  "Unrealized",
  "Realized",
  "function histPartnerRows(",
  "function receiptDraftRowsForSeat(",
  "function receiptOriginPicksForSeat(",
  "Hit rate ",
  "function receiptDoorIco(",
  "function receiptDoorFilterHtml(",
  "function receiptLookSelect(",
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
  "Top 4 wear gold",
  "Your top 4",
  "data-home-door",
  "door-top",
  "function homeTopDoorsHtml(",
  "function dataDashPaintTop(",
  "Every pick ",
  "A year, a player, a seat",
];
const missing = need.filter((s) => !page.includes(s));
if (missing.length) {
  throw new Error("index.html missing receipt pieces: " + missing.join(", "));
}

if (!page.includes('DATA_DOORS = [')
  || !page.includes('"my_trades", "league_trades", "my_draft", "league_draft", "profit_loss"')) {
  throw new Error("default board must be the 13 door tiles");
}
if (!page.includes('class="door') || page.includes("The number is one example")) {
  throw new Error("door tiles must be icon + label only");
}

if (page.includes("exactly like")) {
  throw new Error("generated JS must not contain exactly like");
}
if (page.includes('class="receipt-filter"') || page.includes('class="receipt-filters"')) {
  throw new Error("filter menus must be dropdowns, not pill chips");
}
if (page.includes("All years</button>") || page.includes('data-hunt-pos="QB"')) {
  throw new Error("hunt and tape year filters must be dropdowns, not chips");
}
if (page.includes("Held or sold")) {
  throw new Error("Profit / Loss rooms replace the Held or sold dropdown");
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
for (const s of ["Day they traded", "From then to now", "Your board", "Get this for your league", "shareProofNow", "My Trade History", "League Trade History", "My Draft Picks", "League Draft Picks", "Profit / Loss", "Traded away", "Traded in", "Hit rate", "What my pick became", "League year", "top 4"]) {
  if (!mem.includes(s)) throw new Error("MEMORY_SDD missing " + s);
}

console.log(JSON.stringify({ ok: true, checks: need.length }, null, 2));
