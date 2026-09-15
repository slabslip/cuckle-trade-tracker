/**
 * Career finishes: every completed season a manager played, then average place.
 * Parked / invented places (joined after last season) never enter the average.
 */

export function finishKey(userId) {
  return userId == null ? "" : String(userId);
}

export function addFinish(byUser, row) {
  const uid = finishKey(row && row.user_id);
  if (!uid || !row || row.place == null) return;
  const place = Number(row.place);
  if (!Number.isFinite(place) || place < 1) return;
  if (!byUser.has(uid)) {
    byUser.set(uid, {
      user_id: uid,
      name: row.name || uid,
      places: [],
    });
  }
  const seat = byUser.get(uid);
  if (row.name) seat.name = row.name;
  const season = String(row.season || "");
  if (!season) return;
  if (seat.places.some((p) => p.season === season)) return;
  seat.places.push({
    season,
    place,
    from: row.from || null,
    provider: row.provider || "sleeper",
  });
}

export function rankFinishes(byUser, members = []) {
  const nameBy = Object.fromEntries(
    (members || []).filter((m) => m && m.user_id).map((m) => [String(m.user_id), m.name]),
  );
  const seats = [...byUser.values()].map((seat) => {
    const places = [...seat.places].sort((a, b) => String(b.season).localeCompare(String(a.season)));
    const n = places.length;
    const avg = n ? places.reduce((sum, p) => sum + Number(p.place), 0) / n : null;
    return {
      user_id: seat.user_id,
      name: nameBy[seat.user_id] || seat.name,
      n,
      avg: avg == null ? null : Math.round(avg * 10) / 10,
      places,
    };
  }).filter((s) => s.n > 0);
  seats.sort((a, b) => {
    const avg = (a.avg ?? 99) - (b.avg ?? 99);
    if (avg) return avg;
    if (b.n !== a.n) return b.n - a.n;
    return String(a.name).localeCompare(String(b.name));
  });
  return seats;
}

export function remapEspnStanding(row, personBridge, franchiseMap) {
  if (!row) return null;
  const team = row.roster_id != null ? String(row.roster_id) : "";
  let uid = row.user_id;
  if (team && franchiseMap && franchiseMap[team]) uid = franchiseMap[team];
  else if (uid && personBridge && personBridge[uid]) uid = personBridge[uid];
  return {
    ...row,
    user_id: uid,
    provider: "espn",
    from: row.from || "espn",
  };
}

export function buildFinishesBook({
  sleeperSeasons = [],
  espnStandings = [],
  members = [],
  leagueId,
  asOf,
  sleeperYears,
}) {
  const sleeperYearSet = new Set(
    (sleeperYears && sleeperYears.length)
      ? sleeperYears.map(String)
      : sleeperSeasons.map((s) => String(s.season)),
  );
  const byUser = new Map();
  for (const season of sleeperSeasons) {
    const year = String(season.season || "");
    for (const row of season.rows || []) {
      addFinish(byUser, {
        ...row,
        season: year,
        provider: row.provider || "sleeper",
      });
    }
  }
  for (const row of espnStandings || []) {
    const year = String(row.season || "");
    if (sleeperYearSet.has(year)) continue;
    addFinish(byUser, row);
  }
  const seats = rankFinishes(byUser, members);
  const seasons = [...new Set([
    ...sleeperSeasons.map((s) => String(s.season)),
    ...(espnStandings || []).map((r) => String(r.season)).filter((y) => y && !sleeperYearSet.has(y)),
  ])].sort((a, b) => b.localeCompare(a));
  return {
    v: 1,
    as_of: asOf || null,
    league_id: leagueId || null,
    n: seats.length,
    seasons,
    rule: "winners-bracket then record; average of completed seasons only",
    seats,
  };
}
