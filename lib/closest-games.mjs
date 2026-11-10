/**
 * Closest Games — top nailbiters of all time (smallest point margin).
 *
 * Games come from paired Sleeper matchups. Each row carries year impact for
 * both seats (final place, playoff, arc) so the door can expand in place.
 */

export const CLOSEST_GAMES_BOOK_V = 1;
export const CLOSEST_GAMES_TOP_N = 10;

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

/** Pair Sleeper matchup rows → one game object per matchup_id. */
export function gamesFromMatchupRows(rows, opts = {}) {
  const season = String(opts.season || "");
  const week = num(opts.week);
  const phase = opts.phase === "playoff" ? "playoff" : "regular";
  const rosterToUser = opts.rosterToUser || new Map();
  const nameByUser = opts.nameByUser || new Map();
  const byM = new Map();
  for (const row of rows || []) {
    if (!row || row.matchup_id == null) continue;
    if (!byM.has(row.matchup_id)) byM.set(row.matchup_id, []);
    byM.get(row.matchup_id).push(row);
  }
  const out = [];
  for (const [mid, group] of byM) {
    if (!group || group.length < 2) continue;
    const a = group[0];
    const b = group[1];
    const ap = money(a.points);
    const bp = money(b.points);
    if (ap == null || bp == null) continue;
    // Skip empty/unused slots (0–0 byes or unplayed).
    if (ap === 0 && bp === 0) continue;
    const ra = num(a.roster_id);
    const rb = num(b.roster_id);
    if (ra == null || rb == null) continue;
    const aUid = String(
      rosterToUser.get(ra)
      || rosterToUser.get(String(ra))
      || a.owner_id
      || "",
    );
    const bUid = String(
      rosterToUser.get(rb)
      || rosterToUser.get(String(rb))
      || b.owner_id
      || "",
    );
    if (!aUid || !bUid || aUid === bUid) continue;
    const margin = money(Math.abs(ap - bp));
    if (margin == null) continue;
    let aRes = "T";
    let bRes = "T";
    if (ap > bp) { aRes = "W"; bRes = "L"; }
    else if (bp > ap) { aRes = "L"; bRes = "W"; }
    const aName = cleanName(nameByUser.get(aUid) || aUid);
    const bName = cleanName(nameByUser.get(bUid) || bUid);
    const lo = aUid < bUid ? aUid : bUid;
    const hi = aUid < bUid ? bUid : aUid;
    out.push({
      key: `${season}-w${week}-${lo}-${hi}`,
      matchup_id: mid,
      season,
      week,
      phase,
      margin,
      a: {
        user_id: aUid,
        name: aName,
        roster_id: ra,
        points: ap,
        result: aRes,
      },
      b: {
        user_id: bUid,
        name: bName,
        roster_id: rb,
        points: bp,
        result: bRes,
      },
    });
  }
  return out;
}

function arcSeat(arcsBySeason, season, userId) {
  const block = arcsBySeason && arcsBySeason.get(String(season));
  if (!block) return null;
  return (block.byUser && block.byUser.get(String(userId))) || null;
}

function standSeat(standingsBySeason, season, userId) {
  const block = standingsBySeason && standingsBySeason.get(String(season));
  if (!block) return null;
  return (block.byUser && block.byUser.get(String(userId))) || null;
}

