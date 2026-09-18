/**
 * Career finishes: every completed season a manager played, then average place.
 * Parked / invented places (joined after last season) never enter the average.
 * Default rule is winners-bracket then record; average of completed seasons only.
 * Redraft / GM passes a consolation-free rule in. One book also powers
 * career-average (3-season floor), points king, contender rate, sacko,
 * regular-season average, playoff appearances / average, and pot tiles.
 */

import { PLAYOFF_AVG_FLOOR, madePlayoffs, payoutForPlace } from "./redraft-season.mjs";

export const CAREER_FLOOR = 3;
export const CONTENDER_PLACE = 6;
export { PLAYOFF_AVG_FLOOR };

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
  const rsPlace = Number(row.rs_place);
  const rsFpts = Number(row.rs_fpts);
  seat.places.push({
    season,
    place,
    rs_place: Number.isFinite(rsPlace) && rsPlace >= 1 ? rsPlace : null,
    from: row.from || null,
    provider: row.provider || "sleeper",
    fpts: Number.isFinite(fpts) ? fpts : null,
    rs_fpts: Number.isFinite(rsFpts) ? rsFpts : null,
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

function rsPlaceOf(row) {
  const n = Number(row && row.rs_place);
  if (Number.isFinite(n) && n >= 1) return n;
  return Number(row && row.place);
}

function decorateSeat(seat, lastByYear, pot) {
  const places = seat.places || [];
  let fptsSum = 0;
  let fptsN = 0;
  let wins = 0;
  let losses = 0;
  let lastN = 0;
  let top6 = 0;
  let titles = 0;
  let rsSum = 0;
  let rsN = 0;
  const lastYears = [];
  const playoffRows = [];
  const payouts = [];
  let won = 0;
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
    const rs = rsPlaceOf(row);
    if (Number.isFinite(rs) && rs >= 1) {
      rsSum += rs;
      rsN += 1;
    }
    if (madePlayoffs(row)) playoffRows.push(row);
    if (pot && pot.entry) {
      const pay = payoutForPlace(place, pot);
      won += pay;
      if (pay) payouts.push({ season: row.season, place, amount: pay });
    }
  }
  const n = places.length;
  const playoffN = playoffRows.length;
  const playoffSum = playoffRows.reduce((sum, row) => sum + Number(row.place), 0);
  const lost = pot && pot.entry ? n * Number(pot.entry) : null;
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
    rs_avg: rsN ? Math.round((rsSum / rsN) * 10) / 10 : null,
    playoff_n: playoffN,
    playoff_avg: playoffN ? Math.round((playoffSum / playoffN) * 10) / 10 : null,
    playoff_years: playoffRows.map((row) => row.season),
    won: pot ? won : null,
    lost,
    net: pot && lost != null ? won - lost : null,
    payouts: pot ? payouts : [],
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

function byName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""));
}

export function rsAvgSeats(seats, floor = CAREER_FLOOR) {
  return careerFloorSeats(seats, floor)
    .filter((s) => s.rs_avg != null)
    .slice()
    .sort((a, b) => {
      const avg = (a.rs_avg ?? 99) - (b.rs_avg ?? 99);
      if (avg) return avg;
      if (b.n !== a.n) return b.n - a.n;
      return byName(a, b);
    });
}

export function playoffNSeats(seats) {
  return (seats || [])
    .filter((s) => (s.playoff_n || 0) > 0)
    .slice()
    .sort((a, b) => {
      if ((b.playoff_n || 0) !== (a.playoff_n || 0)) return (b.playoff_n || 0) - (a.playoff_n || 0);
      const avg = (a.playoff_avg ?? 99) - (b.playoff_avg ?? 99);
      if (avg) return avg;
      if (b.n !== a.n) return b.n - a.n;
      return byName(a, b);
    });
}

export function playoffAvgSeats(seats, floor = PLAYOFF_AVG_FLOOR) {
  return (seats || [])
    .filter((s) => (s.playoff_n || 0) >= floor && s.playoff_avg != null)
    .slice()
    .sort((a, b) => {
      const avg = (a.playoff_avg ?? 99) - (b.playoff_avg ?? 99);
      if (avg) return avg;
      if ((b.playoff_n || 0) !== (a.playoff_n || 0)) return (b.playoff_n || 0) - (a.playoff_n || 0);
      return byName(a, b);
    });
}

export function grossWonSeats(seats) {
  return (seats || [])
    .filter((s) => s.won != null)
    .slice()
    .sort((a, b) => {
      if ((b.won || 0) !== (a.won || 0)) return (b.won || 0) - (a.won || 0);
      if ((b.net || 0) !== (a.net || 0)) return (b.net || 0) - (a.net || 0);
      return byName(a, b);
    });
}

export function grossLostSeats(seats) {
  return (seats || [])
    .filter((s) => s.lost != null)
    .slice()
    .sort((a, b) => {
      if ((b.lost || 0) !== (a.lost || 0)) return (b.lost || 0) - (a.lost || 0);
      if ((a.net || 0) !== (b.net || 0)) return (a.net || 0) - (b.net || 0);
      return byName(a, b);
    });
}

export function rankFinishes(byUser, members = [], pot) {
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
  return seats.map((seat) => decorateSeat(seat, lastByYear, pot));
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
  rule = "winners-bracket then record; average of completed seasons only",
  pot,
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
  const seats = rankFinishes(byUser, members, pot);
  const seasons = [...new Set([
    ...sleeperSeasons.map((s) => String(s.season)),
    ...(espnStandings || []).map((r) => String(r.season)).filter((y) => y && !sleeperYearSet.has(y)),
  ])].sort((a, b) => b.localeCompare(a));
  return {
    v: pot ? 4 : 3,
    as_of: asOf || null,
    league_id: leagueId || null,
    n: seats.length,
    seasons,
    rule,
    career_floor: CAREER_FLOOR,
    contender_place: CONTENDER_PLACE,
    pot: pot || null,
    seats,
  };
}
