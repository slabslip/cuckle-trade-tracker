/**
 * GM / redraft season law.
 *
 * Regular season always counts. Top six make the championship hunt and keep
 * setting lineups. First-round losers (two) and anyone who misses the field
 * go to consolation and stop — those weeks do not set place or points.
 * The 3rd-place game sets 3rd and 4th. The 5th-place / losers ladder stays
 * in the consolation bucket and does not move place.
 *
 * Places:
 *   1–2  championship game (title hunt)
 *   3–4  3rd-place game (semifinal losers; official final standings)
 *   5–6  first-round losers, ordered by regular-season record
 *   7–N  missed playoffs, ordered by regular-season record
 *
 * Points: regular-season weeks plus title-hunt playoff weeks. Stubs under 20
 * and every consolation tier — including the 3rd-place game — are dropped
 * from countable PF. The 3rd-place game is tracked for place only.
 */
import { scoreIsChampionshipHunt } from "./week-score-lists.mjs";

export const PLAYOFF_N = 6;
export const PLAYOFF_AVG_FLOOR = 2;
export const REDRAFT_PLACE_RULE =
  "title hunt 1-2; 3rd-place game 3-4; first-round outs and missed playoffs by regular season; consolation points out";

/** $300 buy-in. 1st / 2nd / 3rd plus most regular-season points. Last place pays $200 extra. */
export const GM_ENTRY = 300;
export const GM_SACKO = 200;
export const GM_MP = 300;
export const GM_PAYOUTS = { 1: 2300, 2: 900, 3: 300 };
export const GM_POT = {
  entry: GM_ENTRY,
  teams: 12,
  pot: 3800,
  mp: GM_MP,
  sacko: GM_SACKO,
  note: "1st $2,300 · 2nd $900 · 3rd $300 · most regular-season points $300. $300 entry. Last place pays $200 extra into the pot. Consolation unpaid.",
  payouts: GM_PAYOUTS,
};

/**
 * Career net for one seat:
 *   place payouts (1st $2,300 / 2nd $900 / 3rd $300)
 * + $300 if they scored the most regular-season points that year
 * − $300 entry × completed seasons
 * − $200 extra each year they finished last (sacko)
 * Playoff / consolation points never win the MP $300.
 */
export function careerNetFromParts(won, lost) {
  const w = Number(won) || 0;
  const l = Number(lost) || 0;
  return w - l;
}

export function payoutForPlace(place, pot = GM_POT) {
  const table = (pot && pot.payouts) || {};
  const amt = table[Number(place)] ?? table[String(place)];
  const n = Number(amt);
  return Number.isFinite(n) ? n : 0;
}

export function madePlayoffs(row) {
  const from = String((row && row.from) || "");
  if (from === "regular" || from === "record") return false;
  if (from === "title" || from === "semi" || from === "first_round") return true;
  return Number(row && row.place) <= PLAYOFF_N;
}

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

/** ESPN 3rd-place ladder or an untagged Sleeper consolation row on title week. */
export function isThirdPlaceScore(score, finalWeek) {
  if (!score || score.phase !== "playoff") return false;
  if (score.hunt === true) return false;
  const week = Number(score.week) || 0;
  if (finalWeek && week !== Number(finalWeek)) return false;
  const tier = String(score.playoff_tier || "").toUpperCase();
  if (tier === "LOSERS_CONSOLATION_LADDER") return false;
  if (tier === "WINNERS_CONSOLATION_LADDER") return true;
  if (!tier || tier === "NONE" || tier === "NULL") return score.hunt === false;
  return false;
}

function pointsOnThirdPlaceWeek(semis, scores, season, finalWeek) {
  const year = String(season || "");
  const want = new Set((semis || []).map((r) => String(r.user_id || "")));
  const pts = {};
  for (const score of scores || []) {
    if (!score || String(score.season || "") !== year) continue;
    const uid = String(score.user_id || "");
    if (!uid || !want.has(uid) || !isThirdPlaceScore(score, finalWeek)) continue;
    const n = Number(score.points);
    if (!Number.isFinite(n)) continue;
    pts[uid] = Math.max(pts[uid] || 0, n);
  }
  return pts;
}

/**
 * Semifinal losers in 3rd / 4th order from the 3rd-place game. Null when that
 * game is not on the tape (caller then honors official incoming place, then RS).
 */
