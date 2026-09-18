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
const finishes = load(`${ui}/finishes.json`, {});
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
loop(5, espn.authorized === true
  && (espn.seasons || []).join(",") === "2024,2023,2022,2021,2020"
  && (bridge.espn_seasons || []).join(",") === "2024,2023,2022,2021,2020"
  && (bridge.mapped || 0) >= 12,
  "ESPN 2020–2024 authorized; person/franchise maps exist");
loop(6, rosters.length === 12 && members.length >= 13
  && members.some((m) => m.name === "SethHenry12" && m.place > 12)
  && members[0].name === "Biff34",
  "12 live rosters, 2025 finish order, Seth parked, ESPN-only names join the book");
loop(7, !rosterOwners.has("1259573343355404288") && rosterOwners.has("1338979666412716032"),
  "Jnasty has no 2026 roster; Seth is the 2026 seat");
const t25 = (titles.titles || []).find((t) => t.season === "2025");
const t24 = (titles.titles || []).find((t) => t.season === "2024");
const t23 = (titles.titles || []).find((t) => t.season === "2023");
const t20 = (titles.titles || []).find((t) => t.season === "2020");
loop(8, (titles.titles || []).length === 6
  && t25 && t25.name === "Biff34" && t25.record && t25.record.fpts_rank === 1
  && t25.prior && Number(t25.prior.place) === 9 && String(t25.prior.season) === "2024"
  && t24 && t24.provider === "espn" && t24.name === "fatassmexican"
  && t24.repeat === "repeat" && t24.record && t24.record.fpts_rank === 3
  && t23 && t23.repeat == null
  && t20 && t20.provider === "espn" && t20.name === "collinmccaskill"
  && titles.titles.filter((t) => t.provider === "espn").length === 5
  && titles.titles.some((t) => t.season === "2022" && t.name === "Tbow00")
  && titles.titles.every((t) => t.season !== "2019"),
  "six real crowns; Biff climbed from 2024 9th; 2024/2023 chips are fatassmexican");
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
  && weekly.n_regular >= 180
  && (weekly.scores || []).filter((s) => s.season === "2025").length === 216
  && (weekly.scores || []).filter((s) => s.season === "2026").length >= 12
  && (weekly.scores || []).filter((s) => s.provider === "espn").length >= 1000
  && ["2024", "2023", "2022", "2021", "2020"].every((y) => (weekly.scores || []).some((s) => s.season === y && s.provider === "espn")),
  "weekly tape has Sleeper 2025–2026 plus ESPN 2020–2024");
loop(16, weeks.v >= 2 && weeks.n >= 1000
  && weeks.all && weeks.all.high && weeks.all.high[0] && weeks.all.high[0].points >= 180
  && weeks.all.high[0].name === "Adizzl3"
  && weeks.regular && weeks.regular.low && weeks.regular.low[0] && weeks.regular.low[0].points <= 28.34
  && weeks.regular.low[0].phase === "regular"
  && weeks.all.low && weeks.all.low[0] && weeks.all.low[0].name === "TaylorJohnson16"
  && weeks.all.low[0].points === 28.34
  && !(weeks.all.low || []).some((r) => r.points === 9 && r.name === "collinmccaskill"),
  "week-scores high/low use imported ESPN tape; 9-pt ESPN stub is not the league low");
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
loop(20, seats.length >= 24
  && seats.filter((s) => s.provider === "espn").length === 60,
  "seats cover both Sleeper seasons plus 60 ESPN seats");
const markIds = Object.keys(marks.seats || {});
const sleeperMarks = markIds.filter((id) => !String(id).startsWith("espn:"));
const espnMarks = markIds.filter((id) => String(id).startsWith("espn:"));
loop(21, sleeperMarks.length === 13 && espnMarks.length >= 14
  && Object.values(marks.seats).every((m) => m.lens && m.lens.t0 && m.lens.all)
  && Object.values(marks.seats).every((m) => !m.lens.y1 && !m.lens.y2 && !m.lens.y3),
  "marks cover 13 Sleeper seats plus ESPN-only history; t0+all only");
