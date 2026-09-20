#!/usr/bin/env node
/** Smoke: invite copy, team picker, pre-dash welcome, name history. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");
const fn = fs.readFileSync(path.join(ROOT, "supabase/functions/join-league/index.ts"), "utf8");
const hist = JSON.parse(fs.readFileSync(
  path.join(ROOT, "data/leagues/1389723418827460608/ui/name-history.json"),
  "utf8",
));

const need = [
  "been invited to join",
  "Claim your team",
  "You\\'ve joined",
  "function renderClaimTeam()",
  "function renderJoinWelcome()",
  "function openJoinWelcome(",
  "function openClaimPick(",
  "function joinInviteLeadHtml()",
  "function joinStepsHtml(",
  "Crowning achievements",
  "Past names and finishes",
  "Regular season avg",
  "Playoff avg",
  "Career net",
  'data-join-enter-dash="1"',
  'data-claim-open-go="1"',
  'data-claim-pick="',
  'appScreen === "claimTeam"',
  'appScreen === "joinWelcome"',
  'claim_open_seat',
  "league_claim_preview",
  "name-history.json",
  "League added. Team claimed.",
  "League added. Team not claimed yet.",
  "joinLandSafeName",
];
const missingPage = need.filter((s) => !page.includes(s));
if (missingPage.length) {
  throw new Error("index.html missing join landing: " + missingPage.join(", "));
}
const missingGen = need.filter((s) => !gen.includes(s));
if (missingGen.length) {
  throw new Error("generate-page.mjs missing join landing: " + missingGen.join(", "));
}

if (!fn.includes('action === "league_claim_preview"')
  || !fn.includes('action === "claim_open_seat"')) {
  throw new Error("join-league must expose league_claim_preview and claim_open_seat");
}

if (page.includes("openLeagueDashboard(leagueInfo)") && page.includes("await onRedeemInvite")) {
  /* redeem must land on welcome, not dash */
}
if (!page.includes("await openJoinWelcome(leagueInfo, { auto: true })")
  || !page.includes("await openJoinWelcome(leagueInfo, { auto: false })")) {
  throw new Error("redeem/claim must open the join welcome before the dashboard");
}

if (hist.v !== 1 || !hist.seats || !hist.seats["1132355027018035200"]) {
  throw new Error("name-history.json must include Biff34");
}
const blob = JSON.stringify(hist).toLowerCase();
if (/nigg|underage|panty|fatass|nazi/.test(blob)) {
  throw new Error("name-history.json still has a blocked slur");
}

const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
if (!sw.includes("chuckle-shell-v306-analyzer-spread")) {
  throw new Error("sw.js must bump to v291-sleeper-daily");
}

console.log("join landing ok");
