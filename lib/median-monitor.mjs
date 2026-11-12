/**
 * Median Monitor — Sleeper “Extra Game Each Week Against League Median”.
 *
 * Each regular-season week: H2H result + vs-median result.
 * Above median = W, below = L, exact = T.
 * Even-N median = average of the two middle scores (Sleeper support rule).
 * Regular season only — playoff / consolation weeks are out.
 */

export const MEDIAN_MONITOR_BOOK_V = 1;

function money(n) {
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function fmtRecord(w, l, t) {
  const ww = Number(w) || 0;
  const ll = Number(l) || 0;
  const tt = Number(t) || 0;
  return tt > 0 ? `${ww}-${ll}-${tt}` : `${ww}-${ll}`;
}

/** Standing points: win = 2, tie = 1 (same as Sleeper H2H boards). */
export function standingPts(w, l, t) {
  return (Number(w) || 0) * 2 + (Number(t) || 0);
}

/**
 * Sleeper league-median for one week.
 * Even N → average of the two middle scores (sorted ascending).
 * Odd N → middle score.
 */
export function leagueMedianFromScores(points) {
  const vals = (points || [])
    .map((p) => money(p))
    .filter((p) => p != null)
    .sort((a, b) => a - b);
  const n = vals.length;
  if (n < 2) return null;
  if (n % 2 === 1) return vals[(n - 1) / 2];
  const lo = vals[n / 2 - 1];
  const hi = vals[n / 2];
  return money((lo + hi) / 2);
}

export function medianResult(points, median) {
  const p = money(points);
  const m = money(median);
  if (p == null || m == null) return null;
  if (p > m) return "W";
  if (p < m) return "L";
  return "T";
}

/**
 * Pair Sleeper matchup rows → per-roster H2H result for one week.
 * @returns {Map<number, {result, opp_roster_id, opp_points, points}>}
 */
export function h2hByRosterFromMatchups(rows) {
  const byM = new Map();
  for (const row of rows || []) {
    if (!row || row.matchup_id == null) continue;
    if (!byM.has(row.matchup_id)) byM.set(row.matchup_id, []);
    byM.get(row.matchup_id).push(row);
  }
  const out = new Map();
  for (const group of byM.values()) {
    if (!group || group.length < 2) continue;
    const a = group[0];
    const b = group[1];
    const ap = money(a.points);
    const bp = money(b.points);
    if (ap == null || bp == null) continue;
    if (ap === 0 && bp === 0) continue;
    const ra = num(a.roster_id);
    const rb = num(b.roster_id);
    if (ra == null || rb == null) continue;
    let aRes = "T";
    let bRes = "T";
    if (ap > bp) { aRes = "W"; bRes = "L"; }
    else if (bp > ap) { aRes = "L"; bRes = "W"; }
    out.set(ra, { result: aRes, opp_roster_id: rb, points: ap, opp_points: bp });
    out.set(rb, { result: bRes, opp_roster_id: ra, points: bp, opp_points: ap });
  }
  return out;
}

function blankTally() {
  return { w: 0, l: 0, t: 0 };
}

function addResult(tally, res) {
  if (res === "W") tally.w += 1;
  else if (res === "L") tally.l += 1;
  else if (res === "T") tally.t += 1;
}

/**
 * Build Median Monitor book for one season.
 *
 * @param {object} opts
 * @param {object} opts.weeklyScores — raw/weekly_scores.json
 * @param {Map|object} opts.matchupsByWeek — week → Sleeper matchup rows
 * @param {Map} [opts.nameByUser]
 * @param {Map} [opts.rosterToUser]
 * @param {string|number} [opts.season]
 * @param {number} [opts.playoffWeekStart]
 * @param {string} [opts.leagueId]
 * @param {string} [opts.asOf]
 */
export function buildMedianMonitorBook(opts = {}) {
  const weekly = opts.weeklyScores || {};
  const nameByUser = opts.nameByUser || new Map();
  const rosterToUser = opts.rosterToUser || new Map();
  const matchupsByWeek = opts.matchupsByWeek instanceof Map
    ? opts.matchupsByWeek
    : new Map(Object.entries(opts.matchupsByWeek || {}).map(([k, v]) => [Number(k), v]));

  let season = opts.season != null ? String(opts.season) : null;
  let playoffStart = num(opts.playoffWeekStart);
  let leagueId = opts.leagueId != null ? String(opts.leagueId) : "";

  for (const block of weekly.seasons || []) {
    if (!block) continue;
    if (season && String(block.season) !== season) continue;
    if (!season) season = String(block.season);
    if (playoffStart == null && block.playoff_week_start != null) {
      playoffStart = Number(block.playoff_week_start) || null;
    }
    if (!leagueId && block.league_id) leagueId = String(block.league_id);
  }
  if (!season) season = String(new Date().getFullYear());
  if (playoffStart == null) playoffStart = 15;

  const scores = (weekly.scores || []).filter((s) => {
    if (!s || String(s.season) !== season) return false;
    const week = num(s.week);
    if (week == null || week < 1 || week >= playoffStart) return false;
    if (s.phase && s.phase !== "regular") return false;
    return money(s.points) != null;
  });

  const weeks = [...new Set(scores.map((s) => num(s.week)).filter((w) => w != null))]
    .sort((a, b) => a - b);

  const byUser = new Map();

  function seatFor(uid, rosterId) {
    const key = String(uid || "");
    if (!key) return null;
    if (!byUser.has(key)) {
      byUser.set(key, {
        user_id: key,
        name: cleanName(nameByUser.get(key) || key),
        roster_id: num(rosterId),
        h2h: blankTally(),
        median: blankTally(),
        combined: blankTally(),
        pf: 0,
        weeks: [],
      });
    }
    const seat = byUser.get(key);
    if (seat.roster_id == null && rosterId != null) seat.roster_id = num(rosterId);
    if ((!seat.name || seat.name === key) && nameByUser.has(key)) {
      seat.name = cleanName(nameByUser.get(key));
    }
    return seat;
  }

  const weekMeta = [];

  for (const week of weeks) {
    const weekScores = scores.filter((s) => num(s.week) === week);
    const pts = weekScores.map((s) => s.points);
    const median = leagueMedianFromScores(pts);
    if (median == null) continue;

    const h2hMap = h2hByRosterFromMatchups(matchupsByWeek.get(week) || []);
    let above = 0;
    let below = 0;
    let ties = 0;

    for (const row of weekScores) {
      const rid = num(row.roster_id);
      const uid = String(
        row.user_id
        || rosterToUser.get(rid)
        || rosterToUser.get(String(rid))
        || "",
      );
      const seat = seatFor(uid, rid);
      if (!seat) continue;
      const points = money(row.points);
      const mRes = medianResult(points, median);
      if (mRes === "W") above += 1;
      else if (mRes === "L") below += 1;
      else if (mRes === "T") ties += 1;

      const h2h = h2hMap.get(rid) || h2hMap.get(Number(rid));
      const hRes = h2h ? h2h.result : null;
      const oppRid = h2h ? h2h.opp_roster_id : null;
      const oppUid = oppRid != null
        ? String(rosterToUser.get(oppRid) || rosterToUser.get(String(oppRid)) || "")
        : "";
      const oppName = oppUid
        ? cleanName(nameByUser.get(oppUid) || oppUid)
        : (oppRid != null ? `Roster ${oppRid}` : "—");

      if (mRes) addResult(seat.median, mRes);
      if (hRes) addResult(seat.h2h, hRes);
      if (hRes) addResult(seat.combined, hRes);
      if (mRes) addResult(seat.combined, mRes);
      if (points != null) seat.pf = money(seat.pf + points);

      seat.weeks.push({
        week,
        points,
        median,
        vs_median: points != null ? money(points - median) : null,
        median_result: mRes,
        h2h_result: hRes,
        opp: oppName,
        opp_roster_id: oppRid,
        opp_points: h2h ? h2h.opp_points : null,
      });
    }

    weekMeta.push({
      week,
      median,
      n: weekScores.length,
      above,
      below,
      ties,
    });
  }

  const seats = [...byUser.values()];
  for (const s of seats) {
    s.h2h_record = fmtRecord(s.h2h.w, s.h2h.l, s.h2h.t);
    s.median_record = fmtRecord(s.median.w, s.median.l, s.median.t);
    s.combined_record = fmtRecord(s.combined.w, s.combined.l, s.combined.t);
    s.h2h_pts = standingPts(s.h2h.w, s.h2h.l, s.h2h.t);
    s.combined_pts = standingPts(s.combined.w, s.combined.l, s.combined.t);
    s.median_wins = s.median.w;
    s.weeks.sort((a, b) => (a.week || 0) - (b.week || 0));
  }

  const placeH2h = new Map();
  {
    const sorted = seats.slice().sort((a, b) => {
      const pa = standingPts(a.h2h.w, a.h2h.l, a.h2h.t);
      const pb = standingPts(b.h2h.w, b.h2h.l, b.h2h.t);
      if (pb !== pa) return pb - pa;
      const pfa = Number(a.pf) || 0;
      const pfb = Number(b.pf) || 0;
      if (pfb !== pfa) return pfb - pfa;
      return String(a.name).localeCompare(String(b.name));
    });
    sorted.forEach((s, i) => placeH2h.set(s.user_id, i + 1));
  }

  seats.sort((a, b) => {
    const pa = standingPts(a.combined.w, a.combined.l, a.combined.t);
    const pb = standingPts(b.combined.w, b.combined.l, b.combined.t);
    if (pb !== pa) return pb - pa;
    const pfa = Number(a.pf) || 0;
    const pfb = Number(b.pf) || 0;
    if (pfb !== pfa) return pfb - pfa;
    return String(a.name).localeCompare(String(b.name));
  });

  seats.forEach((s, i) => {
    s.rank = i + 1;
    s.place_combined = i + 1;
    s.place_h2h = placeH2h.get(s.user_id) || null;
    s.place_delta = (s.place_h2h != null) ? (s.place_h2h - s.place_combined) : null;
    s.key = String(s.user_id || s.roster_id || i);
    const deltaLab = s.place_delta == null ? ""
      : (s.place_delta > 0 ? `↑${s.place_delta}` : (s.place_delta < 0 ? `↓${Math.abs(s.place_delta)}` : "—"));
    s.thesis = [
      `H2H ${s.h2h_record}`,
      `vs median ${s.median_record}`,
      `combined ${s.combined_record}`,
      s.place_h2h != null
        ? `H2H #${s.place_h2h} → median board #${s.place_combined}${deltaLab ? ` (${deltaLab})` : ""}`
        : `median board #${s.place_combined}`,
    ].join(" · ");
    s.delta_lab = deltaLab || "—";
  });

  return {
    v: MEDIAN_MONITOR_BOOK_V,
    as_of: opts.asOf || new Date().toISOString().slice(0, 10),
    league_id: leagueId,
    season: Number(season) || season,
    playoff_week_start: playoffStart,
    weeks,
    week_count: weeks.length,
    n: seats.length,
    rule: {
      source: "Sleeper Extra Game Each Week Against League Median",
      median: "Even league size: average of the two middle weekly scores. Above = W, below = L, exact = T.",
      scope: "Regular season only (weeks 1 … playoff_week_start − 1). Playoffs excluded.",
      board: "Combined = H2H + vs-median each week. Ranked by standing points (W=2, T=1), then PF.",
    },
    week_medians: weekMeta,
    seats,
  };
}