loop(22, (dir.seats || []).filter((s) => !String(s.seat_user_id || "").startsWith("espn:")).length === 13
  && (dir.seats || []).some((s) => String(s.seat_user_id || "").startsWith("espn:") && s.label === "Parked")
  && dir.seats.every((s) => s.label !== "Hard rebuild" && s.label !== "Rebuild")
  && dir.seats.every((s) => !/2027/.test(s.why || "") && !/2027/.test(s.pace_why || "")),
  "direction has 13 Sleeper seats, ESPN alumni Parked, no Hard rebuild, no 2027");
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
const sleeperHunt = (weekly.scores || []).filter((s) => s.phase === "playoff" && s.hunt && s.provider !== "espn");
const espnHunt = (weekly.scores || []).filter((s) => s.phase === "playoff" && s.hunt && s.provider === "espn");
loop(33, weekly.v >= 3 && weekly.n_playoff_hunt === 70
  && sleeperHunt.length === 10 && espnHunt.length === 60
  && (weekly.scores || []).filter((s) => s.phase === "playoff" && !s.hunt).length === 158
  && weeks.n_playoff_hunt === 70
  && (weeks.playoff.high || []).every((r) => r.phase === "playoff")
  && (weeks.playoff.low || []).every((r) => r.phase === "playoff")
  && !(weeks.all.low || []).some((r) => r.week === 18)
  && !(weeks.playoff.low || []).some((r) => r.name === "TaylorJohnson16" && r.week === 18)
  && !(weeks.playoff.high || []).some((r) => r.name === "Tbow00" && r.points === 157.58)
  && weeks.playoff.high[0] && weeks.playoff.high[0].name === "Biff34" && weeks.playoff.high[0].points === 163.38
  && weeks.playoff.low[0] && weeks.playoff.low[0].name === "kotula69" && weeks.playoff.low[0].points === 56.06
  && !(weeks.playoff.low || []).some((r) => r.name === "collinmccaskill" && r.points === 9),
  "playoff lists are title + 3rd-place money games — ESPN stub 9-pt week is out");
loop(34, page.includes("championship hunt plus the 3rd-place game") && page.includes("title hunt")
  && page.includes("still hunting the title or playing for 3rd"),
  "Week scores copy drops out-of-hunt playoff weeks");
loop(35, fs.existsSync(`${raw}/espn_weekly_scores.json`)
  && Array.isArray(load(`${raw}/espn_weekly_scores.json`, {}).scores)
  && page.includes("function resolveEspnScoreUid(") === false
  && fs.readFileSync(`${ROOT}weekly-scores.mjs`, "utf8").includes("resolveEspnScoreUid")
  && fs.readFileSync(`${ROOT}merge-provider-history.mjs`, "utf8").includes("buildFranchiseMap"),
  "ESPN weekly tape + franchise attach are wired (empty until cookies)");
loop(36, (weekly.scores || []).filter((s) => s.provider === "espn" && ["2025", "2026"].includes(String(s.season))).length === 0
  && page.includes("Sleeper tape only until ESPN years unlock.")
  && page.includes("ESPN years sit next to Sleeper."),
  "ESPN weeks never overwrite Sleeper 2025-2026; door copy flips when authorized");
loop(37, page.includes("function espnUnlockStepsHtml(")
  && page.includes("Unlock ESPN history")
  && page.includes("espn_s2")
  && page.includes("ESPN_SWID")
  && page.includes("unlock in Settings")
  && page.includes("GitHub secrets do nothing until Rebuild runs")
  && page.includes("DATA_DASH_REDRAFT")
  && page.includes("function resetLeagueSession(")
  && page.includes("Redraft calculator")
  && page.includes("Add Yahoo ID"),
  "Settings lists ESPN unlock; redraft board, calc, and Yahoo slot ship");

const biffFin = (finishes.seats || []).find((s) => s.name === "Biff34");
const jnFin = (finishes.seats || []).find((s) => s.name === "JnastyGBE300");
const truFin = (finishes.seats || []).find((s) => s.name === "TrumanCooper");
loop(38, finishes.v === 4 && Array.isArray(finishes.seats)
  && finishes.pot && finishes.pot.entry === 300
  && finishes.pot.sacko === 200
  && finishes.career_floor === 3
  && /consolation points out/.test(finishes.rule || "")
  && /3rd-place game/.test(finishes.rule || "")
  && /last = worst RS record/.test(finishes.rule || "")
  && (finishes.seasons || []).includes("2025")
  && (finishes.seasons || []).includes("2020")
  && !(finishes.seasons || []).includes("2026")
  && !(finishes.seats || []).some((s) => s.name === "SethHenry12")
  && biffFin && biffFin.n === 6 && biffFin.places.some((p) => p.season === "2025" && p.place === 1)
  && biffFin.places.some((p) => p.season === "2024" && p.provider === "espn")
  && biffFin.fpts_avg === 1676.5 && biffFin.top6_n === 4 && biffFin.last_n === 0
  && jnFin && jnFin.n === 6 && jnFin.places.some((p) => p.season === "2025" && p.place === 2)
  && jnFin.places.some((p) => p.season === "2020" && p.provider === "espn")
  && jnFin.last_n === 2
  && truFin && truFin.places.some((p) => p.season === "2025" && p.place === 10)
  && truFin.last_n === 0
  && finishes.seats[0] && finishes.seats[0].name === "Tbow00" && finishes.seats[0].avg === 4.5
  && biffFin.avg === 4.7,
  "How I finished spans 2020–2025; RS+hunt places; Seth has no completed season");
