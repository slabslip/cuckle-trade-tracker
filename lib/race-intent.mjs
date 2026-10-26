/**
 * Season race intent — how hard a seat is trying to win remaining games.
 * Distinct from seat-direction (bag rebuild / win-now for trades).
 *
 * tank         → resting starters / hunting Early; damp remaining strength
 * win_now      → full send for title
 * playoff_hunt → fighting for top-6
 * contend      → default / unspecified
 */

export const RACE_INTENTS = ["tank", "win_now", "playoff_hunt", "contend"];

/** Multiplier on adj_pyth / MC scoring mu deviation for remaining games. */
export const INTENT_EFFORT = {
  tank: 0.62,
  win_now: 1.08,
  playoff_hunt: 1.04,
  contend: 1.0,
};

/**
 * How much of form/trend blend credit a tanking seat still gets.
 * Hot form while tanking must not mint Late capital.
 */
export const INTENT_FORM_TREND_SCALE = {
  tank: 0.35,
  win_now: 1.05,
  playoff_hunt: 1.0,
  contend: 1.0,
};

export function canonIntent(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "tank" || s === "tanking" || s === "hard_tank") return "tank";
  if (s === "win_now" || s === "winnow" || s === "title" || s === "contend_title") return "win_now";
  if (s === "playoff_hunt" || s === "playoffs" || s === "hunt" || s === "bubble") return "playoff_hunt";
  if (s === "contend" || s === "default" || s === "") return "contend";
  return "contend";
}

export function effortForIntent(intent) {
  const i = canonIntent(intent);
  return INTENT_EFFORT[i] != null ? INTENT_EFFORT[i] : 1;
}

export function formTrendScaleForIntent(intent) {
  const i = canonIntent(intent);
  return INTENT_FORM_TREND_SCALE[i] != null ? INTENT_FORM_TREND_SCALE[i] : 1;
}

/**
 * Resolve intent for a user/roster from a race-intent book.
 * @param {object} book — { season, by_name?, by_user_id? }
 * @param {{ user_id?: string, name?: string }} seat
 */
export function intentForSeat(book, seat) {
  if (!book) return "contend";
  const uid = seat && seat.user_id != null ? String(seat.user_id) : "";
  const name = seat && seat.name != null ? String(seat.name) : "";
  if (uid && book.by_user_id && book.by_user_id[uid] != null) {
    return canonIntent(book.by_user_id[uid]);
  }
  if (name && book.by_name && book.by_name[name] != null) {
    return canonIntent(book.by_name[name]);
  }
  return "contend";
}

/**
 * Apply effort to a scoring model's mean: pull tankers toward a soft floor
 * (league mean × 0.92) instead of sampling their historical hot weeks as if
 * they are still maximizing.
 */
export function applyEffortToScoreMu(mu, leagueMu, effort) {
  const e = Number(effort);
  if (!Number.isFinite(e) || e === 1) return Number(mu) || 0;
  const m = Number(mu) || 0;
  const prior = (Number(leagueMu) || m) * 0.92;
  if (e < 1) {
    // tank: blend observed mu down toward soft prior
    return prior + e * (m - prior);
  }
  // win_now / hunt: slight lift of the observed mean
  return m + (e - 1) * Math.max(0, m - prior);
}