export function thirdPlaceGameOrder(semis, scores, season, finalWeek) {
  const list = (semis || []).filter(Boolean);
  if (list.length < 2) return null;
  const pts = pointsOnThirdPlaceWeek(list, scores, season, finalWeek);
  const scored = list.filter((r) => pts[String(r.user_id || "")] != null);
  if (scored.length < 2) return null;
  const ranked = scored.slice().sort((a, b) => {
    const pa = pts[String(a.user_id || "")] || 0;
    const pb = pts[String(b.user_id || "")] || 0;
    if (pb !== pa) return pb - pa;
    return regularSeasonCompare(a, b);
  });
  const used = new Set(ranked.map((r) => r));
  return ranked.concat(list.filter((r) => !used.has(r)));
}

function officialPlaceOrder(rows) {
  const list = (rows || []).filter(Boolean);
  if (list.length < 2) return null;
  const places = list.map((r) => Number(r.place)).filter((n) => Number.isFinite(n) && n >= 1);
  if (places.length !== list.length || new Set(places).size !== places.length) return null;
  return list.slice().sort((a, b) => Number(a.place) - Number(b.place));
}

function orderSemis(semis, buckets, scores, season, finalWeek) {
  return thirdPlaceGameOrder(semis, scores, season, finalWeek)
    || officialPlaceOrder(semis)
    || sortRs(semis, buckets);
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
  return { champ, runnerUp, semis, firstOut, missed, playoff, finalWeek, semiWeek };
}

export function stampRsPlaces(rows, buckets) {
  const list = (rows || []).filter(Boolean);
  const order = sortRs(list, buckets);
  const by = {};
  order.forEach((r, i) => {
    const key = String(r.user_id || "") || ("r" + r.roster_id);
    by[key] = i + 1;
  });
  return list.map((r) => {
    const key = String(r.user_id || "") || ("r" + r.roster_id);
    const bucket = buckets && r.user_id != null ? buckets[r.user_id] : null;
    let rsFpts = null;
    if (bucket) rsFpts = Math.round(Number(bucket.rs || 0) * 100) / 100;
    else if (Number.isFinite(Number(r.rs_fpts))) rsFpts = Number(r.rs_fpts);
    else if (Number.isFinite(Number(r.fpts))) rsFpts = Number(r.fpts);
    return { ...r, rs_place: by[key] || r.rs_place || null, rs_fpts: rsFpts };
  });
}

export function applyCountableFpts(rows, buckets) {
  return (rows || []).map((row) => {
    const fpts = countableFpts(buckets && buckets[row.user_id]);
    if (fpts == null) return row;
    return { ...row, fpts, fpts_from: "regular+hunt" };
  });
}

export function decorateRedraftRows(rows, buckets) {
  return applyCountableFpts(stampRsPlaces(rows, buckets), buckets);
}

/**
 * Rewrite one season's standing rows: 3rd-place game for 3–4, RS for 5–N,
 * title-hunt points only. `champUserId` is the real champion.
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
    orderSemis(g.semis, buckets, scores, season, g.finalWeek)
      .forEach((r) => ordered.push({ ...r, from: "semi" }));
    sortRs(g.firstOut, buckets).forEach((r) => ordered.push({ ...r, from: "first_round" }));
    sortRs(g.missed, buckets).forEach((r) => ordered.push({ ...r, from: "regular" }));
  } else {
    const official = officialPlaceOrder(list);
    if (official) {
      ordered = official.map((r) => {
        const place = Number(r.place);
        let from = r.from || "regular";
        if (place <= 2) from = "title";
        else if (place <= 4) from = r.from || "semi";
        else if (place <= PLAYOFF_N) from = r.from || "first_round";
        else from = r.from || "regular";
        return { ...r, from };
      });
    } else {
      const champ = champUserId
        ? list.find((r) => String(r.user_id) === String(champUserId))
        : list.find((r) => Number(r.place) === 1);
      const rest = list.filter((r) => r !== champ);
      ordered = [];
      if (champ) ordered.push({ ...champ, from: champ.from || "title" });
      sortRs(rest, buckets).forEach((r) => ordered.push({ ...r, from: "regular" }));
    }
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
  return decorateRedraftRows(unique, buckets);
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
