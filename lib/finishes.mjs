/**
 * Career finishes: every completed season a manager played, then average place.
 * Parked / invented places (joined after last season) never enter the average.
 * One book also powers career-average (3-season floor), points king, contender
 * rate, and sacko tiles.
 */

export const CAREER_FLOOR = 3;
export const CONTENDER_PLACE = 6;

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
  const fpts = Number(row.fpts);
  const wins = Number(row.wins);
  const losses = Number(row.losses);
  const ties = Number(row.ties);
  seat.places.push({
    season,
    place,
    from: row.from || null,
    provider: row.provider || "sleeper",
    fpts: Number.isFinite(fpts) ? fpts : null,
    wins: Number.isFinite(wins) ? wins : null,
    losses: Number.isFinite(losses) ? losses : null,
    ties: Number.isFinite(ties) ? ties : 0,
  });
}

function lastPlaceBySeason(seats) {
  const last = {};
  for (const seat of seats || []) {
    for (const row of seat.places || []) {
      const year = String(row.season || "");
      const place = Number(row.place);
      if (!year || !Number.isFinite(place)) continue;
      if (last[year] == null || place > last[year]) last[year] = place;
    }
  }
  return last;
}

function decorateSeat(seat, lastByYear) {
  const places = seat.places || [];
  let fptsSum = 0;
  let fptsN = 0;
  let wins = 0;
  let losses = 0;
  let lastN = 0;
  let top6 = 0;
  let titles = 0;
  const lastYears = [];
  for (const row of places) {
    const fpts = Number(row.fpts);
    if (Number.isFinite(fpts)) {
      fptsSum += fpts;
      fptsN += 1;
    }
    if (Number.isFinite(Number(row.wins))) wins += Number(row.wins);
    if (Number.isFinite(Number(row.losses))) losses += Number(row.losses);
    const place = Number(row.place);
    if (place === 1) titles += 1;
    if (Number.isFinite(place) && place <= CONTENDER_PLACE) top6 += 1;
    if (lastByYear[row.season] != null && place === lastByYear[row.season]) {
      lastN += 1;
      lastYears.push(row.season);
    }
  }
  const n = places.length;
  return {
    ...seat,
    fpts_avg: fptsN ? Math.round((fptsSum / fptsN) * 10) / 10 : null,
    fpts_n: fptsN,
    wins,
    losses,
    last_n: lastN,
    last_years: lastYears,
    top6_n: top6,
    titles_n: titles,
    contender: n ? Math.round((top6 / n) * 1000) / 10 : null,
  };
}

export function careerFloorSeats(seats, floor = CAREER_FLOOR) {
  return (seats || []).filter((s) => (s.n || 0) >= floor);
}

export function pointsKingSeats(seats, floor = CAREER_FLOOR) {
  return careerFloorSeats(seats, floor)
    .filter((s) => s.fpts_avg != null)
    .slice()
    .sort((a, b) => {
      const pf = (b.fpts_avg ?? 0) - (a.fpts_avg ?? 0);
      if (pf) return pf;
      if (b.n !== a.n) return b.n - a.n;
      return String(a.name).localeCompare(String(b.name));
    });
}

export function contenderSeats(seats, floor = CAREER_FLOOR) {
  return careerFloorSeats(seats, floor)
    .slice()
    .sort((a, b) => {
      const rate = (b.contender ?? 0) - (a.contender ?? 0);
      if (rate) return rate;
      if (b.n !== a.n) return b.n - a.n;
      const avg = (a.avg ?? 99) - (b.avg ?? 99);
      if (avg) return avg;
      return String(a.name).localeCompare(String(b.name));
    });
}

export function sackoSeats(seats) {
  return (seats || [])
    .filter((s) => (s.last_n || 0) > 0)
    .slice()
    .sort((a, b) => {
      if (b.last_n !== a.last_n) return b.last_n - a.last_n;
      if (b.n !== a.n) return b.n - a.n;
      return String(a.name).localeCompare(String(b.name));
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
  const lastByYear = lastPlaceBySeason(seats);
  return seats.map((seat) => decorateSeat(seat, lastByYear));
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
    v: 2,
    as_of: asOf || null,
    league_id: leagueId || null,
    n: seats.length,
    seasons,
    rule: "winners-bracket then record; average of completed seasons only",
    career_floor: CAREER_FLOOR,
    contender_place: CONTENDER_PLACE,
    seats,
  };
}