function wlLine(wins, losses, ties) {
  const w = num(wins);
  const l = num(losses);
  if (w == null || l == null) return null;
  const t = num(ties) || 0;
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function arcLab(arc) {
  if (arc === "slow_burn") return "slow burn (climbed)";
  if (arc === "fast_fade") return "fast fade";
  if (arc === "spike") return "spike season";
  if (arc === "steady") return "steady";
  return arc ? String(arc) : "";
}

/**
 * How this one game sat inside that manager's year.
 */
export function yearImpactForSeat(gameSide, game, arcsBySeason, standingsBySeason) {
  if (!gameSide || !game) return null;
  const uid = String(gameSide.user_id || "");
  const season = String(game.season || "");
  const arc = arcSeat(arcsBySeason, season, uid);
  const stand = standSeat(standingsBySeason, season, uid);
  const placeFinal = arc && arc.place_final != null
    ? num(arc.place_final)
    : (stand ? num(stand.place) : null);
  const placeW4 = arc ? num(arc.place_w4) : null;
  const placeW8 = arc ? num(arc.place_w8) : null;
  const madePlayoffs = arc ? !!arc.made_playoffs : null;
  const arcKind = arc && arc.arc ? String(arc.arc) : "";
  const record = stand
    ? wlLine(stand.wins, stand.losses, stand.ties)
    : null;
  const fpts = stand && stand.fpts != null ? money(stand.fpts) : null;
  const result = gameSide.result || "T";
  const verb = result === "W" ? "Won" : (result === "L" ? "Lost" : "Tied");
  const bits = [];
  bits.push(`${verb} ${gameSide.points}–${
    gameSide.user_id === game.a.user_id ? game.b.points : game.a.points
  } in W${game.week}${game.phase === "playoff" ? " (playoff)" : ""}`);
  if (placeFinal != null) bits.push(`finished #${placeFinal}`);
  if (madePlayoffs === true) bits.push("made playoffs");
  if (madePlayoffs === false) bits.push("missed playoffs");
  if (record) bits.push(`year ${record}`);
  if (placeW4 != null || placeW8 != null) {
    bits.push(`PF path W4 #${placeW4 != null ? placeW4 : "—"} → W8 #${
      placeW8 != null ? placeW8 : "—"
    } → final #${placeFinal != null ? placeFinal : "—"}`);
  }
  const arcText = arcLab(arcKind);
  if (arcText) bits.push(arcText);
  return {
    user_id: uid,
    name: gameSide.name,
    result,
    points: gameSide.points,
    place_final: placeFinal,
    place_w4: placeW4,
    place_w8: placeW8,
    made_playoffs: madePlayoffs,
    arc: arcKind || null,
    record,
    fpts,
    thesis: bits.join(" · "),
  };
}

export function indexArcsBySeason(arcsBook) {
  const out = new Map();
  for (const block of (arcsBook && arcsBook.seasons) || []) {
    const season = String(block && block.season || "");
    if (!season) continue;
    const byUser = new Map();
    for (const seat of block.seats || []) {
      if (!seat || seat.user_id == null) continue;
      byUser.set(String(seat.user_id), seat);
    }
    out.set(season, { ...block, byUser });
  }
  return out;
}

export function indexStandingsBySeason(standings) {
  const out = new Map();
  for (const block of standings || []) {
    const season = String(block && block.season || "");
    if (!season) continue;
    const byUser = new Map();
    for (const row of block.rows || []) {
      if (!row || row.user_id == null) continue;
      byUser.set(String(row.user_id), row);
    }
    out.set(season, { ...block, byUser });
  }
  return out;
}

export function attachYearImpacts(games, arcsBySeason, standingsBySeason) {
  return (games || []).map((g) => ({
    ...g,
    years: [
      yearImpactForSeat(g.a, g, arcsBySeason, standingsBySeason),
      yearImpactForSeat(g.b, g, arcsBySeason, standingsBySeason),
    ].filter(Boolean),
  }));
}

/** Rank by smallest margin; stable ties by season/week/names. */
export function rankClosestGames(games, topN = CLOSEST_GAMES_TOP_N) {
  const cap = Math.max(1, Number(topN) || CLOSEST_GAMES_TOP_N);
  const sorted = (games || []).slice().sort((a, b) => {
    const dm = (Number(a.margin) || 0) - (Number(b.margin) || 0);
    if (dm) return dm;
    const ds = String(b.season || "").localeCompare(String(a.season || ""));
    if (ds) return ds;
    const dw = (Number(b.week) || 0) - (Number(a.week) || 0);
    if (dw) return dw;
    return String(a.key || "").localeCompare(String(b.key || ""));
  });
  return sorted.slice(0, cap).map((g, i) => ({
    ...g,
    rank: i + 1,
  }));
}

/**
 * Build the Closest Games UI book.
 * @param {object} opts
 * @param {Array<object>} opts.games — already paired games (with or without years)
 * @param {object} [opts.arcsBook]
 * @param {Array} [opts.standings]
 * @param {string} [opts.leagueId]
 * @param {string} [opts.asOf]
 * @param {number} [opts.topN]
 * @param {number} [opts.nScanned] — total games considered before top-N cut
 */
export function buildClosestGamesBook(opts = {}) {
  const arcsBySeason = indexArcsBySeason(opts.arcsBook);
  const standingsBySeason = indexStandingsBySeason(opts.standings);
  const withYears = attachYearImpacts(opts.games || [], arcsBySeason, standingsBySeason);
  const top = rankClosestGames(withYears, opts.topN);
  const nScanned = opts.nScanned != null ? Number(opts.nScanned) : withYears.length;
  return {
    v: CLOSEST_GAMES_BOOK_V,
    as_of: opts.asOf || new Date().toISOString().slice(0, 10),
    league_id: String(opts.leagueId || ""),
    top_n: CLOSEST_GAMES_TOP_N,
    n_games: nScanned,
    rule: {
      metric: "Smallest absolute point margin between paired Sleeper matchups (all seasons on the book).",
      list: `Top ${CLOSEST_GAMES_TOP_N} closest games of all time.`,
      year: "Tap a game for each seat’s year: result that week, final place, playoff, PF path (W4→W8→final), and arc.",
      phase: "Regular season and playoff title-hunt weeks both count.",
    },
    games: top,
  };
}
