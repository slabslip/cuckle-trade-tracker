/**
 * Highest / lowest team-week lists for the Week scores door.
 *
 * Regular season always counts. Playoff weeks count only while a seat is
 * still on the winners-bracket path to the title (championship hunt).
 * Consolation, 3rd/5th-place, bye leftovers, and weeks after the final
 * stay on the raw tape but do not set the low (or high) lists — those
 * seats are out of the hunt and often not setting a lineup.
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
 * Championship-hunt rosters by NFL week from a Sleeper winners_bracket.
 * A row is hunt when it has no placement `p`, or `p === 1` (the title game).
 * `p === 3` / `p === 5` are consolation placement games and are out.
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
    if (place != null && place !== 1) continue;
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

export function scoreIsChampionshipHunt(score) {
  if (!score) return false;
  if (score.phase !== "playoff") return true;
  return score.hunt === true;
}

export function weekScoreBookFromTape(tape) {
  const scores = (tape && tape.scores) || [];
  const names = nameMap();
  const regular = scores.filter((s) => s && s.phase !== "playoff");
  const playoff = scores.filter((s) => s && s.phase === "playoff");
  const playoffHunt = playoff.filter((s) => s.hunt === true);
  const countable = regular.concat(playoffHunt);
  return {
    v: 2,
    as_of: (tape && tape.as_of) || new Date().toISOString().slice(0, 10),
    n: scores.length,
    n_regular: regular.length,
    n_playoff: playoff.length,
    n_playoff_hunt: playoffHunt.length,
    all: pack(countable, names),
    regular: pack(regular, names),
    playoff: pack(playoffHunt, names),
  };
}

export function writeWeekScoreUi(tape) {
  const book = weekScoreBookFromTape(tape);
  writeUi("week-scores.json", book);
  return book;
}
