/**
 * ESPN team-week tape. Regular season always counts. Playoff counts only on
 * WINNERS / WINNERS_BRACKET (championship hunt). Consolation, losers ladder,
 * and 3rd-place tiers stay on the raw tape but do not set the low list.
 */

export function espnPlayoffHunt(tier) {
  const t = String(tier || "").toUpperCase();
  return t === "WINNERS_BRACKET" || t === "WINNERS";
}

export function espnPhase(week, playoffWeekStart, tier) {
  const t = String(tier || "").toUpperCase();
  if (t && t !== "NONE" && t !== "NULL") return "playoff";
  const pws = Number(playoffWeekStart);
  if (Number.isFinite(pws) && pws >= 2 && Number(week) >= pws) return "playoff";
  return "regular";
}

export function espnSidePoints(side, week) {
  if (!side) return null;
  const total = Number(side.totalPoints);
  if (Number.isFinite(total) && total > 0) return Math.round(total * 100) / 100;
  const by = side.pointsByScoringPeriod || {};
  const keyed = Number(by[String(week)] ?? by[week]);
  if (Number.isFinite(keyed) && keyed > 0) return Math.round(keyed * 100) / 100;
  const vals = Object.values(by).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (vals.length === 1) return Math.round(vals[0] * 100) / 100;
  return null;
}

export function espnPlayoffWeekStart(settings) {
  const schedule = (settings && settings.scheduleSettings) || {};
  const n = Number(schedule.matchupPeriodCount);
  if (Number.isFinite(n) && n >= 2 && (schedule.playoffTeamCount || 0) > 0) return n + 1;
  return 15;
}

function pushSide(out, season, leagueId, week, side, opponent, phase, hunt, tier, pws, ownerByRoster) {
  const pts = espnSidePoints(side, week);
  if (pts == null) return;
  const rid = side.teamId;
  if (rid == null) return;
  const uid = ownerByRoster.get(Number(rid)) || ownerByRoster.get(String(rid)) || null;
  if (!uid) return;
  out.push({
    season: String(season),
    league_id: leagueId,
    week: Number(week) || 0,
    roster_id: rid,
    user_id: uid,
    points: pts,
    phase,
    hunt: phase === "regular" ? true : hunt,
    playoff_tier: tier || null,
    playoff_week_start: pws,
    provider: "espn",
    opponent_roster_id: opponent && opponent.teamId != null ? opponent.teamId : null,
  });
}

export function espnScoresFromSchedule(schedule, season, leagueId, ownerByRoster, pws) {
  const out = [];
  for (const m of schedule || []) {
    if (!m) continue;
    const week = Number(m.matchupPeriodId || m.scoringPeriodId);
    if (!Number.isFinite(week) || week < 1) continue;
    const tier = m.playoffTierType || m.playoffTier || "";
    const phase = espnPhase(week, pws, tier);
    const hunt = espnPlayoffHunt(tier);
    pushSide(out, season, leagueId, week, m.home, m.away, phase, hunt, tier, pws, ownerByRoster);
    pushSide(out, season, leagueId, week, m.away, m.home, phase, hunt, tier, pws, ownerByRoster);
  }
  return out;
}
