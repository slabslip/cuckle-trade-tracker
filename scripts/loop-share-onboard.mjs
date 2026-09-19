#!/usr/bin/env node
/** Loops: group-text data-tile share (no CF- seat invite) for unclaimed teams. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib.mjs";

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gen = fs.readFileSync(path.join(ROOT, "generate-page.mjs"), "utf8");
const members = JSON.parse(fs.readFileSync(
  path.join(ROOT, "data/leagues/1389723418827460608/ui/members.json"),
  "utf8",
));

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

function loadGuess() {
  const norm = fnSrc(page, "claimNorm");
  const guess = fnSrc(page, "claimGuessSeat");
  if (guess.includes("pendingDataWho")) {
    throw new Error("claimGuessSeat must not read pendingDataWho");
  }
  return new Function(`
    let gateInviteSeatId = null;
    let gateInviteTeam = "";
    let authSession = null;
    let gateSuggestedUser = "";
    function suggestUsernameFromTeam() { return ""; }
    ${norm}
    ${guess}
    return function run(seats, ctx) {
      gateInviteSeatId = ctx.inviteId || null;
      gateInviteTeam = ctx.inviteTeam || "";
      authSession = ctx.username ? { username: ctx.username, seat_name: ctx.seatName || "" } : null;
      gateSuggestedUser = ctx.suggested || "";
      return claimGuessSeat(seats);
    };
  `)();
}

const runGuess = loadGuess();
const unclaimed = members.filter((m) => m && m.user_id && !String(m.user_id).startsWith("espn:"))
  .slice(0, 8);
const seats = members.map((m, i) => ({
  sleeper_user_id: m.user_id,
  team_name: m.name,
  claimed: m.name === "Tbow00" || m.name === "TrumanCooper",
  suggested_username: m.name,
}));
const remaining = seats.filter((s) => !s.claimed);
const kotula = remaining.find((s) => /kotula/i.test(s.team_name));
const biff = remaining.find((s) => /biff/i.test(s.team_name));

function loop(n, ok, label) {
  if (!ok) throw new Error("SHARE " + n + " FAIL: " + label);
  console.log("SHARE " + n + " PASS: " + label);
}

loop(1, remaining.length >= 6 && seats.some((s) => s.claimed),
  "fixture has several remaining teams and at least one claimed seat");

loop(2, !fnSrc(page, "claimGuessSeat").includes("pendingDataWho")
  && !fnSrc(gen, "claimGuessSeat").includes("pendingDataWho"),
  "who= on a group share is not a claim hint");

loop(3, page.includes("this link is not a seat invite")
  && page.includes("Create account to open this view")
  && page.includes("Create account & claim")
  && page.includes("Open the shared view"),
  "unsigned share gate asks for username/password then claim, then opens the tile");

loop(4, page.includes("let leagueParam")
  && page.includes("leagueParam = CUCKLE_LEAGUE_ID")
  && page.includes("shareAccessPending()")
  && page.includes("!claimLeagueId && !gateInviteLeagueId"),
  "tile share without league still has a book to claim into");

// Unclaimed clickers on a kotula line share — must not become kotula.
unclaimed.forEach((m, i) => {
  const g = runGuess(seats, { username: "newguy" + i });
  const wrong = kotula && g.id && String(g.id) === String(kotula.sleeper_user_id);
  if (wrong) throw new Error("SHARE 5 FAIL: random user " + m.name + " guessed kotula from who=");
});
loop(5, true, "unclaimed clickers on a kotula line do not get kotula preselected");

// Matching username still guesses their own remaining seat.
const ownHits = remaining.slice(0, 6).map((s) => {
  const g = runGuess(seats, { username: s.team_name });
  return { name: s.team_name, id: s.sleeper_user_id, guess: g.id, how: g.how };
});
loop(6, ownHits.every((h) => String(h.guess) === String(h.id) && (h.how === "match" || h.how === "guess")),
  "unclaimed users who type their team name still get that seat preselected: "
    + ownHits.map((h) => h.name).join(", "));

const claimedPick = runGuess(seats, { username: "Tbow00" });
loop(7, !claimedPick.id || String(claimedPick.id) !== "1132151393051095040",
  "claimed Tbow00 cannot be guessed or picked from remaining");

const invite = runGuess(seats, {
  username: "newguy",
  inviteId: biff && biff.sleeper_user_id,
});
loop(8, biff && String(invite.id) === String(biff.sleeper_user_id) && invite.how === "match",
  "a real CF- seat invite still wins over a random username");

const onlyLeft = runGuess(seats.filter((s) => !s.claimed).slice(0, 1), { username: "nobody" });
loop(9, onlyLeft.how === "only" && !!onlyLeft.id,
  "one remaining team still auto-selects");

const gate = fnSrc(page, "onGateSubmit");
loop(10, gate.includes("openClaimPick(") && gate.includes("shareAccessPending")
  && page.includes("appScreen = \"gate\"")
  && page.includes("leagueParam && !inviteParam") && page.includes('gateMode = "signup"'),
  "unsigned share/league link lands on signup, then claim remaining");

const welcome = fnSrc(page, "renderJoinWelcome");
const honor = fnSrc(page, "honorPendingDataTile");
loop(11, welcome.includes("Open the shared view")
  && honor.includes("dataTileSeatReady(") && honor.includes("dataDashOpenReport"),
  "after confirm they can open the same shared tile once the seat is theirs");

const url = fnSrc(page, "urlNow");
loop(12, url.includes('appScreen === "gate"') && url.includes('q.set("src", "share")')
  && url.includes("readPendingDataTile"),
  "gate/claim/welcome keep the share URL so a refresh does not dump them");

console.log("PASS 12 share-onboard loops");
