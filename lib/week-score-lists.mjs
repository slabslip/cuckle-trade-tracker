/**
 * Highest / lowest team-week lists for the Week scores door.
 * "Ever" is every scored team-week on tape. Regular and playoff packs
 * sit beside all so the door filter can split them.
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
  return {
    name: names[String(score.user_id)] || "Unknown",
    user_id: score.user_id == null ? "" : String(score.user_id),
    season: String(score.season || ""),
    week: Number(score.week) || 0,
    points: Number.isFinite(pts) ? Math.round(pts * 100) / 100 : 0,
    phase: score.phase === "playoff" ? "playoff" : "regular",
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

export function weekScoreBookFromTape(tape) {
  const scores = (tape && tape.scores) || [];
  const names = nameMap();
  const regular = scores.filter((s) => s && s.phase !== "playoff");
  const playoff = scores.filter((s) => s && s.phase === "playoff");
  return {
    v: 1,
    as_of: (tape && tape.as_of) || new Date().toISOString().slice(0, 10),
    n: scores.length,
    n_regular: regular.length,
    n_playoff: playoff.length,
    all: pack(scores, names),
    regular: pack(regular, names),
    playoff: pack(playoff, names),
  };
}

export function writeWeekScoreUi(tape) {
  const book = weekScoreBookFromTape(tape);
  writeUi("week-scores.json", book);
  return book;
}
