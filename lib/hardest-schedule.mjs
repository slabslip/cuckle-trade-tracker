/**
 * Hardest Remaining Schedule — rank every seat by rest-of-regular-season SoS.
 *
 * Uses the same sos / remaining slate as Expected finish so the tile updates
 * automatically each week when projected-finish rebuilds.
 */

export const HARDEST_SCHEDULE_BOOK_V = 1;

/** Cupcake (easiest) → Hellscape (hardest). Index 0 = easiest among N. */
export const HRS_SOS_LABELS = [
  "Cupcake",
  "Soft",
  "Manageable",
  "Mid lane",
  "Spicy",
  "Brutal",
  "Gauntlet",
  "Hellscape",
];

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(n) {
  const v = num(n);
  return v == null ? null : Math.round(v * 1000) / 1000;
}

function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export function sosLabelForRank(rank, n) {
  const N = Math.max(1, Number(n) || 1);
  const r = Math.max(1, Number(rank) || 1);
  // rank 1 = hardest → Hellscape; rank N = easiest → Cupcake
  const t = (r - 1) / Math.max(1, N - 1);
  const idx = Math.round((1 - t) * (HRS_SOS_LABELS.length - 1));
  return HRS_SOS_LABELS[Math.min(HRS_SOS_LABELS.length - 1, Math.max(0, idx))];
}

function byRoster(seats) {
  const out = new Map();
  for (const s of seats || []) {
    if (!s || s.roster_id == null) continue;
    out.set(Number(s.roster_id), s);
    out.set(String(s.roster_id), s);
  }
  return out;
}

/**
 * Enrich one remaining opponent row with opp seat context.
 */
export function enrichOpponent(rem, oppSeat) {
  const week = num(rem && rem.week);
  const oppRid = num(rem && rem.opp_roster_id);
  const pWin = money(rem && rem.p_win);
  const opp = oppSeat || null;
  return {
    week,
    opp_roster_id: oppRid,
    opp: cleanName((rem && rem.opp) || (opp && opp.name) || "—"),
    opp_user_id: opp && opp.user_id != null ? String(opp.user_id) : null,
    opp_record: opp && opp.record ? String(opp.record) : null,
    opp_pf: opp && opp.pf != null ? money(opp.pf) : null,
    opp_pa: opp && opp.pa != null ? money(opp.pa) : null,
    opp_place_now: opp ? num(opp.place_now) : null,
    opp_proj_finish: opp ? num(opp.proj_finish) : null,
    opp_sos: opp ? money(opp.sos) : null,
    p_win: pWin,
    // Higher = tougher game for the subject seat.
    difficulty: pWin == null ? null : money(1 - pWin),
  };
}

export function buildThesis(seat, opponents) {
  const name = cleanName(seat && seat.name) || "Seat";
  const ops = (opponents || []).slice().sort((a, b) => {
    const da = Number(a.difficulty);
    const db = Number(b.difficulty);
    if (Number.isFinite(db) && Number.isFinite(da) && db !== da) return db - da;
    return (Number(a.week) || 0) - (Number(b.week) || 0);
  });
  const tough = ops.slice(0, 2).map((o) => o.opp).filter(Boolean);
  const n = ops.length;
  if (!n) return `${name} — no remaining regular-season games on the book.`;
  const bits = [`${n} game${n === 1 ? "" : "s"} left`];
  if (tough.length) bits.push(`toughest draws ${tough.join(" · ")}`);
  if (seat && seat.expected_remaining_wins != null) {
    bits.push(`~${seat.expected_remaining_wins} expected wins`);
  }
  return bits.join(" · ");
}

/**
 * Build ranked hardest-schedule rows from a projected-finish book.
 */
export function seatsFromProjectedFinish(projBook) {
  const seats = (projBook && Array.isArray(projBook.seats)) ? projBook.seats : [];
  const rosterMap = byRoster(seats);
  const rows = seats.map((s) => {
    const opponents = (s.remaining || []).map((rem) => {
      const opp = rosterMap.get(Number(rem.opp_roster_id))
        || rosterMap.get(String(rem.opp_roster_id));
      return enrichOpponent(rem, opp);
    }).sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0));
    return {
      user_id: s.user_id != null ? String(s.user_id) : "",
      name: cleanName(s.name) || String(s.user_id || "—"),
      roster_id: num(s.roster_id),
      sos: money(s.sos),
      sos_ease: money(s.sos_ease),
      record: s.record != null ? String(s.record) : null,
      place_now: num(s.place_now),
      proj_finish: num(s.proj_finish),
      pf: money(s.pf),
      pa: money(s.pa),
      expected_remaining_wins: money(s.expected_remaining_wins),
      opponents,
      thesis: "",
    };
  });

  rows.sort((a, b) => {
    const ds = (Number(b.sos) || 0) - (Number(a.sos) || 0);
    if (ds) return ds;
    const de = (Number(a.expected_remaining_wins) || 0) - (Number(b.expected_remaining_wins) || 0);
    if (de) return de;
    return String(a.name).localeCompare(String(b.name));
  });

  const n = rows.length;
  rows.forEach((row, i) => {
    row.rank = i + 1;
    row.key = String(row.user_id || row.roster_id || i);
    row.sos_lab = sosLabelForRank(row.rank, n);
    row.thesis = buildThesis(row, row.opponents);
  });
  return rows;
}

/**
 * @param {object} opts
 * @param {object} opts.projectedFinish — ui/projected-finish.json
 * @param {string} [opts.leagueId]
 * @param {string} [opts.asOf]
 */
export function buildHardestScheduleBook(opts = {}) {
  const proj = opts.projectedFinish || {};
  const seats = seatsFromProjectedFinish(proj);
  const remWeeks = Array.isArray(proj.remaining_weeks)
    ? proj.remaining_weeks.map((w) => Number(w)).filter((w) => Number.isFinite(w))
    : [];
  return {
    v: HARDEST_SCHEDULE_BOOK_V,
    as_of: opts.asOf || proj.as_of || new Date().toISOString().slice(0, 10),
    league_id: String(opts.leagueId || proj.league_id || ""),
    season: proj.season != null ? Number(proj.season) || proj.season : null,
    week: proj.week != null ? Number(proj.week) : null,
    playoff_week_start: proj.playoff_week_start != null
      ? Number(proj.playoff_week_start) : null,
    remaining_weeks: remWeeks,
    remaining_week_count: remWeeks.length || Number(proj.remaining_week_count) || 0,
    remaining_games: Number(proj.remaining_games) || null,
    n: seats.length,
    rule: {
      metric: "Mean remaining-opponent adjusted pythagorean (same SoS as Expected finish). Higher = harder.",
      list: "Every seat ranked hardest → easiest rest-of-regular-season schedule.",
      scope: "Weeks after the banked week through playoff_week_start − 1. Rebuilds with Expected finish each week.",
      labels: "Hellscape = hardest SoS · Cupcake = easiest.",
    },
    seats,
  };
}
