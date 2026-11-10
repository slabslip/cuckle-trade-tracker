/**
 * Ring leaders — players with the most league championship rings.
 *
 * A ring counts when the player was on the championship team's full roster
 * the week of that title (Sleeper matchup `players` for the champ seat).
 */

export const RING_LEADERS_BOOK_V = 1;
export const RING_LEADERS_TOP_N = 25;

function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/**
 * @param {object} opts
 * @param {Array<{player_id:string, player?:string, season:string|number, team:string, user_id?:string, roster_id?:number|null, week?:number|null, started?:boolean}>} opts.credits
 * @param {number} [opts.topN]
 * @param {string} [opts.leagueId]
 * @param {string} [opts.asOf]
 * @param {number} [opts.nTitles]
 * @param {string} [opts.rule]
 */
export function buildRingLeadersBook(opts = {}) {
  const topN = Math.max(1, Number(opts.topN) || RING_LEADERS_TOP_N);
  const by = new Map();
  for (const c of opts.credits || []) {
    if (!c || c.player_id == null) continue;
    const pid = String(c.player_id);
    if (!pid || pid === "0") continue;
    let row = by.get(pid);
    if (!row) {
      row = {
        player_id: pid,
        player: cleanName(c.player) || pid,
        rings: 0,
        titles: [],
      };
      by.set(pid, row);
    }
    if (c.player && (!row.player || row.player === pid)) {
      row.player = cleanName(c.player);
    }
    const season = String(c.season);
    const team = cleanName(c.team) || "—";
    // One ring per player per championship season.
    if (row.titles.some((t) => String(t.season) === season)) continue;
    row.rings += 1;
    row.titles.push({
      season,
      team,
      user_id: c.user_id != null ? String(c.user_id) : null,
      roster_id: c.roster_id != null ? Number(c.roster_id) : null,
      week: c.week != null ? Number(c.week) : null,
      started: c.started === true,
    });
  }

  const players = [...by.values()];
  for (const p of players) {
    p.titles.sort((a, b) => Number(b.season) - Number(a.season)
      || String(a.team).localeCompare(String(b.team)));
    p.teams = [...new Set(p.titles.map((t) => t.team).filter(Boolean))];
    p.team_lab = p.teams.join(" · ");
    p.key = p.player_id;
  }

  players.sort((a, b) => {
    const dr = (Number(b.rings) || 0) - (Number(a.rings) || 0);
    if (dr) return dr;
    const dn = String(a.player).localeCompare(String(b.player));
    if (dn) return dn;
    return String(a.player_id).localeCompare(String(b.player_id));
  });

  const top = players.slice(0, topN).map((p, i) => ({
    ...p,
    rank: i + 1,
  }));

  return {
    v: RING_LEADERS_BOOK_V,
    as_of: opts.asOf || new Date().toISOString().slice(0, 10),
    league_id: String(opts.leagueId || ""),
    n_titles: Number(opts.nTitles) || null,
    n_players: players.length,
    top_n: topN,
    rule: opts.rule
      || "Ring = on the championship team's full Sleeper roster the week of that title. Top 25 by rings.",
    players: top,
  };
}
