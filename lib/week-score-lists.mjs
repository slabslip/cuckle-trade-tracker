/**
 * Highest / lowest team-week lists for the Week scores door.
 *
 * Regular season always counts. Playoff weeks count while a seat is still
 * on the winners-bracket path to the title, plus the 3rd-place game —
 * those four money seats set lineups. 5th-place / losers consolation,
 * bye leftovers, and weeks after the final stay on the raw tape but do
 * not set the low (or high) lists.
 */
import { existsSync, readFileSync } from "node:fs";
import { leagueRawDir, leagueUiDir, writeUi } from "../lib.mjs";

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function nameMap() {
  const by = {};
  const uiMembers = loadJson(`${leagueUiDir()}/members.json`, []);
  const rawMembers = loadJson(`${leagueRawDir()}/members.json`, []);
  for (const row of rawMembers.concat(uiMembers)) {
    if (!row || row.user_id == null) continue;
    const name = row.name || row.canonical_name || row.display_name;
    if (name) by[String(row.user_id)] = String(name);
  }
  return by;
}

function asRow(score, names) {
  const pts = Number(score && score.points);
  const playoff = score && score.phase === "playoff";
  return {
    name: names[String(score.user_id)] || "Unknown",
    user_id: score.user_id == null ? "" : String(score.user_id),
    season: String(score.season || ""),
    week: Number(score.week) || 0,
    points: Number.isFinite(pts) ? Math.round(pts * 100) / 100 : 0,
    phase: playoff ? "playoff" : "regular",
    hunt: playoff ? score.hunt === true : true,
  };
}

function topN(scores, names, dir, n) {
  const rows = (scores || [])
    .filter((s) => s && Number.isFinite(Number(s.points)))
    .slice()
    .sort((a, b) => (dir === "high" ? Number(b.points) - Number(a.points) : Number(a.points) - Number(b.points)))
    .slice(0, n)
    .map((s) => asRow(s, names));
  return rows;
}

function pack(scores, names) {
  return {
    high: topN(scores, names, "high", 5),
    low: topN(scores, names, "low", 5),
  };
}

function rosterId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Money-game rosters by NFL week from a Sleeper winners_bracket.
 * A row counts when it has no placement `p` (still alive), `p === 1`
 * (title game), or `p === 3` (3rd-place game). `p === 5` is out.
 */
export function huntByWeekFromBracket(wb, pws) {
  const by = {};
  const start = Number(pws);
  if (!Number.isFinite(start) || start < 2) return by;
  for (const row of wb || []) {
    if (!row) continue;
    const round = Number(row.r);
    if (!Number.isFinite(round) || round < 1) continue;
    const place = row.p == null ? null : Number(row.p);
    if (place != null && place !== 1 && place !== 3) continue;
    const week = start + round - 1;
    const set = by[week] || (by[week] = new Set());
    for (const key of ["t1", "t2", "w", "l"]) {
      const rid = rosterId(row[key]);
      if (rid) set.add(rid);
    }
  }
  return by;
}

export function huntByWeekJson(wb, pws) {
  const by = huntByWeekFromBracket(wb, pws);
  const out = {};
  for (const [week, set] of Object.entries(by)) {
    if (!set.size) continue;
    out[week] = [...set].sort((a, b) => a - b);
  }
  return out;
}

const PLAYOFF_STUB_POINTS = 20;

export function scoreIsChampionshipHunt(score) {
  if (!score) return false;
  if (score.phase !== "playoff") return true;
  if (score.hunt !== true) return false;
  const pts = Number(score.points);
  // ESPN bye leftovers / empty lineups land as hunt weeks with a handful of
  // points and no opponent. Those are not a real scored week.
  if (Number.isFinite(pts) && pts < PLAYOFF_STUB_POINTS) return false;
  return true;
}

/** Title-path weeks only (hunt=true). Used to find the championship week. */
export function titlePathWeeks(scores, season) {
  const year = season == null ? "" : String(season);
  const weeks = new Set();
  const last = {};
  for (const score of scores || []) {
    if (!score || !scoreIsChampionshipHunt(score)) continue;
    if (year && String(score.season || "") !== year) continue;
    const week = Number(score.week) || 0;
    if (week) weeks.add(week);
    const uid = score.user_id == null ? "" : String(score.user_id);
    if (!uid) continue;
    last[uid] = Math.max(last[uid] || 0, week);
  }
  const ordered = [...weeks].sort((a, b) => a - b);
  return {
    finalWeek: ordered[ordered.length - 1] || 0,
    semiWeek: ordered.length >= 2 ? ordered[ordered.length - 2] : 0,
    last,
  };
}

/**
 * 3rd-place game: championship week, untagged or winners-consolation, and this
 * seat's last title-path week was the semi. First-round / losers leftovers out.
 */
export function scoreIsSemiMoneyPlace(score, scores) {
  if (!score || score.phase !== "playoff") return false;
  if (scoreIsChampionshipHunt(score)) return false;
  const pts = Number(score.points);
  if (Number.isFinite(pts) && pts < PLAYOFF_STUB_POINTS) return false;
  const { finalWeek, semiWeek, last } = titlePathWeeks(scores, score.season);
  if (!finalWeek || !semiWeek || Number(score.week) !== finalWeek) return false;
  if ((last[String(score.user_id || "")] || 0) !== semiWeek) return false;
  const tier = String(score.playoff_tier || "").toUpperCase();
  if (tier === "LOSERS_CONSOLATION_LADDER") return false;
  if (tier === "WINNERS_CONSOLATION_LADDER") return true;
  if (!tier || tier === "NONE" || tier === "NULL") return true;
  return false;
}

export function scoreIsPlayoffLineup(score, scores) {
  return scoreIsChampionshipHunt(score) || scoreIsSemiMoneyPlace(score, scores);
}

export function weekScoreBookFromTape(tape) {
  const scores = (tape && tape.scores) || [];
  const names = nameMap();
  const regular = scores.filter((s) => s && s.phase !== "playoff");
  const playoff = scores.filter((s) => s && s.phase === "playoff");
  const playoffHunt = playoff.filter((s) => s.hunt === true);
  const countableHunt = playoff.filter((s) => scoreIsPlayoffLineup(s, scores));
  const countable = regular.concat(countableHunt);
  return {
    v: 2,
    as_of: (tape && tape.as_of) || new Date().toISOString().slice(0, 10),
    n: scores.length,
    n_regular: regular.length,
    n_playoff: playoff.length,
    n_playoff_hunt: playoffHunt.length,
    all: pack(countable, names),
    regular: pack(regular, names),
    playoff: pack(countableHunt, names),
  };
}

export function writeWeekScoreUi(tape) {
  const book = weekScoreBookFromTape(tape);
  writeUi("week-scores.json", book);
  return book;
}