loop(39, page.includes("function buildFinishesBook(") === false
  && fs.readFileSync(`${ROOT}lib/finishes.mjs`, "utf8").includes("average of completed seasons only")
  && page.includes('getLeagueJson("finishes.json")')
  && page.includes("Each year's real final standing. Top six from the playoff bracket")
  && page.includes("1 season")
  && page.includes(" seasons"),
  "How I finished door reads finishes.json and prints season count under each name");
loop(40, page.includes("const DATA_REPORTS = [")
  && (page.match(/id: "season_place"/g) || []).length >= 1
  && page.includes('id: "career_avg"')
  && page.includes('id: "points_king"')
  && page.includes('id: "contender_rate"')
  && page.includes('id: "sacko"')
  && page.includes('id: "rs_avg"')
  && page.includes('id: "playoff_n"')
  && page.includes('id: "pot_net"')
  && page.includes('"rs_avg", "playoff_n", "playoff_avg", "pot_net"')
  && page.includes("function dataDashRedraftStale(")
  && page.includes("function finishCareerClaim(")
  && !page.includes('id: "avg_finish"')
  && page.includes('"past_champions", "season_place", "vs_you"'),
  "redraft home is career tiles; dynasty default board stays the 13 doors");

const cosmetics = load(`${ui}/cosmetics.json`, { unlocks: {} });
const unlocks = cosmetics.unlocks || {};
const biffUnlock = unlocks["1132355027018035200"] || {};
const poopUnlock = unlocks["741001884449525760"] || {};
const collinUnlock = unlocks["1132552110328983552"] || {};
const truUnlock = unlocks["458342725222133760"] || {};
const dizUnlock = unlocks["1132146625205567488"] || {};
loop(41, biffUnlock.climber && biffUnlock.champion
  && poopUnlock.repeat && poopUnlock.two_time && poopUnlock.bracket_thief
  && collinUnlock.inaugural && collinUnlock.champion
  && !truUnlock.last_place && !truUnlock.last_place_title
  && dizUnlock.last_place
  && !(cosmetics.catalog || []).some((c) => c.pair === "founding_draft")
  && (cosmetics.catalog || []).some((c) => c.id === "inaugural" && !/\(2019\)/.test(c.how || "")),
  "titles/emblems rebuilt: climber, repeat, inaugural; Sacko is last place not 10th");

const adizz = (finishes.seats || []).find((s) => s.name === "Adizzl3");
const tbow = (finishes.seats || []).find((s) => s.name === "Tbow00");
const ztrain = (finishes.seats || []).find((s) => s.name === "ztrain123");
const tully = (finishes.seats || []).find((s) => s.name === "fatassmexican");
const y25 = (name) => ((finishes.seats || []).find((s) => s.name === name) || {}).places
  ?.find((p) => p.season === "2025");
const y24 = (name) => ((finishes.seats || []).find((s) => s.name === name) || {}).places
  ?.find((p) => p.season === "2024");
loop(42, adizz && adizz.n === 6 && adizz.avg === 4.8 && adizz.contender === 83.3 && adizz.last_n === 1
  && adizz.playoff_n === 5 && adizz.playoff_avg === 3.4
  && tbow && tbow.avg === 4.5 && tbow.fpts_avg === 1662.1 && tbow.rs_avg === 4 && tbow.playoff_avg === 3
  && ztrain && ztrain.last_n === 1
  && tully && tully.titles_n === 2 && tully.won === 4600 && tully.lost === 1800 && tully.net === 2800
  && y25("sbzy11") && y25("sbzy11").place === 5 && y25("sbzy11").from === "first_round"
  && y25("fatassmexican") && y25("fatassmexican").place === 6
  && y25("Biff34") && y25("Biff34").fpts === 2109.48
  && y24("kotula69") && y24("kotula69").place === 3 && y24("Tbow00") && y24("Tbow00").place === 4
  && members[4] && members[4].name === "sbzy11" && members[5] && members[5].name === "fatassmexican"
  && members[11] && members[11].name === "Adizzl3"
  && page.includes("Three completed seasons minimum")
  && page.includes("Last in regular season")
  && page.includes("consolation is out")
  && !page.includes("Worst place that year, not 10th")
  && page.includes("dataDashRedraftStale"),
  "career tiles: Tbow 4.5, Biff RS+hunt points, Adizzl3 contender, Jnasty sackos");

