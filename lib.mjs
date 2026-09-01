import fs from "node:fs";

export const ROOT = new URL(".", import.meta.url).pathname;
export const DATA = `${ROOT}data`;
export const SLEEPER = "https://api.sleeper.app/v1";
export const CUCKLE_LEAGUE_ID = "1315431339301806080";

/** Active league for this process. Set via setLeagueId / LEAGUE_ID env / argv. */
export let LEAGUE_ID = process.env.LEAGUE_ID || CUCKLE_LEAGUE_ID;

const SHARED_JSON = new Set([
  "value_curve.json",
  "value_snapshots.json",
  "players.nfl.json",
]);

export function setLeagueId(id) {
  const next = String(id || "").trim() || CUCKLE_LEAGUE_ID;
  LEAGUE_ID = next;
  process.env.LEAGUE_ID = next;
  return LEAGUE_ID;
}

export function leagueDataDir(id = LEAGUE_ID) {
  return `${DATA}/leagues/${id}`;
}

export function leagueRawDir(id = LEAGUE_ID) {
  return `${leagueDataDir(id)}/raw`;
}

export function leagueUiDir(id = LEAGUE_ID) {
  return `${leagueDataDir(id)}/ui`;
}

function isSharedJson(name) {
  return SHARED_JSON.has(name) || name.startsWith("ktc/") || name.startsWith("tx_cache/");
}

export function readJson(name, fallback = null) {
  if (!isSharedJson(name)) {
    const scoped = `${leagueRawDir()}/${name}`;
    if (fs.existsSync(scoped)) return JSON.parse(fs.readFileSync(scoped, "utf8"));
  }
  const path = `${DATA}/${name}`;
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function writeJson(name, value) {
  const path = isSharedJson(name) ? `${DATA}/${name}` : `${leagueRawDir()}/${name}`;
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function writeUi(name, value) {
  const scoped = `${leagueUiDir()}/${name}`;
  fs.mkdirSync(scoped.slice(0, scoped.lastIndexOf("/")), { recursive: true });
  const body = JSON.stringify(value) + "\n";
  fs.writeFileSync(scoped, body);
  // Dual-write Cuckle to legacy data/ui so news-refresh and older readers keep working.
  if (LEAGUE_ID === CUCKLE_LEAGUE_ID) {
    const legacy = `${DATA}/ui/${name}`;
    fs.mkdirSync(legacy.slice(0, legacy.lastIndexOf("/")), { recursive: true });
    fs.writeFileSync(legacy, body);
  }
}

export async function sleeperGet(path) {
  const res = await fetch(`${SLEEPER}${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] ?? "";
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function roundName(round) {
  const n = Number(round);
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export function pickTier(slot, teams = 10) {
  const s = Number(slot);
  if (!s) return "Mid";
  const third = teams / 3;
  if (s <= Math.ceil(third)) return "Early";
  if (s <= Math.ceil(2 * third)) return "Mid";
  return "Late";
}

/** NFL week-1 Thursdays used to split in-season vs offseason for trade clocks. */
export const NFL_KICKOFF = {
  2019: "2019-09-05",
  2020: "2020-09-10",
  2021: "2021-09-09",
  2022: "2022-09-08",
  2023: "2023-09-07",
  2024: "2024-09-05",
  2025: "2025-09-04",
  2026: "2026-09-10",
};

export function nflKickoff(seasonYear) {
  const y = Number(seasonYear);
  return NFL_KICKOFF[y] || `${y}-09-08`;
}

/** End of the fantasy/NFL season window (after playoffs). */
export function nflSeasonEnd(seasonYear) {
  const y = Number(seasonYear);
  return `${y + 1}-01-31`;
}

/**
 * Map a trade date onto an NFL season year and phase.
 * In-season: kickoff(Y) … seasonEnd(Y). Offseason before kickoff(Y) targets season Y.
 */
export function nflSeasonContext(date) {
  const y = Number(String(date || "").slice(0, 4));
  if (!y) return { season: null, phase: "offseason" };
  const endPrev = nflSeasonEnd(y - 1);
  if (date <= endPrev) return { season: y - 1, phase: "in_season" };
  const kick = nflKickoff(y);
  if (date < kick) return { season: y, phase: "offseason" };
  const end = nflSeasonEnd(y);
  if (date <= end) return { season: y, phase: "in_season" };
  return { season: y + 1, phase: "offseason" };
}

/** Last day of the 1- or 2-season value window that starts at `date`. */
export function seasonWindowEnd(date, seasonCount) {
  const n = Math.max(1, Number(seasonCount) || 1);
  const { season } = nflSeasonContext(date);
  if (season == null) return date;
  return nflSeasonEnd(season + n - 1);
}

export function addDays(ymd, n) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Weekly anchors from `from` through `to` (inclusive), for in-window value averages. */
export function weekAsOfs(from, to) {
  if (!from || !to || from > to) return from ? [from] : [];
  const out = [];
  let d = from;
  while (d < to) {
    out.push(d);
    d = addDays(d, 7);
  }
  if (!out.includes(to)) out.push(to);
  return out;
}

/**
 * Snap dates for a season-span clock: weekly from accept through min(window end, today).
 * In-season trades cover the rest of that season; offseason trades cover through the next
 * season (seasonCount=1) or the next two (seasonCount=2).
 */
export function seasonAsOfs(t0, today, seasonCount) {
  const end = seasonWindowEnd(t0, seasonCount);
  const cap = !today || end < today ? end : today;
  return weekAsOfs(t0, cap);
}

/** True once today is on/after the season-span window end for this trade date. */
export function seasonLived(date, seasonCount, today) {
  if (!date || !today) return false;
  return today >= seasonWindowEnd(date, seasonCount);
}
