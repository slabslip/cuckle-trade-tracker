/** Final 1..N for one completed Sleeper season. Shared by title-path and finishes. */

export function fptsOf(settings) {
  const s = settings || {};
  return (s.fpts || 0) + (s.fpts_decimal || 0) / 100;
}

export function pptsOf(settings) {
  const s = settings || {};
  return (s.ppts || 0) + (s.ppts_decimal || 0) / 100;
}

export function placesFromBracket(wb) {
  const place = {};
  for (const row of wb || []) {
    if (row.p && row.w) {
      place[row.w] = row.p;
      if (row.p === 1 && row.l) place[row.l] = 2;
      else if (row.p === 3 && row.l) place[row.l] = 4;
      else if (row.p === 5 && row.l) place[row.l] = 6;
    }
  }
  return place;
}

/**
 * One row per roster for a season: who they are and the regular-season record the standings
 * are then ordered by. Split out of standingsFor so that the championship final can name the
 * runner-up's record from the same derivation the standings use, rather than reading
 * `settings` a second time and risking a card that disagrees with the table beside it.
 */
export function recordRowsFor(s, nameByUser) {
  return s.rosters.map((r) => {
    const uid = s.owner[r.roster_id] || null;
    const st = r.settings || {};
    return {
      roster_id: r.roster_id,
      user_id: uid,
      name: (uid && (nameByUser[uid] || s.names[uid])) || `roster ${r.roster_id}`,
      wins: st.wins || 0,
      losses: st.losses || 0,
      ties: st.ties || 0,
      fpts: fptsOf(st),
    };
  });
}

/**
 * Final 1..N for one completed season. Two sources, in this order:
 *
 *   1. **The winners bracket.** Its placement games carry `p` — 1 settles 1st and 2nd, 3 settles
 *      3rd and 4th, 5 settles 5th and 6th. That is the season's own answer and it wins even when
 *      a placed team's record was worse than an unplaced team's.
 *   2. **Regular-season record**, for everyone the bracket does not place. Standings points
 *      (`wins * 2 + ties`) first, then points for, then `roster_id` as a deterministic last
 *      resort so two identical teams cannot swap between builds.
 *
 * The **losers bracket is deliberately not read.** Its `p` is a place inside the consolation
 * round rather than a league place, the direction of that mapping is a league setting Sleeper
 * does not expose here, and this league's 2025 consolation rows carry `t2_original`
 * substitutions. Reading it would be a guess; regular-season order is a stated rule.
 *
 * A season with no bracket at all degrades to pure record order and every row says so in `from`,
 * rather than inventing playoff results.
 */
export function standingsFor(s, nameByUser) {
  const placed = placesFromBracket(s.wb);
  const fromBracket = [];
  const fromRecord = [];
  for (const row of recordRowsFor(s, nameByUser)) {
    if (placed[row.roster_id]) {
      row.place = placed[row.roster_id];
      row.from = "bracket";
      fromBracket.push(row);
    } else {
      row.from = "record";
      fromRecord.push(row);
    }
  }
  fromBracket.sort((a, b) => a.place - b.place);
  // The bracket must hand back 1..k with no gaps and no repeats, or it is not the shape we read.
  fromBracket.forEach((r, i) => {
    if (r.place !== i + 1) {
      throw new Error(`standings ${s.season}: bracket gave place ${r.place} at slot ${i + 1}`);
    }
  });
  const pts = (r) => r.wins * 2 + r.ties;
  fromRecord.sort((a, b) => (pts(b) - pts(a)) || (b.fpts - a.fpts) || (a.roster_id - b.roster_id));
  fromRecord.forEach((r, i) => { r.place = fromBracket.length + i + 1; });
  return fromBracket.concat(fromRecord);
}
