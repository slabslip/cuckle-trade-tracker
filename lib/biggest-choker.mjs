/**
 * Biggest Choker book: season rows where a seat looked locked for playoffs
 * and missed, or lost the championship as the favorite.
 *
 * Ranked by choke score; top 10 overall. Each year's biggest is flagged.
 */

export const CHOKE_BOOK_V = 1;
export const CHOKE_TOP_N = 10;
export const DEFAULT_PLAYOFF_TEAMS = 6;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function wlLine(wins, losses, ties) {
  const w = num(wins);
  const l = num(losses);
  if (w == null || l == null) return null;
  const t = num(ties) || 0;
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function fptsRanks(rows) {
  const sorted = (rows || [])
    .filter((r) => r && r.user_id != null && Number.isFinite(Number(r.fpts)))
    .slice()
    .sort((a, b) => Number(b.fpts) - Number(a.fpts)
      || String(a.user_id).localeCompare(String(b.user_id)));
  const out = new Map();
  sorted.forEach((r, i) => out.set(String(r.user_id), i + 1));
  return out;
}

function standingsBySeason(standings) {
  const by = new Map();
  for (const block of standings || []) {
    const season = String(block && block.season || "");
    if (!season) continue;
    const rows = block.rows || [];
    by.set(season, {
      rows,
      byUser: new Map(rows.map((r) => [String(r.user_id), r])),
      ranks: fptsRanks(rows),
    });
  }
  return by;
}

/**
 * Playoff-miss choke: mid-season PF rank inside the cut, final place outside.
 * Late (still inside at W8) scores harder than an early fade that never recovered.
 */
export function scorePlayoffMiss(seat, playoffTeams) {
  const cut = Math.max(2, Number(playoffTeams) || DEFAULT_PLAYOFF_TEAMS);
  const w4 = num(seat && seat.place_w4);
  const w8 = num(seat && seat.place_w8);
  const fin = num(seat && seat.place_final);
  if (fin == null || fin <= cut) return null;
  const early = w8 != null ? w8 : w4;
  const inAtW8 = w8 != null && w8 <= cut;
  const inAtW4 = w4 != null && w4 <= cut;
  const strongEarly = w4 != null && w4 <= Math.ceil(cut * 2 / 3);
  if (!(inAtW8 || (inAtW4 && early != null && early <= cut) || strongEarly)) {
    return null;
  }
  if (early == null || early > cut) {
    // Strong early start that was already out by W8 still counts as a fade-miss.
    if (!strongEarly || w4 == null) return null;
  }
  const lockPlace = inAtW8 ? w8 : (w4 != null && w4 <= cut ? w4 : early);
  if (lockPlace == null || lockPlace > cut) return null;

  let score = (cut + 1 - lockPlace) * 10;
  score += (fin - cut) * 5;
  if (inAtW8) score += 15;
  if (inAtW4 && inAtW8) score += 8;
  if (strongEarly && fin > cut) score += 5;
  const delta = num(seat && seat.delta_early_final);
  if (delta != null && delta < 0) score += (-delta) * 3;

  const when = inAtW8 ? "W8" : "W4";
  const thesis = `${when} #${lockPlace} → final #${fin}. Looked set for the top ${cut}, missed the cut.`;
  return {
    kind: "playoff_miss",
    score,
    place_w4: w4,
    place_w8: w8,
    place_final: fin,
    lock_week: inAtW8 ? 8 : 4,
    lock_place: lockPlace,
    thesis,
    lab: "Missed playoffs",
  };
}

/**
 * Title choke: championship runner-up who should have won (better record,
 * better PF rank, and/or led the points race).
 */
export function scoreTitleLoss(opts) {
  const title = opts && opts.title;
  const final = title && title.final;
  if (!title || !final || !final.ok || final.opponent_user_id == null) return null;

  const champUid = String(title.user_id || "");
  const oppUid = String(final.opponent_user_id);
  if (!champUid || !oppUid) return null;

  const pack = opts.standPack || null;
  const ranks = (pack && pack.ranks) || new Map();
  const champRow = (pack && pack.byUser && pack.byUser.get(champUid)) || {};
  const oppRow = (pack && pack.byUser && pack.byUser.get(oppUid)) || {};
  const crec = title.record || {};

  const champWins = num(crec.wins) != null ? num(crec.wins) : num(champRow.wins);
  const champLosses = num(crec.losses) != null ? num(crec.losses) : num(champRow.losses);
  const oppWins = num(final.opponent_record && final.opponent_record.wins);
  const oppLosses = num(final.opponent_record && final.opponent_record.losses);
  const champRank = num(crec.fpts_rank) != null ? num(crec.fpts_rank) : ranks.get(champUid);
  const oppRank = ranks.get(oppUid) != null ? ranks.get(oppUid) : null;

  const reasons = [];
  let favored = false;
  if (oppWins != null && champWins != null && oppWins > champWins) {
    favored = true;
    reasons.push(`better regular season (${wlLine(oppWins, oppLosses) || (oppWins + " wins")} vs ${wlLine(champWins, champLosses) || (champWins + " wins")})`);
  }
  if (oppRank != null && champRank != null && oppRank < champRank) {
    favored = true;
    reasons.push(`higher in points (#${oppRank} vs #${champRank})`);
  }
  if (oppRank === 1) {
    favored = true;
    if (!reasons.some((r) => r.includes("points"))) {
      reasons.push("led the points race");
    }
  }
  if (!favored) return null;

  let score = 45;
  if (oppWins != null && champWins != null) score += (oppWins - champWins) * 8;
  if (oppRank === 1) score += 20;
  else if (oppRank != null && champRank != null && oppRank < champRank) score += 12;
  const margin = num(final.margin);
  if (margin != null && margin >= 30) score += 6;

  const champName = title.name || "the champ";
  const thesis = `Lost the championship to ${champName} as the favorite`
    + (reasons.length ? ` — ${reasons.join("; ")}` : ".")
    + (margin != null
      ? `. Final ${num(final.opponent_points) ?? "—"}–${num(final.champ_points) ?? "—"} (lost by ${margin}).`
      : ".");

  return {
    kind: "title_loss",
    score,
    place_final: 2,
    champ_name: champName,
    champ_user_id: champUid,
    champ_record: wlLine(champWins, champLosses),
    record: wlLine(oppWins, oppLosses),
    fpts_rank: oppRank,
    champ_fpts_rank: champRank,
    margin,
    champ_points: num(final.champ_points),
    points: num(final.opponent_points),
    week: num(final.week),
    thesis,
    lab: "Lost the chip",
    reasons,
  };
}

/**
 * Build the Biggest Choker book from season-arcs + titles (+ standings for PF rank).
 */
export function buildBiggestChokerBook(opts) {
  const arcs = opts.arcs || {};
  const titles = (opts.titles && opts.titles.titles) || opts.titlesList || [];
  const standings = opts.standings || [];
  const playoffTeams = Math.max(2, Number(opts.playoffTeams) || DEFAULT_PLAYOFF_TEAMS);
  const topN = Math.max(1, Number(opts.topN) || CHOKE_TOP_N);
  const leagueId = opts.leagueId != null ? String(opts.leagueId) : null;
  const asOf = opts.asOf || new Date().toISOString().slice(0, 10);
  const byStand = standingsBySeason(standings);

  const rows = [];

  for (const seasonBlock of arcs.seasons || []) {
    const season = String(seasonBlock.season || "");
    if (!season) continue;
    for (const seat of seasonBlock.seats || []) {
      const hit = scorePlayoffMiss(seat, playoffTeams);
      if (!hit) continue;
      rows.push({
        key: `${season}:${seat.user_id}:playoff_miss`,
        season,
        user_id: String(seat.user_id || ""),
        name: seat.name || String(seat.user_id || ""),
        ...hit,
      });
    }
  }

  for (const title of titles || []) {
    const season = String(title && title.season || "");
    if (!season) continue;
    const hit = scoreTitleLoss({
      title,
      standPack: byStand.get(season) || null,
    });
    if (!hit) continue;
    const oppUid = String(title.final.opponent_user_id);
    const oppName = title.final.opponent || oppUid;
    rows.push({
      key: `${season}:${oppUid}:title_loss`,
      season,
      user_id: oppUid,
      name: oppName,
      ...hit,
    });
  }

  rows.sort((a, b) => (b.score - a.score)
    || String(b.season).localeCompare(String(a.season))
    || String(a.name).localeCompare(String(b.name)));

  // Biggest choke in each completed year (for the year-first story).
  const yearBest = new Map();
  for (const row of rows) {
    if (!yearBest.has(row.season)) yearBest.set(row.season, row);
  }
  for (const row of rows) {
    row.year_biggest = yearBest.get(row.season) === row;
  }

  // List order: each year's biggest first (by score), then fill to topN.
  const yearLeaders = [...yearBest.values()]
    .sort((a, b) => (b.score - a.score)
      || String(b.season).localeCompare(String(a.season)));
  const picked = [];
  const seen = new Set();
  for (const row of yearLeaders) {
    if (picked.length >= topN) break;
    picked.push(row);
    seen.add(row.key);
  }
  for (const row of rows) {
    if (picked.length >= topN) break;
    if (seen.has(row.key)) continue;
    picked.push(row);
    seen.add(row.key);
  }

  picked.forEach((row, i) => {
    row.rank = i + 1;
  });

  return {
    v: CHOKE_BOOK_V,
    as_of: asOf,
    league_id: leagueId,
    playoff_teams: playoffTeams,
    top_n: topN,
    n: picked.length,
    n_all: rows.length,
    rule: {
      playoff_miss: `Inside top ${playoffTeams} by cumulative PF at W4/W8, finished outside the cut.`,
      title_loss: "Championship runner-up who had the better regular-season record, higher PF rank, and/or led the points race.",
      order: "Biggest choke of each year first (by score), then the next-worst seasons to fill top 10.",
    },
    seats: picked,
    year_biggest: yearLeaders.map((r) => ({
      season: r.season,
      name: r.name,
      user_id: r.user_id,
      kind: r.kind,
      score: r.score,
    })),
  };
}
