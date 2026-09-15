#!/usr/bin/env node
/**
 * Dataset loops for Gm 2026 LLJ — first dual-API historical merge.
 * Each loop is one law. Fail fast. Dynasty leaks fail the book.
 */
import fs from "node:fs";
import { detectLeagueFormat } from "../lib.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const ID = "1389723418827460608";
const PRIOR = "1253382148073725952";
const ESPN = "35763180";
const raw = `${ROOT}data/leagues/${ID}/raw`;
const ui = `${ROOT}data/leagues/${ID}/ui`;
const cuckleUi = `${ROOT}data/ui`;

function load(p, fb) {
  if (!fs.existsSync(p)) return fb;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function loop(n, cond, msg) {
  if (!cond) {
    console.error("DATA " + n + " FAIL: " + msg);
    process.exit(1);
  }
  console.log("DATA " + n + " PASS: " + msg);
}

const leagues = load(`${raw}/leagues.json`, []);
const format = detectLeagueFormat(leagues);
const league = load(`${ui}/league.json`, {});
const members = load(`${ui}/members.json`, []);
const titles = load(`${ui}/titles.json`, { titles: [] });
const marks = load(`${ui}/marks.json`, { seats: {} });
const dir = load(`${ui}/seat-direction.json`, { seats: [] });
const cuffs = load(`${ui}/cuffs.json`, {});
const calc = load(`${ui}/calculator.json`, {});
const weeks = load(`${ui}/week-scores.json`, {});
const picks = load(`${ui}/picks.json`, {});
const trades = load(`${raw}/trades.json`, []);
const legs = load(`${raw}/trade_legs.json`, []);
const weekly = load(`${raw}/weekly_scores.json`, {});
const rosters = load(`${raw}/rosters_now.json`, []);
const seats = load(`${raw}/seats.json`, []);
const drafts = load(`${raw}/drafts.json`, []);
const draftPicks = load(`${raw}/draft_picks.json`, []);
const espn = load(`${raw}/espn_status.json`, {});
const bridge = load(`${raw}/provider_bridge.json`, {});
const providers = load(`${raw}/providers.json`, {});
const tape = load(`${raw}/trade_tape.json`, []);
const page = fs.readFileSync(`${ROOT}generate-page.mjs`, "utf8");

const nameBy = Object.fromEntries(members.map((m) => [String(m.user_id), m.name]));
const rosterOwners = new Set(rosters.map((r) => String(r.owner_id || r.user_id)));
const calcOwners = {};
for (const p of calc.players || []) {
  const o = String(p.owner_id || "");
  calcOwners[o] = (calcOwners[o] || 0) + 1;
}

loop(1, format.kind === "redraft" && format.book === "1qb" && format.windows.join(",") === "t0,all",
  "detectLeagueFormat is 1QB redraft t0+all");
loop(2, league.format && league.format.kind === "redraft" && league.format.windows.join(",") === "t0,all",
  "league.json.format matches the raw book");
loop(3, providers.sleeper_league_id === ID
  && (providers.sleeper_extra_ids || []).includes(PRIOR)
  && providers.espn_league_id === ESPN,
  "providers.json lists current Sleeper, 2025 Sleeper, and ESPN");
loop(4, leagues.some((l) => String(l.league_id) === ID && String(l.season) === "2026")
  && leagues.some((l) => String(l.league_id) === PRIOR && String(l.season) === "2025")
  && leagues.every((l) => !l.provider || l.provider === "sleeper"),
  "Sleeper walk has 2026 current + 2025 prior; no fake ESPN league rows");
loop(5, espn.authorized === false && espn.reason === "espn_private_needs_cookie"
  && (bridge.espn_seasons || []).length === 0 && (bridge.mapped || 0) === 0,
  "ESPN lock is honest — empty seasons, mapped 0");
loop(6, rosters.length === 12 && members.length === 13
  && members.some((m) => m.name === "SethHenry12" && m.place > 12)
  && members[0].name === "Biff34" && members[9].name === "TrumanCooper",
  "12 live rosters, 2025 finish order, Seth parked 13th, Truman 10th");
loop(7, !rosterOwners.has("1259573343355404288") && rosterOwners.has("1338979666412716032"),
  "Jnasty has no 2026 roster; Seth is the 2026 seat");
loop(8, (titles.titles || []).length === 1 && titles.titles[0].name === "Biff34"
  && titles.titles[0].season === "2025" && titles.titles.every((t) => t.provider !== "espn"),
  "one Sleeper crown (Biff34 2025); no invented ESPN titles");
loop(9, trades.length === 7 && legs.length >= 14 && tape.length === 7
  && trades.every((t) => String(t.season) === "2025"),
  "seven 2025 two-way trades on the merged tape");
loop(10, (league.trade_boards && league.trade_boards.sides || []).length === 12
  && league.trade_boards.sides.every((s) => s.windows && s.windows.t0 && s.windows.all)
  && league.trade_boards.sides.every((s) => !s.windows.y1 && !s.windows.y2 && !s.windows.y3),
  "trade boards are 12 sides (6 complete deals) with t0+all only");
loop(11, (league.traders || []).every((t) => !t.style || !/rebuild/i.test(t.style.label || "")),
  "trader styles are not dynasty Rebuild / Hard rebuild");
loop(12, Array.isArray(league.firsts_held) && league.firsts_held.length === 12
  && league.firsts_held.every((r) => r.held && r.season === "2026" && r.round === 1),
  "12 this-season firsts still held (redraft firsts door)");
loop(13, (league.player_lists && league.player_lists.forever || []).length >= 12
  && league.player_lists.forever.every((r) => r.trades === 0),
  "forever is this-season draftees who never moved, not an empty 2019 list");
loop(14, (league.player_lists.homesteaders || []).length === 5
  && (league.player_lists.most_traded || []).length === 5
  && (league.player_lists.least_traded || []).length === 5,
  "most/least/homestead lists are five-deep");
loop(15, weekly.v >= 3 && weekly.n === weekly.n_regular + weekly.n_playoff
  && weekly.n_regular >= 180 && weekly.n_playoff === 48
  && (weekly.scores || []).filter((s) => s.season === "2025").length === 216
  && (weekly.scores || []).filter((s) => s.season === "2026").length >= 12
  && (weekly.scores || []).filter((s) => s.season === "2026").every((s) => s.phase === "regular"),
  "weekly tape has complete 2025 plus in-season 2026 regular weeks");
loop(16, weeks.v >= 2 && weeks.n >= 228
  && weeks.all && weeks.all.high && weeks.all.high[0] && weeks.all.high[0].points >= 177.96
  && weeks.all.low && weeks.all.low[0] && weeks.all.low[0].name === "JnastyGBE300"
  && weeks.all.low[0].points === 34.82 && weeks.all.low[0].phase === "regular",
  "week-scores high is a real scored week; low is Jnasty 34.82 regular");
loop(17, (calc.players || []).length >= 180
  && Object.keys(calcOwners).length === 12
  && Object.keys(calcOwners).every((id) => rosterOwners.has(id))
  && !calcOwners["1259573343355404288"]
  && (calc.players || []).filter((p) => p.pos !== "DEF").every((p) => p.value === p.value_flat),
  "calc is 1QB flatten on the 12 live rosters, not Jnasty and not Superflex blend");
loop(18, (calc.picks || []).length === 0,
  "redraft calc has no future dynasty picks");
loop(19, drafts.length === 2 && draftPicks.length === 360
  && drafts.every((d) => d.status === "complete" && d.type === "snake"),
  "two complete snake drafts (2025 + 2026), 360 picks");
loop(20, seats.length === 24,
  "seats cover both Sleeper seasons (12 x 2)");
loop(21, Object.keys(marks.seats || {}).length === 13
  && Object.values(marks.seats).every((m) => m.lens && m.lens.t0 && m.lens.all)
  && Object.values(marks.seats).every((m) => !m.lens.y1 && !m.lens.y2 && !m.lens.y3),
  "marks cover 13 seats with t0+all only");
loop(22, (dir.seats || []).length === 13
  && dir.seats.every((s) => s.label !== "Hard rebuild" && s.label !== "Rebuild")
  && dir.seats.every((s) => !/2027/.test(s.why || "") && !/2027/.test(s.pace_why || "")),
  "direction has no Hard rebuild and no 2027 pick copy");
loop(23, dir.seats.some((s) => s.name === "JnastyGBE300" && s.label === "Parked" && (s.holes || []).length === 0)
  && dir.seats.some((s) => s.name === "SethHenry12" && s.label !== "Parked" && rosterOwners.has(s.seat_user_id)),
  "Jnasty (no 2026 bag) is Parked; Seth (live 2026 roster) is not");
loop(24, dir.seats.filter((s) => rosterOwners.has(s.seat_user_id)).every((s) => {
  const qbs = (calc.players || []).filter((p) => p.owner_id === s.seat_user_id && p.pos === "QB");
  return !(s.holes || []).includes("QB") || qbs.length === 0;
}),
  "live 1QB seats are not flagged QB-hole when they have a QB");
loop(25, cuffs.v === 1 && (cuffs.rows || []).length >= 36
  && (cuffs.slots || []).includes("QB1"),
  "cuffs book is present for the live rosters");
loop(26, Object.keys(picks).length === 0 || Object.values(picks).every((p) => p),
  "picks.json is empty or well-formed (redraft firsts live on league.firsts_held)");
loop(27, members.every((m) => fs.existsSync(`${ui}/me/${m.user_id}.json`)),
  "every member has a me/*.json seat file");

const truman = load(`${ui}/me/458342725222133760.json`, {});
const trumanWins = (truman.trades && truman.trades[0] && truman.trades[0].windows) || {};
loop(28, truman.trades && truman.trades.length >= 1
  && trumanWins.t0 && trumanWins.all && !trumanWins.y1 && !trumanWins.y2 && !trumanWins.y3,
  "Truman seat trades expose t0+all windows only");
loop(29, page.includes("function formatLensOrT0(")
  && page.includes("function effectiveRunLens(")
  && page.includes("This season first-round")
  && page.includes("Still on the team that drafted them this season."),
  "shell clamps clocks and uses redraft firsts / forever copy");
loop(30, !fs.existsSync(`${cuckleUi}/league.json`)
  || load(`${cuckleUi}/league.json`, {}).format?.kind !== "redraft",
  "Cuckle data/ui was not overwritten by the redraft book");

const jnastyDir = (dir.seats || []).find((s) => s.name === "JnastyGBE300");
loop(31, jnastyDir && jnastyDir.label === "Parked" && (jnastyDir.holes || []).length === 0
  && !/2027/.test(jnastyDir.why || ""),
  "Jnasty (2025 runner-up, no 2026 roster) is Parked, not a 2QB hole card");

const biffDir = (dir.seats || []).find((s) => s.name === "Biff34");
loop(32, biffDir && biffDir.label === "Win-now" && !(biffDir.holes || []).includes("QB"),
  "Biff34 (champ, 1QB roster) is Win-now without a fake QB hole");
loop(33, weekly.v >= 3 && weekly.n_playoff_hunt === 10
  && (weekly.scores || []).filter((s) => s.phase === "playoff" && s.hunt).length === 10
  && (weekly.scores || []).filter((s) => s.phase === "playoff" && !s.hunt).length === 38
  && weeks.n_playoff_hunt === 10
  && (weeks.playoff.high || []).every((r) => r.hunt)
  && (weeks.playoff.low || []).every((r) => r.hunt)
  && (weeks.all.low || []).every((r) => r.phase !== "playoff" || r.hunt)
  && !(weeks.all.low || []).some((r) => r.week === 18)
  && !(weeks.playoff.low || []).some((r) => r.name === "TaylorJohnson16")
  && !(weeks.playoff.high || []).some((r) => r.name === "Tbow00" && r.points === 157.58)
  && weeks.playoff.high[0] && weeks.playoff.high[0].name === "Biff34" && weeks.playoff.high[0].points === 163.38
  && weeks.playoff.low[0] && weeks.playoff.low[0].name === "JnastyGBE300" && weeks.playoff.low[0].points === 85.28,
  "playoff lists are championship hunt only — consolation / week 18 leftovers are out");
loop(34, page.includes("championship hunt only") && page.includes("title hunt")
  && page.includes("still hunting the title"),
  "Week scores copy drops out-of-hunt playoff weeks");
loop(35, fs.existsSync(`${raw}/espn_weekly_scores.json`)
  && Array.isArray(load(`${raw}/espn_weekly_scores.json`, {}).scores)
  && page.includes("function resolveEspnScoreUid(") === false
  && fs.readFileSync(`${ROOT}weekly-scores.mjs`, "utf8").includes("resolveEspnScoreUid")
  && fs.readFileSync(`${ROOT}merge-provider-history.mjs`, "utf8").includes("buildFranchiseMap"),
  "ESPN weekly tape + franchise attach are wired (empty until cookies)");
loop(36, (weekly.scores || []).filter((s) => s.provider === "espn" && ["2025", "2026"].includes(String(s.season))).length === 0
  && page.includes("Sleeper tape only until ESPN years unlock."),
  "ESPN weeks never overwrite Sleeper 2025-2026; door states the lock");
loop(37, page.includes("function espnUnlockStepsHtml(")
  && page.includes("Unlock ESPN history")
  && page.includes("espn_s2")
  && page.includes("ESPN_SWID")
  && page.includes("unlock in Settings"),
  "Settings lists the ESPN cookie unlock steps");

console.log("PASS 37 Gm dataset loops");
