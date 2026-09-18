/**
 * Fill ESPN (and any other thin) title rows from completed standings.
 * Does not invent championships. Only ranks, prior place, and consecutive chips
 * that are already on the book.
 */

function nth(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const s = ["th", "st", "nd", "rd"];
  const m = v % 100;
  return v + (s[(m - 20) % 10] || s[m] || s[0]);
}

export function fptsRankInSeason(rows, userId) {
  const uid = userId == null ? "" : String(userId);
  if (!uid) return null;
  const sorted = (rows || [])
    .filter((r) => r && Number.isFinite(Number(r.fpts)))
    .slice()
    .sort((a, b) => Number(b.fpts) - Number(a.fpts) || String(a.user_id).localeCompare(String(b.user_id)));
  const i = sorted.findIndex((r) => String(r.user_id) === uid);
  return i >= 0 ? i + 1 : null;
}

function espnThesis(t) {
  const bits = [];
  const rank = t.record && Number(t.record.fpts_rank);
  if (rank === 1) bits.push("Won the points race.");
  else if (rank >= 2) bits.push(`Won the bracket from ${nth(rank)} in points.`);
  else bits.push("ESPN champion. Standings imported.");
  if (t.repeat === "three_peat") bits.push("Three-peat.");
  else if (t.repeat === "repeat") bits.push("Repeat champion.");
  if (t.prior && Number(t.prior.place) >= 5) {
    bits.push(`Leapt from ${nth(t.prior.place)} the year before.`);
  }
  if (t.final_missing === "espn_history") {
    bits.push("Championship final tape is not on this book yet.");
  }
  return bits.join(" ");
}

/**
 * Mutates title rows: fill missing fpts_rank / prior / repeat from standings.
 * `standings` is a flat list of {season, user_id, place, wins, losses, fpts, name}.
 */
export function enrichTitleHistory(titles, standings) {
  const bySeason = {};
  for (const r of standings || []) {
    if (!r || r.season == null || r.user_id == null) continue;
    const y = String(r.season);
    (bySeason[y] || (bySeason[y] = [])).push(r);
  }
  const champYears = {};
  for (const t of titles || []) {
    const uid = t && t.user_id != null ? String(t.user_id) : "";
    const year = Number(t && t.season);
    if (!uid || !Number.isFinite(year)) continue;
    (champYears[uid] || (champYears[uid] = [])).push(year);
  }
  for (const t of titles || []) {
    if (!t) continue;
    const uid = t.user_id != null ? String(t.user_id) : "";
    const year = Number(t.season);
    const rows = bySeason[String(t.season)] || [];
    if (!t.record) t.record = {};
    if (t.record.fpts_rank == null && rows.length) {
      const rank = fptsRankInSeason(rows, uid);
      if (rank) t.record.fpts_rank = rank;
    }
    if (!t.prior && Number.isFinite(year)) {
      const prevRows = bySeason[String(year - 1)] || [];
      const prev = prevRows.find((r) => String(r.user_id) === uid);
      if (prev) {
        t.prior = {
          season: String(year - 1),
          place: prev.place || null,
          fpts_rank: fptsRankInSeason(prevRows, uid),
          wins: prev.wins || 0,
          losses: prev.losses || 0,
          fpts: prev.fpts,
        };
      }
    }
    if (!t.repeat && uid && Number.isFinite(year)) {
      const years = champYears[uid] || [];
      if (years.includes(year - 1) && years.includes(year - 2)) t.repeat = "three_peat";
      else if (years.includes(year - 1)) t.repeat = "repeat";
    }
    if (t.provider === "espn") t.thesis = espnThesis(t);
  }
  return titles;
}

/** Sacko seats: worst place in each completed season on the finishes book. */
export function lastPlaceUnlocks(finishes) {
  const byYear = {};
  for (const seat of (finishes && finishes.seats) || []) {
    for (const p of (seat && seat.places) || []) {
      const y = String(p && p.season || "");
      const place = Number(p && p.place);
      if (!y || !Number.isFinite(place) || place < 1) continue;
      const prev = byYear[y];
      if (!prev || place > prev.place) {
        byYear[y] = {
          season: y,
          place,
          user_id: seat.user_id,
          name: seat.name,
        };
      }
    }
  }
  return Object.values(byYear).sort((a, b) => String(b.season).localeCompare(String(a.season)));
}