const yearPlace = (season, place) => {
  for (const seat of finishes.seats || []) {
    const row = (seat.places || []).find((p) => p.season === season && p.place === place);
    if (row) return { name: seat.name, from: row.from, rs_place: row.rs_place };
  }
  return null;
};
const YEAR_LOCK = {
  2025: { 1: ["Biff34", "title"], 2: ["JnastyGBE300", "title"], 3: ["ztrain123", "semi"], 4: ["collinmccaskill", "semi"], 5: ["sbzy11", "first_round"], 6: ["fatassmexican", "first_round"], 12: ["Adizzl3", "regular"] },
  2024: { 1: ["fatassmexican", "title"], 2: ["Adizzl3", "title"], 3: ["kotula69", "semi"], 4: ["Tbow00", "semi"], 5: ["sbzy11", "first_round"], 6: ["Aballers", "first_round"], 12: ["ztrain123", "regular"] },
  2023: { 1: ["fatassmexican", "title"], 2: ["Biff34", "title"], 3: ["Adizzl3", "semi"], 4: ["Aballers", "semi"], 5: ["ztrain123", "first_round"], 6: ["kotula69", "first_round"], 12: ["JnastyGBE300", "regular"] },
  2022: { 1: ["Tbow00", "title"], 2: ["TaylorJohnson16", "title"], 3: ["Ricky Swink", "semi"], 4: ["collinmccaskill", "semi"], 5: ["Adizzl3", "first_round"], 6: ["JaredMcFadden", "first_round"], 12: ["hudmorse", "regular"] },
  2021: { 1: ["ztrain123", "title"], 2: ["Tbow00", "title"], 3: ["Adizzl3", "semi"], 4: ["kotula69", "semi"], 5: ["fatassmexican", "first_round"], 6: ["Biff34", "first_round"], 12: ["JnastyGBE300", "regular"] },
  2020: { 1: ["collinmccaskill", "title"], 2: ["ztrain123", "title"], 3: ["Biff34", "semi"], 4: ["Adizzl3", "semi"], 5: ["Tbow00", "first_round"], 6: ["JaredMcFadden", "first_round"], 12: ["TaylorJohnson16", "regular"] },
};
const yearLockOk = Object.entries(YEAR_LOCK).every(([season, places]) => (
  Object.entries(places).every(([place, [name, from]]) => {
    const row = yearPlace(season, Number(place));
    return row && row.name === name && row.from === from;
  })
));
const y24Taylor = y24("TaylorJohnson16");
const y20Taylor = ((finishes.seats || []).find((s) => s.name === "TaylorJohnson16") || {}).places
  ?.find((p) => p.season === "2020");
const y21Jnasty = ((finishes.seats || []).find((s) => s.name === "JnastyGBE300") || {}).places
  ?.find((p) => p.season === "2021");
loop(43, yearLockOk
  && y24Taylor && y24Taylor.place === 7 && y24Taylor.from === "regular" && y24Taylor.rs_place === 7
  && y20Taylor && y20Taylor.place === 12 && y20Taylor.rs_place === 12
  && y21Jnasty && y21Jnasty.place === 12 && y21Jnasty.rs_place === 12
  && y24("kotula69") && y24("kotula69").place === 3
  && y25("ztrain123") && y25("ztrain123").place === 3
  && y25("collinmccaskill") && y25("collinmccaskill").place === 4
  && page.includes("Leftover scores do not move this number")
  && Array.isArray(finishes.years) && finishes.years.length === 6
  && finishes.years[0].season === "2025" && finishes.years[0].rows[0].name === "Biff34"
  && finishes.years.find((y) => y.season === "2024")?.rows[2]?.name === "kotula69"
  && page.includes("function finishYearBoard(")
  && page.includes("Pick a year for that board."),
  "final standings: champ 1-2, 3rd-place 3-4, first-round 5-6, RS 7-12 including sacko");

console.log("PASS 43 Gm dataset loops");
