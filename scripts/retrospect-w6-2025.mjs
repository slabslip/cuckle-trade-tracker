#!/usr/bin/env node
/**
 * Reconstruct Expected finish at 2025 week 6, compare to actual finals,
 * and summarize what over/under-performers did after the grade.
 */
import fs from "node:fs";
import {
  projectFinishBook,
  scoreFormLeague,
  scoreTrendLeague,
  summarizeFormByRoster,
  summarizeScoringTrend,
} from "../lib/projected-finish.mjs";
import { sleeperGet, setLeagueId, readUi, readJson } from "../lib.mjs";

setLeagueId("1315431339301806080");

const PREV_LEAGUE = "1183265256141869056";
const SEASON = 2025;
const AS_OF_WEEK = 6;
const PLAYOFF_START = 15;
const OUT = "/opt/cursor/artifacts/w6-2025-retrospect.json";
const MD = "/opt/cursor/artifacts/w6-2025-retrospect.md";

function mean(a) {
  if (!a.length) return 0;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

async function fetchWeekProjections(week, ptsKey) {
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const qs = positions.map((p) => "position[]=" + p).join("&");
  const url = "https://api.sleeper.app/projections/nfl/" + SEASON + "/" + week
    + "?season_type=regular&" + qs;
  const projs = await fetch(url).then((r) => (r.ok ? r.json() : []));
  const projBy = Object.create(null);
  for (const p of projs || []) {
    const st = p.stats || {};
    projBy[p.player_id] = Number(st[ptsKey] || st.pts_ppr || st.pts_std || 0);
  }
  return projBy;
}

async function main() {
  const live = await sleeperGet("/league/" + PREV_LEAGUE);
  const ptsKey = Number(live?.scoring_settings?.rec) === 1
    ? "pts_ppr"
    : (Number(live?.scoring_settings?.rec) === 0.5 ? "pts_half_ppr" : "pts_std");
  const [users, endRosters] = await Promise.all([
    sleeperGet("/league/" + PREV_LEAGUE + "/users"),
    sleeperGet("/league/" + PREV_LEAGUE + "/rosters"),
  ]);

  const nameByUser = Object.create(null);
  const aliases = readJson("aliases.overrides.json", {}) || {};
  Object.assign(nameByUser, aliases);
  for (const u of users || []) {
    const id = String(u.user_id);
    if (!nameByUser[id]) {
      nameByUser[id] = (u.metadata && u.metadata.team_name) || u.display_name || id;
    }
  }
  const ownerByRoster = {};
  for (const r of endRosters || []) {
    ownerByRoster[Number(r.roster_id)] = r.owner_id;
  }

  // Pull matchups 1..14
  const matchups = {};
  for (let w = 1; w <= 14; w++) {
    matchups[w] = (await sleeperGet("/league/" + PREV_LEAGUE + "/matchups/" + w)) || [];
  }

  // Reconstruct W-L / PF / PA through week 6
  const seat = Object.create(null);
  for (const r of endRosters || []) {
    const rid = Number(r.roster_id);
    seat[rid] = {
      roster_id: rid,
      owner_id: r.owner_id,
      wins: 0,
      losses: 0,
      ties: 0,
      pf: 0,
      pa: 0,
      weekPts: [],
    };
  }
  for (let w = 1; w <= AS_OF_WEEK; w++) {
    const by = new Map();
    for (const row of matchups[w]) {
      if (row.matchup_id == null) continue;
      if (!by.has(row.matchup_id)) by.set(row.matchup_id, []);
      by.get(row.matchup_id).push(row);
    }
    for (const group of by.values()) {
      if (group.length < 2) continue;
      const a = group[0];
      const b = group[1];
      const aPts = Number(a.points) || 0;
      const bPts = Number(b.points) || 0;
      const A = seat[Number(a.roster_id)];
      const B = seat[Number(b.roster_id)];
      if (!A || !B) continue;
      A.pf += aPts;
      A.pa += bPts;
      B.pf += bPts;
      B.pa += aPts;
      A.weekPts.push({ week: w, points: aPts });
      B.weekPts.push({ week: w, points: bPts });
      if (aPts > bPts) { A.wins += 1; B.losses += 1; }
      else if (bPts > aPts) { B.wins += 1; A.losses += 1; }
      else { A.ties += 1; B.ties += 1; }
    }
  }

  // Remaining pairs weeks 7..14
  const remainingPairs = [];
  for (let w = AS_OF_WEEK + 1; w <= PLAYOFF_START - 1; w++) {
    const by = new Map();
    for (const row of matchups[w]) {
      if (row.matchup_id == null) continue;
      if (!by.has(row.matchup_id)) by.set(row.matchup_id, []);
      by.get(row.matchup_id).push(Number(row.roster_id));
    }
    for (const group of by.values()) {
      if (group.length >= 2) remainingPairs.push([group[0], group[1]]);
    }
  }

  // Form weeks 1..6
  const weekDeltas = Object.create(null);
  for (let w = 1; w <= AS_OF_WEEK; w++) {
    const projBy = await fetchWeekProjections(w, ptsKey);
    for (const row of matchups[w]) {
      const rid = Number(row.roster_id);
      const actual = Number(row.points);
      if (!Number.isFinite(actual) || actual <= 0) continue;
      let proj = 0;
      for (const id of (row.starters || [])) proj += Number(projBy[id]) || 0;
      if (proj < 30) continue;
      const key = String(rid);
      if (!weekDeltas[key]) weekDeltas[key] = [];
      weekDeltas[key].push({
        week: w,
        actual: Math.round(actual * 10) / 10,
        proj: Math.round(proj * 10) / 10,
        delta: Math.round((actual - proj) * 10) / 10,
      });
    }
  }
  const formByRoster = scoreFormLeague(summarizeFormByRoster(weekDeltas));

  const trendRaw = Object.create(null);
  for (const [rid, s] of Object.entries(seat)) {
    trendRaw[rid] = s.weekPts;
  }
  const trendByRoster = scoreTrendLeague(summarizeScoringTrend(trendRaw));

  // Career arcs excluding 2025 (what we'd know entering / mid 2025)
  const arcsBook = readUi("season-arcs.json", null);
  const arcByUser = Object.create(null);
  for (const s of (arcsBook && arcsBook.seats) || []) {
    if (!s || s.user_id == null) continue;
    // Recompute climb from pre-2025 seasons if available
    const seasons = (arcsBook.seasons || []).filter((y) => Number(y.season) < SEASON);
    const rows = [];
    for (const y of seasons) {
      const seatRow = (y.seats || []).find((x) => String(x.user_id) === String(s.user_id));
      if (!seatRow) continue;
      const early = Number(seatRow.place_w4);
      const fin = Number(seatRow.place_final);
      if (!Number.isFinite(early) || !Number.isFinite(fin)) continue;
      rows.push({
        climb: early - fin,
        slow: seatRow.arc === "slow_burn" ? 1 : 0,
        fade: seatRow.arc === "fast_fade" ? 1 : 0,
      });
    }
    if (!rows.length) {
      arcByUser[String(s.user_id)] = {
        avg_climb: 0,
        slow_burn_rate: 0,
        fast_fade_rate: 0,
        n: 0,
      };
      continue;
    }
    arcByUser[String(s.user_id)] = {
      avg_climb: Math.round(mean(rows.map((r) => r.climb)) * 100) / 100,
      slow_burn_rate: Math.round(mean(rows.map((r) => r.slow)) * 1000) / 1000,
      fast_fade_rate: Math.round(mean(rows.map((r) => r.fade)) * 1000) / 1000,
      n: rows.length,
    };
  }

  // Synthetic roster settings as of week 6
  const rosters = Object.values(seat).map((s) => {
    const pfInt = Math.floor(s.pf);
    const pfDec = Math.round((s.pf - pfInt) * 100);
    const paInt = Math.floor(s.pa);
    const paDec = Math.round((s.pa - paInt) * 100);
    return {
      roster_id: s.roster_id,
      owner_id: s.owner_id,
      settings: {
        wins: s.wins,
        losses: s.losses,
        ties: s.ties,
        fpts: pfInt,
        fpts_decimal: pfDec,
        fpts_against: paInt,
        fpts_against_decimal: paDec,
      },
    };
  });

  const book = projectFinishBook({
    rosters,
    ownerByRoster,
    nameByUser,
    remainingPairs,
    teams: 10,
    season: SEASON,
    week: AS_OF_WEEK,
    playoffWeekStart: PLAYOFF_START,
    arcByUser,
    formByRoster,
    trendByRoster,
  });

  // Actual finals
  const standings = (readJson("sleeper_season_standings.json", []) || [])
    .find((y) => String(y.season) === String(SEASON));
  const finalByUid = Object.create(null);
  for (const row of (standings && standings.rows) || []) {
    finalByUid[String(row.user_id)] = {
      place: Number(row.place),
      wins: row.wins,
      losses: row.losses,
      fpts: row.fpts,
      from: row.from,
    };
  }

  // Post-week-6 scoring (7-14 regular)
  const postPts = Object.create(null);
  for (let w = AS_OF_WEEK + 1; w <= 14; w++) {
    for (const row of matchups[w]) {
      const rid = Number(row.roster_id);
      const pts = Number(row.points) || 0;
      if (!postPts[rid]) postPts[rid] = [];
      postPts[rid].push(pts);
    }
  }

  // Trades / FA after week 6
  const asList = (raw) => (Array.isArray(raw) ? raw : Object.values(raw || {}));
  const trades = asList(readJson("trades.json", []));
  const legs = asList(readJson("trade_legs.json", []));
  const moves = asList(readJson("moves.json", []));
  const legsByTx = Object.create(null);
  for (const leg of legs) {
    const id = String(leg.transaction_id || "");
    if (!id) continue;
    (legsByTx[id] ||= []).push(leg);
  }

  const tradesAfter = trades.filter((t) =>
    String(t.season) === String(SEASON) && Number(t.week) > AS_OF_WEEK);
  const movesAfter = moves.filter((m) =>
    String(m.season) === String(SEASON)
    && String(m.league_id) === PREV_LEAGUE
    && Number(m.week) > AS_OF_WEEK
    && (m.type === "free_agent" || m.type === "waiver"));

  function activityForUid(uid) {
    const uidS = String(uid);
    const myTrades = tradesAfter.filter((t) => (t.user_ids || []).map(String).includes(uidS));
    const received = [];
    const sent = [];
    for (const t of myTrades) {
      for (const leg of (legsByTx[String(t.transaction_id)] || [])) {
        if (String(leg.to_user_id) === uidS) {
          received.push({ week: t.week, label: leg.label, kind: leg.kind });
        } else if ((t.user_ids || []).map(String).includes(uidS)) {
          // counterparty asset leaving — approximate via other direction
        }
      }
      // Also mark sent: legs to the other user
      for (const leg of (legsByTx[String(t.transaction_id)] || [])) {
        if (String(leg.to_user_id) !== uidS && (t.user_ids || []).map(String).includes(String(leg.to_user_id))) {
          // assets the other received came from someone — if from this seat's roster
          if (Number(leg.to_roster_id) !== Number(
            Object.entries(ownerByRoster).find(([, u]) => String(u) === uidS)?.[0],
          )) {
            // if leg goes TO other, it left this seat when this seat is the other party
          }
        }
      }
    }
    // Cleaner: for each trade involving uid, list legs to uid as received, legs to partner as given
    const deals = myTrades.map((t) => {
      const partner = (t.user_ids || []).map(String).find((u) => u !== uidS) || "?";
      const got = (legsByTx[String(t.transaction_id)] || [])
        .filter((l) => String(l.to_user_id) === uidS)
        .map((l) => l.label);
      const gave = (legsByTx[String(t.transaction_id)] || [])
        .filter((l) => String(l.to_user_id) === partner)
        .map((l) => l.label);
      return { week: t.week, partner: nameByUser[partner] || partner, got, gave };
    });
    const fa = movesAfter.filter((m) => (m.roster_ids || []).some((r) =>
      String(ownerByRoster[Number(r)]) === uidS));
    const adds = [];
    for (const m of fa) {
      for (const pid of Object.keys(m.adds || {})) adds.push({ week: m.week, player_id: pid });
    }
    return { trade_n: deals.length, deals, fa_adds: adds.length, fa_weeks: [...new Set(fa.map((m) => m.week))] };
  }

  const rows = book.seats.map((s) => {
    const fin = finalByUid[String(s.user_id)] || {};
    const actual = Number(fin.place) || null;
    const graded = Number(s.proj_finish);
    const miss = actual != null ? graded - actual : null; // + = finished better than grade (outperformed)
    const post = postPts[s.roster_id] || [];
    const early = (seat[s.roster_id]?.weekPts || []).map((w) => w.points);
    const act = activityForUid(s.user_id);
    return {
      name: s.name,
      user_id: s.user_id,
      roster_id: s.roster_id,
      record_w6: s.record,
      place_w6: s.place_now,
      graded_finish: graded,
      band: s.band,
      actual_finish: actual,
      actual_record: fin.wins != null ? (fin.wins + "-" + fin.losses) : null,
      miss, // + outperformed grade
      form_delta: s.form_delta,
      form_recent: s.form_recent,
      trend_delta: s.trend_delta,
      recent_rel: s.recent_rel,
      talent_ppw: s.talent_ppw,
      expected_remaining_wins: s.expected_remaining_wins,
      avg_climb_pre2025: arcByUser[String(s.user_id)]?.avg_climb ?? null,
      slow_burn_pre2025: arcByUser[String(s.user_id)]?.slow_burn_rate ?? null,
      ppw_w1_6: early.length ? Math.round(mean(early) * 10) / 10 : null,
      ppw_w7_14: post.length ? Math.round(mean(post) * 10) / 10 : null,
      ppw_lift: (early.length && post.length)
        ? Math.round((mean(post) - mean(early)) * 10) / 10
        : null,
      activity: act,
    };
  });

  rows.sort((a, b) => (a.graded_finish || 99) - (b.graded_finish || 99));

  const mae = mean(rows.filter((r) => r.miss != null).map((r) => Math.abs(r.miss)));
  const corrPairs = rows.filter((r) => r.actual_finish != null);
  // Spearman-ish: compare ranks
  function corr(xs, ys) {
    const n = xs.length;
    const mx = mean(xs);
    const my = mean(ys);
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    return dx && dy ? num / Math.sqrt(dx * dy) : null;
  }
  const gradeCorr = corr(
    corrPairs.map((r) => r.graded_finish),
    corrPairs.map((r) => r.actual_finish),
  );

  const outperformers = rows.filter((r) => (r.miss || 0) >= 2)
    .sort((a, b) => b.miss - a.miss);
  const underperformers = rows.filter((r) => (r.miss || 0) <= -2)
    .sort((a, b) => a.miss - b.miss);

  const report = {
    v: 1,
    season: SEASON,
    as_of_week: AS_OF_WEEK,
    formula: book.rule,
    accuracy: {
      mae_places: Math.round(mae * 100) / 100,
      grade_vs_actual_corr: gradeCorr != null ? Math.round(gradeCorr * 1000) / 1000 : null,
      n: rows.length,
    },
    board_w6: rows,
    outperformers,
    underperformers,
    learnings: [],
  };

  // Derive learnings
  for (const r of outperformers) {
    const bits = [];
    if ((r.ppw_lift || 0) >= 8) bits.push("scoring jumped +" + r.ppw_lift + " PPW after week 6");
    if (r.activity.trade_n >= 2) bits.push("active trader (" + r.activity.trade_n + " deals after W6)");
    else if (r.activity.trade_n === 1) bits.push("made a post-W6 trade");
    if (r.activity.fa_adds >= 8) bits.push("heavy FA (" + r.activity.fa_adds + " adds)");
    if ((r.slow_burn_pre2025 || 0) >= 0.3) bits.push("career slow-burn prior");
    if ((r.form_delta || 0) < 0 && (r.ppw_lift || 0) > 0) {
      bits.push("was underscoring proj at W6 but flipped later");
    }
    const got = r.activity.deals.flatMap((d) => d.got).filter(Boolean);
    if (got.length) bits.push("acquired: " + got.slice(0, 6).join(", "));
    report.learnings.push({
      name: r.name,
      kind: "outperformed",
      graded: r.graded_finish,
      actual: r.actual_finish,
      miss: r.miss,
      why: bits,
      deals: r.activity.deals,
    });
  }
  for (const r of underperformers) {
    const bits = [];
    if ((r.ppw_lift || 0) <= -8) bits.push("scoring fell " + r.ppw_lift + " PPW after week 6");
    if (r.activity.trade_n === 0) bits.push("quiet on trade market after W6");
    if ((r.form_delta || 0) > 5 && (r.ppw_lift || 0) < 0) {
      bits.push("was beating proj at W6 then cooled");
    }
    const got = r.activity.deals.flatMap((d) => d.got).filter(Boolean);
    if (got.length) bits.push("acquired: " + got.slice(0, 6).join(", "));
    const gave = r.activity.deals.flatMap((d) => d.gave).filter(Boolean);
    if (gave.length) bits.push("moved out: " + gave.slice(0, 6).join(", "));
    report.learnings.push({
      name: r.name,
      kind: "underperformed",
      graded: r.graded_finish,
      actual: r.actual_finish,
      miss: r.miss,
      why: bits,
      deals: r.activity.deals,
    });
  }

  // Cross-cutting lessons
  report.playbook = [
    "Post-W6 PPW lift is the strongest miss explanation — track rolling 3-week PPW vs W1-6 baseline as a live feature.",
    "Outperformers often stacked FA + at least one trade after W6; underperformers were quieter. Encode post-grade transaction heat (trades/FA adds in last 2–3 weeks) into trend.",
    "Career slow-burn priors helped some risers (TipsUp/Truman pattern) — keep arc weight, but pair with live PPW lift so quiet bags that start scoring get credit.",
    "Form at W6 alone mis-ranked seats that flipped vs proj later — keep recent-form dominant and add a 'form slope' (W4-6 vs W1-3 residual).",
    "Remaining-schedule path mattered less than who added production — consider a 'acquisition shock' bump when a seat adds a top-24 starter midseason (requires player-week values).",
  ];

  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  let md = "# 2025 Week 6 Expected finish retrospective\n\n";
  md += "Reconstructed **v4** Expected finish as of week 6, then compared to actual finals.\n\n";
  md += "## Accuracy\n\n";
  md += "- Mean abs error: **" + report.accuracy.mae_places + "** places\n";
  md += "- Grade vs actual correlation: **" + report.accuracy.grade_vs_actual_corr + "**\n\n";
  md += "## Board at week 6 vs actual finish\n\n";
  md += "| Seat | W6 record | Graded | Actual | Miss | FormΔ | TrendΔ | PPW 1-6 → 7-14 |\n";
  md += "|---|---|---|---|---|---|---|---|\n";
  for (const r of rows) {
    const miss = r.miss == null ? "—" : ((r.miss > 0 ? "+" : "") + r.miss);
    const lift = r.ppw_lift == null ? "—" : (r.ppw_w1_6 + " → " + r.ppw_w7_14 + " (" + (r.ppw_lift >= 0 ? "+" : "") + r.ppw_lift + ")");
    md += "| " + r.name + " | " + r.record_w6 + " | #" + r.graded_finish + " | #" + r.actual_finish
      + " | " + miss + " | " + r.form_delta + " | " + r.trend_delta + " | " + lift + " |\n";
  }
  md += "\nMiss = graded − actual (**+** = finished better than the W6 grade).\n\n";
  md += "## Who outperformed the grade\n\n";
  for (const L of report.learnings.filter((x) => x.kind === "outperformed")) {
    md += "### " + L.name + " (graded #" + L.graded + " → actual #" + L.actual + ", miss +" + L.miss + ")\n\n";
    for (const w of L.why) md += "- " + w + "\n";
    for (const d of L.deals || []) {
      md += "- W" + d.week + " vs " + d.partner + ": got [" + (d.got.join("; ") || "—")
        + "] / gave [" + (d.gave.join("; ") || "—") + "]\n";
    }
    md += "\n";
  }
  md += "## Who underperformed the grade\n\n";
  for (const L of report.learnings.filter((x) => x.kind === "underperformed")) {
    md += "### " + L.name + " (graded #" + L.graded + " → actual #" + L.actual + ", miss " + L.miss + ")\n\n";
    for (const w of L.why) md += "- " + w + "\n";
    for (const d of L.deals || []) {
      md += "- W" + d.week + " vs " + d.partner + ": got [" + (d.got.join("; ") || "—")
        + "] / gave [" + (d.gave.join("; ") || "—") + "]\n";
    }
    md += "\n";
  }
  md += "## Playbook for future seasons\n\n";
  for (const p of report.playbook) md += "- " + p + "\n";

  fs.writeFileSync(MD, md);
  console.log(JSON.stringify({
    out: OUT,
    md: MD,
    accuracy: report.accuracy,
    top: rows.slice(0, 3).map((r) => r.name + " graded#" + r.graded_finish + " actual#" + r.actual_finish),
    outperform: outperformers.map((r) => r.name + " +" + r.miss),
    underperform: underperformers.map((r) => r.name + " " + r.miss),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
