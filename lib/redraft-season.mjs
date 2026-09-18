/**
 * GM / redraft season law.
 *
 * Regular season always counts. Top six make the championship hunt and keep
 * setting lineups. First-round losers (two) and anyone who misses the field
 * go to consolation and stop — those weeks do not set place or points.
 * 3rd/5th-place games are the same consolation bucket.
 *
 * Places:
 *   1–2  championship game (title hunt)
 *   3–4  semifinal losers, ordered by regular-season record
 *   5–6  first-round losers, ordered by regular-season record
 *   7–N  missed playoffs, ordered by regular-season record
 *
 * Points: regular-season weeks plus title-hunt playoff weeks. Stubs under 20
 * and every consolation tier are dropped.
 */
import { scoreIsChampionshipHunt } from "./week-score-lists.mjs";

export const PLAYOFF_N = 6;
export const REDRAFT_PLACE_RULE =
  "title hunt 1-2; semis and first-round outs by regular season; missed playoffs by regular season; consolation points out";

export function seasonPointBuckets(scores, season) {
  const year = String(season || "");
  const by = {};
  for (const s of scores || []) {
    if (!s || String(s.season || "") !== year) continue;
    const uid = s.user_id == null ? "" : String(s.user_id);
    if (!uid) continue;
    if (!by[uid]) by[uid] = { rs: 0, hunt: 0, cons: 0, lastHunt: 0, huntWeeks: [] };
    const pts = Number(s.points);
    const add = Number.isFinite(pts) ? pts : 0;
    if (s.phase !== "playoff") {
      by[uid].rs += add;
    } else if (scoreIsChampionshipHunt(s)) {
      by[uid].hunt += add;
      const week = Number(s.week) || 0;
      by[uid].lastHunt = Math.max(by[uid].lastHunt, week);
      if (week) by[uid].huntWeeks.push(week);
    } else {
      by[uid].cons += add;
    }
  }
  return by;
}

export function countableFpts(bucket) {
  if (!bucket) return null;
  const n = Number(bucket.rs || 0) + Number(bucket.hunt || 0);
  return Math.round(n * 100) / 100;
}

export function regularSeasonCompare(a, b, buckets) {
  const pa = (Number(a.wins) || 0) * 2 + (Number(a.ties) || 0);
  const pb = (Number(b.wins) || 0) * 2 + (Number(b.ties) || 0);
  if (pb !== pa) return pb - pa;
  const fa = buckets && buckets[a.user_id] ? buckets[a.user_id].rs : Number(a.fpts) || 0;
  const fb = buckets && buckets[b.user_id] ? buckets[b.user_id].rs : Number(b.fpts) || 0;
  if (fb !== fa) return fb - fa;
  return (Number(a.roster_id) || 0) - (Number(b.roster_id) || 0);
}

function sortRs(rows, buckets) {
  return (rows || []).slice().sort((a, b) => regularSeasonCompare(a, b, buckets));
}

/**
 * Group a season's seats by how far they lasted on the title hunt, using the
 * weekly tape. Bye teams never appear in week-1 hunt and still land in semis.
 */
export function huntExitGroups(rows, buckets, champUserId) {
  const huntWeeks = [...new Set(
    Object.values(buckets || {}).flatMap((b) => b.huntWeeks || []),
  )].sort((a, b) => a - b);
  const finalWeek = huntWeeks[huntWeeks.length - 1] || 0;
  const semiWeek = huntWeeks.length >= 2 ? huntWeeks[huntWeeks.length - 2] : 0;
  const playoff = [];
  const missed = [];
  for (const row of rows || []) {
    const last = (buckets[row.user_id] && buckets[row.user_id].lastHunt) || 0;
    if (last > 0) playoff.push(row);
    else missed.push(row);
  }
  const finalists = playoff.filter((r) => ((buckets[r.user_id] || {}).lastHunt) === finalWeek);
  let champ = champUserId
    ? finalists.find((r) => String(r.user_id) === String(champUserId))
    : finalists.find((r) => Number(r.place) === 1);
  if (!champ && finalists.length) {
    champ = sortRs(finalists, buckets)[0];
  }
  const runnerUp = finalists.filter((r) => r !== champ);
  const semis = playoff.filter((r) => ((buckets[r.user_id] || {}).lastHunt) === semiWeek);
  const firstOut = playoff.filter((r) => {
    const last = (buckets[r.user_id] || {}).lastHunt || 0;
    return last > 0 && last !== finalWeek && last !== semiWeek;
  });
  return { champ, runnerUp, semis, firstOut, missed, playoff };
}

export function applyCountableFpts(rows, buckets) {
  return (rows || []).map((row) => {
    const fpts = countableFpts(buckets[row.user_id]);
    if (fpts == null) return row;
    return { ...row, fpts, fpts_from: "regular+hunt" };
  });
}

/**
 * Rewrite one season's standing rows: consolation-free places and points.
 * `champUserId` is the real champion (title book / bracket p=1 / ESPN place 1).
 */
export function applyRedraftSeason(rows, scores, champUserId) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return list;
  const season = String(list[0].season || "");
  const buckets = seasonPointBuckets(scores, season);
  const hasHunt = Object.values(buckets).some((b) => b.lastHunt > 0);
  let ordered;
  if (hasHunt) {
    const g = huntExitGroups(list, buckets, champUserId);
    ordered = [];
    if (g.champ) ordered.push({ ...g.champ, from: "title" });
    sortRs(g.runnerUp, buckets).forEach((r) => ordered.push({ ...r, from: "title" }));
    sortRs(g.semis, buckets).forEach((r) => ordered.push({ ...r, from: "semi" }));
    sortRs(g.firstOut, buckets).forEach((r) => ordered.push({ ...r, from: "first_round" }));
    sortRs(g.missed, buckets).forEach((r) => ordered.push({ ...r, from: "regular" }));
  } else {
    const champ = champUserId
      ? list.find((r) => String(r.user_id) === String(champUserId))
      : list.find((r) => Number(r.place) === 1);
    const rest = list.filter((r) => r !== champ);
    ordered = [];
    if (champ) ordered.push({ ...champ, from: champ.from || "title" });
    sortRs(rest, buckets).forEach((r) => ordered.push({ ...r, from: "regular" }));
  }
  const seen = new Set();
  const unique = [];
  for (const row of ordered) {
    const key = String(row.user_id || row.roster_id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  unique.forEach((r, i) => { r.place = i + 1; });
  return applyCountableFpts(unique, buckets);
}

export function applyRedraftSeasons(rows, scores, champBySeason) {
  const groups = {};
  for (const row of rows || []) {
    const y = String(row.season || "");
    (groups[y] || (groups[y] = [])).push(row);
  }
  const out = [];
  for (const year of Object.keys(groups).sort((a, b) => b.localeCompare(a))) {
    const champ = champBySeason && (champBySeason[year] || champBySeason[Number(year)]);
    out.push(...applyRedraftSeason(groups[year], scores, champ));
  }
  return out;
}

export function champBySeasonFromTitles(titles) {
  const by = {};
  for (const t of titles || []) {
    if (!t || t.user_id == null || t.season == null) continue;
    by[String(t.season)] = String(t.user_id);
  }
  return by;
}
