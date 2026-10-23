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
  "Confirm league",
  "Your Sleeper username",
  "Yes — this is my team",
  "Then add your league.",
  "function renderClaimTeam()",
  "function renderJoinWelcome()",
  "function openJoinWelcome(",
  "function openClaimPick(",
  "function joinInviteLeadHtml()",
  "function joinStepsHtml(",
  "function onReleaseSeat(",
  "Best achievements",
  "Team stats",
  "Past names and finishes",
  "Regular season avg",
  "Playoff avg",
  "Career net",
  'data-join-enter-dash="1"',
  'data-claim-open-go="1"',
  'data-claim-league-yes="1"',
  'data-release-seat="1"',
  'appScreen === "claimTeam"',
  'appScreen === "joinWelcome"',
  'claim_open_seat',
  "ensure_league",
  "release_seat",
  "match_seat",
  "Find my team",
  "claimSleeperUser",
  "claimStep",
  "league_claim_preview",
  "name-history.json",
  ">Unclaim</button>",
  "Wrong team?",
  'data-join-enter-dash="1">Next',
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
function fnSrc(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("missing function " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}
const claimFn = fnSrc(page, "renderClaimTeam");
if (claimFn.includes("data-claim-pick=") || claimFn.includes("Or pick from the league list")
  || page.includes("scheduleClaimMatch")) {
  throw new Error("claim must not list teams, live-match, or offer pick-from-list hints");
}

if (!fn.includes('action === "league_claim_preview"')
  || !fn.includes('action === "claim_open_seat"')
  || !fn.includes('action === "ensure_league"')
  || !fn.includes('action === "release_seat"')
  || !fn.includes('action === "match_seat"')
  || !fn.includes("scoreHandleMatch")
  || !fn.includes("resolveSleeperUsername")) {
  throw new Error("join-league must expose match_seat (Sleeper username → seat) plus peer claim");
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
if (!/^const CACHE = "chuckle-shell-v\d+/m.test(sw)) {
  throw new Error("sw.js must keep a versioned chuckle-shell CACHE");
}

console.log("join landing ok");
