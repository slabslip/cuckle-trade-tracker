#!/usr/bin/env node
/**
 * Full Best Ball Hype accuracy audit.
 * Re-fetches Sleeper matchups, recomputes every seat/week with two lineup
 * solvers, cross-checks published book + official roster W/L.
 *
 *   node scripts/audit-best-ball-hype.mjs [league_id]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  DATA,
  LEAGUE_ID,
  readUi,
  setLeagueId,
  sleeperGet,
} from "../lib.mjs";
import {
  applyResult,
  emptyRecord,
  optimalLineupFromPoints,
  recordLabel,
  starterSlots,
  weekResultsFromScores,
} from "../lib/best-ball-lineup.mjs";
import { buildBestBallHypeBook } from "../lib/best-ball-hype.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

const OUT_DIR = "/opt/cursor/artifacts";
const FAIL = [];
const WARN = [];
const INFO = [];

function fail(msg) { FAIL.push(msg); }
function warn(msg) { WARN.push(msg); }
function info(msg) { INFO.push(msg); }

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function nearly(a, b, eps = 0.015) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

function posMapFromPlayers(players) {
  const by = Object.create(null);
  for (const [id, row] of Object.entries(players || {})) {
    if (!row || typeof row !== "object") continue;
    const pos = row.position || row.fantasy_positions?.[0] || row.pos;
    if (pos) by[String(id)] = String(pos).toUpperCase();
  }
  return by;
}

function flexEligible(slot) {
  const s = String(slot || "").toUpperCase();
  if (s === "FLEX" || s === "WRRB_FLEX" || s === "REC_FLEX" || s === "WRRBTE_FLEX") {
    return new Set(["RB", "WR", "TE"]);
  }
  if (s === "SUPER_FLEX" || s === "QBFLEX") {
    return new Set(["QB", "RB", "WR", "TE"]);
  }
  return null;
}

/**
 * Independent DP/combinatorial optimal for standard + FLEX slots.
 * Enumerates flex assignments after locking top-N per strict position —
 * then also tries leaving one high player off a strict slot for flex when
 * that would raise total (sanity for greedy bugs).
 */
function optimalLineupIndependent(playersPoints, posById, rosterPositions) {
  const slots = starterSlots(rosterPositions);
  const pool = [];
  for (const [id, raw] of Object.entries(playersPoints || {})) {
    if (!id || id === "0") continue;
    const pts = Number(raw);
    if (!Number.isFinite(pts)) continue;
    let pos = String(posById[id] || posById[String(id)] || "").toUpperCase();
    if (pos === "FB") pos = "RB";
    if (pos === "DST") pos = "DEF";
    if (!pos) continue;
    pool.push({ id: String(id), pts, pos });
  }
  pool.sort((a, b) => b.pts - a.pts || a.id.localeCompare(b.id));

  const strictNeed = Object.create(null);
  const flexSlots = [];
  for (const slot of slots) {
    const flex = flexEligible(slot);
    if (flex) flexSlots.push(flex);
    else {
      const want = String(slot).toUpperCase();
      strictNeed[want] = (strictNeed[want] || 0) + 1;
    }
  }

  // Brute: choose which players start. For dynasty rosters (~25) C(25,13) is large,
  // so use: fill each strict pos with top candidates, then pick flex from remainder;
  // also try swapping one strict bench-candidate into flex when beneficial.
  const byPos = Object.create(null);
  for (const p of pool) {
    if (!byPos[p.pos]) byPos[p.pos] = [];
    byPos[p.pos].push(p);
  }

  function scoreAssignment(chosen) {
    return round2(chosen.reduce((s, p) => s + p.pts, 0));
  }

  // Candidate set per strict position: top need+flexCount to allow swaps.
  const flexN = flexSlots.length;
  const chosenStrict = [];
  const used = new Set();
  for (const [pos, need] of Object.entries(strictNeed)) {
    const cands = (byPos[pos] || []).slice(0, need + flexN + 2);
    for (let i = 0; i < need && i < cands.length; i++) {
      chosenStrict.push(cands[i]);
      used.add(cands[i].id);
    }
  }

  // Flex: best remaining eligible for each flex slot (greedy leftovers).
  const leftovers = pool.filter((p) => !used.has(p.id));
  const flexChosen = [];
  const usedFlex = new Set();
  for (const ok of flexSlots) {
    const hit = leftovers.find((p) => !usedFlex.has(p.id) && ok.has(p.pos));
    if (hit) {
      flexChosen.push(hit);
      usedFlex.add(hit.id);
    }
  }
  let best = scoreAssignment([...chosenStrict, ...flexChosen]);

  // Swap search: for each flex slot, try replacing a marginal strict starter
  // of a flex-eligible position with a higher leftover of another pos.
  // Exhaustive over small candidate sets.
  const strictByPos = Object.create(null);
  for (const p of chosenStrict) {
    if (!strictByPos[p.pos]) strictByPos[p.pos] = [];
    strictByPos[p.pos].push(p);
  }

  // Generate all ways to drop up to flexN strict flex-eligible players and
  // refill from pool (correct for 1–2 FLEX leagues).
  const flexEligiblePos = new Set(["RB", "WR", "TE", "QB"]);
  const dropCands = chosenStrict.filter((p) => flexEligiblePos.has(p.pos));
  const maxDrop = Math.min(flexN, dropCands.length);

  function combinations(arr, k) {
    const out = [];
    function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i < arr.length; i++) {
        cur.push(arr[i]);
        rec(i + 1, cur);
        cur.pop();
      }
    }
    rec(0, []);
    return out;
  }

  for (let k = 0; k <= maxDrop; k++) {
    for (const drop of combinations(dropCands, k)) {
      const dropIds = new Set(drop.map((p) => p.id));
      // After drop, each strict pos must still meet need via replacements from same pos.
      let okStrict = true;
      const kept = chosenStrict.filter((p) => !dropIds.has(p.id));
      const keptUsed = new Set(kept.map((p) => p.id));
      const filled = kept.slice();
      for (const [pos, need] of Object.entries(strictNeed)) {
        const have = filled.filter((p) => p.pos === pos).length;
        if (have > need) { okStrict = false; break; }
        const needMore = need - have;
        const extras = (byPos[pos] || []).filter((p) => !keptUsed.has(p.id) && !dropIds.has(p.id));
        if (extras.length < needMore) { okStrict = false; break; }
        for (let i = 0; i < needMore; i++) {
          filled.push(extras[i]);
          keptUsed.add(extras[i].id);
        }
      }
      if (!okStrict) continue;
      if (filled.length !== chosenStrict.length) continue;

      const rem = pool.filter((p) => !keptUsed.has(p.id));
      // Pick flexN best eligible.
      const flexPick = [];
      const fu = new Set();
      let flexOk = true;
      for (const ok of flexSlots) {
        const hit = rem.find((p) => !fu.has(p.id) && ok.has(p.pos));
        if (!hit) { flexOk = false; break; }
        flexPick.push(hit);
        fu.add(hit.id);
      }
      if (!flexOk && flexSlots.length) continue;
      const total = scoreAssignment([...filled, ...flexPick]);
      if (total > best) best = total;
    }
  }

  return { points: best };
}

async function matchupsFor(leagueId, week) {
  let lastErr = null;
  for (let i = 0; i < 4; i++) {
    try {
      const rows = await sleeperGet(`/league/${leagueId}/matchups/${week}`);
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr || new Error(`matchups ${week}`);
}

function loadPlayers() {
  const path = `${DATA}/players.nfl.json`;
  if (!existsSync(path)) throw new Error("missing players.nfl.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

async function main() {
  const leagueId = LEAGUE_ID;
  const live = await sleeperGet(`/league/${leagueId}`);
  if (!live) throw new Error("league missing");
  const lastScored = Number(live.settings?.last_scored_leg) || 0;
  const rosterPositions = live.roster_positions || [];
  const slots = starterSlots(rosterPositions);
  info(`league ${leagueId} season ${live.season} last_scored=${lastScored}`);
  info(`starter slots (${slots.length}): ${slots.join(",")}`);

  const [rosters, users, players] = await Promise.all([
    sleeperGet(`/league/${leagueId}/rosters`),
    sleeperGet(`/league/${leagueId}/users`),
    Promise.resolve(loadPlayers()),
  ]);
  const posById = posMapFromPlayers(players);
  const nameByUser = Object.create(null);
  for (const u of users || []) {
    nameByUser[String(u.user_id)] =
      (u.metadata && u.metadata.team_name) || u.display_name || String(u.user_id);
  }
  const aliases = (() => {
    try { return JSON.parse(readFileSync(`${DATA}/aliases.overrides.json`, "utf8")); }
    catch { return {}; }
  })();
  Object.assign(nameByUser, aliases);
  const members = readUi("members.json", []) || [];
  for (const m of members) {
    if (m?.user_id && m?.name) nameByUser[String(m.user_id)] = m.name;
  }

  const ownerByRoster = {};
  const official = Object.create(null);
  for (const r of rosters || []) {
    const rid = Number(r.roster_id);
    ownerByRoster[rid] = r.owner_id;
    const s = r.settings || {};
    official[rid] = {
      wins: Number(s.wins) || 0,
      losses: Number(s.losses) || 0,
      ties: Number(s.ties) || 0,
      fpts: Number(s.fpts) || 0,
      fpts_decimal: Number(s.fpts_decimal) || 0,
      name: nameByUser[String(r.owner_id)] || `roster ${rid}`,
    };
  }

  const weeks = [];
  for (let w = 1; w <= lastScored; w++) {
    weeks.push({ week: w, rows: await matchupsFor(leagueId, w) });
  }

  // --- Per-week deep audit ---
  const seatAcc = Object.create(null);
  function seat(rid) {
    if (!seatAcc[rid]) {
      seatAcc[rid] = {
        rid,
        name: official[rid]?.name || `roster ${rid}`,
        bb: emptyRecord(),
        actual: emptyRecord(),
        weeks: [],
        clampWeeks: [],
        missingPos: [],
        greedyVsIndep: [],
      };
    }
    return seatAcc[rid];
  }

  const weekReports = [];

  for (const pack of weeks) {
    const week = pack.week;
    const rows = pack.rows || [];
    const bbScore = Object.create(null);
    const greedyScore = Object.create(null);
    const indepScore = Object.create(null);
    const actualScore = Object.create(null);
    const detail = [];

    for (const row of rows) {
      const rid = Number(row.roster_id);
      if (!Number.isFinite(rid)) continue;
      const actual = Number(row.points);
      if (!Number.isFinite(actual) || actual <= 0) continue;

      const pp = row.players_points || {};
      const missing = [];
      for (const [pid, pts] of Object.entries(pp)) {
        if (!pid || pid === "0") continue;
        if (!Number.isFinite(Number(pts))) continue;
        if (!posById[pid] && !posById[String(pid)]) {
          missing.push({ id: pid, pts: Number(pts) });
        }
      }

      const greedy = optimalLineupFromPoints(pp, posById, rosterPositions);
      const indep = optimalLineupIndependent(pp, posById, rosterPositions);
      const bb = Math.max(greedy.points, actual);

      greedyScore[rid] = greedy.points;
      indepScore[rid] = indep.points;
      actualScore[rid] = actual;
      bbScore[rid] = bb;

      const s = seat(rid);
      if (missing.length) {
        s.missingPos.push({ week, missing });
        warn(`W${week} ${s.name}: ${missing.length} players_points ids missing position (pts sum ${round2(missing.reduce((a, m) => a + m.pts, 0))})`);
      }
      if (!nearly(greedy.points, indep.points)) {
        s.greedyVsIndep.push({ week, greedy: greedy.points, indep: indep.points });
        fail(`W${week} ${s.name}: greedy ${greedy.points} ≠ independent ${indep.points}`);
      }
      if (greedy.points + 0.005 < actual) {
        s.clampWeeks.push({ week, greedy: greedy.points, actual, delta: round2(actual - greedy.points) });
        warn(`W${week} ${s.name}: optimal ${greedy.points} < actual ${actual} — clamped to actual (pos map / slot gap)`);
      }

      detail.push({
        rid,
        name: s.name,
        actual,
        greedy: greedy.points,
        indep: indep.points,
        bb,
        left: round2(Math.max(0, bb - actual)),
        starters: greedy.starters,
        missing_pos_n: missing.length,
      });
    }

    if (Object.keys(bbScore).length < 8) {
      fail(`W${week}: only ${Object.keys(bbScore).length} scored teams — week skipped by builder`);
      weekReports.push({ week, skipped: true, scored: Object.keys(bbScore).length });
      continue;
    }

    // Pair integrity: every matchup_id has exactly 2 scored teams
    const byM = new Map();
    for (const row of rows) {
      if (row?.matchup_id == null) continue;
      if (!byM.has(row.matchup_id)) byM.set(row.matchup_id, []);
      byM.get(row.matchup_id).push(row);
    }
    for (const [mid, group] of byM) {
      const scored = group.filter((r) => Number(r.points) > 0);
      if (scored.length !== 2) {
        warn(`W${week} matchup ${mid}: ${scored.length} scored rows (expected 2)`);
      }
    }

    const bbRes = weekResultsFromScores(rows, (r) => bbScore[Number(r.roster_id)]);
    const actRes = weekResultsFromScores(rows, (r) => actualScore[Number(r.roster_id)]);

    let weekWins = 0;
    let weekLosses = 0;
    let weekTies = 0;
    for (const [rid, res] of bbRes.entries()) {
      if (bbScore[rid] == null) continue;
      const s = seat(rid);
      applyResult(s.bb, res.result, res.score, res.opp);
      const act = actRes.get(rid);
      if (act) applyResult(s.actual, act.result, act.score, act.opp);
      if (res.result === "W") weekWins++;
      else if (res.result === "L") weekLosses++;
      else weekTies++;
      s.weeks.push({
        week,
        result: res.result,
        bb: res.score,
        actual: actualScore[rid],
        left: round2(Math.max(0, bbScore[rid] - actualScore[rid])),
        opp_roster_id: res.opp_roster_id,
        opp_bb: res.opp,
        greedy: greedyScore[rid],
        indep: indepScore[rid],
      });
    }
    if (weekWins !== weekLosses) {
      fail(`W${week}: BB wins ${weekWins} ≠ losses ${weekLosses} (ties ${weekTies})`);
    }

    weekReports.push({
      week,
      scored: Object.keys(bbScore).length,
      wins: weekWins,
      losses: weekLosses,
      ties: weekTies,
      detail: detail.sort((a, b) => b.bb - a.bb),
    });
  }

  // Rebuild book via library and compare to published
  const rebuilt = buildBestBallHypeBook({
    weeks,
    rosterPositions,
    players,
    ownerByRoster,
    nameByUser,
    season: Number(live.season) || live.season,
    week: lastScored,
    leagueId,
    asOf: new Date().toISOString().slice(0, 10),
  });

  const publishedPaths = [
    `data/leagues/${leagueId}/ui/best-ball-hype.json`,
    "data/ui/best-ball-hype.json",
  ];
  let published = null;
  let publishedPath = null;
  for (const p of publishedPaths) {
    if (existsSync(p)) {
      published = JSON.parse(readFileSync(p, "utf8"));
      publishedPath = p;
      break;
    }
  }
  if (!published) fail("no published best-ball-hype.json found");

  // Seat-by-seat compare: audit accumulator vs rebuilt vs published vs official
  const seatReport = [];
  const rids = Object.keys(seatAcc).map(Number).sort((a, b) => a - b);

  for (const rid of rids) {
    const s = seatAcc[rid];
    const off = official[rid];
    const pub = (published?.seats || []).find((x) => Number(x.roster_id) === rid);
    const reb = (rebuilt.seats || []).find((x) => Number(x.roster_id) === rid);

    const row = {
      rid,
      name: s.name,
      bb_record: recordLabel(s.bb),
      bb_pf: s.bb.pf,
      bb_pa: s.bb.pa,
      actual_from_matchups: recordLabel(s.actual),
      actual_pf_matchups: s.actual.pf,
      official_record: off ? recordLabel(off) : null,
      official_fpts: off ? round2(off.fpts + (off.fpts_decimal || 0) / 100) : null,
      published: pub ? {
        record: pub.record,
        pf: pub.pf,
        pa: pub.pa,
        actual_record: pub.actual_record,
        actual_pf: pub.actual_pf,
        delta_wins: pub.delta_wins,
        avg_left_on_bench: pub.avg_left_on_bench,
        weeks: pub.weeks?.length,
      } : null,
      rebuilt: reb ? {
        record: reb.record,
        pf: reb.pf,
        actual_record: reb.actual_record,
        delta_wins: reb.delta_wins,
      } : null,
      clamp_weeks: s.clampWeeks,
      greedy_vs_indep: s.greedyVsIndep,
      week_results: s.weeks.map((w) => `${w.week}${w.result}`).join(" "),
    };

    // Actual matchup W/L must match official Sleeper standings
    if (off) {
      if (s.actual.wins !== off.wins || s.actual.losses !== off.losses || s.actual.ties !== off.ties) {
        fail(`${s.name}: actual from matchups ${recordLabel(s.actual)} ≠ official ${recordLabel(off)}`);
      }
      // PF from matchup points should match official fpts (Sleeper stores fpts + fpts_decimal)
      const offPf = round2(off.fpts + (off.fpts_decimal || 0) / 100);
      if (!nearly(s.actual.pf, offPf, 0.05)) {
        // Some leagues store fpts already with decimals in fpts only
        const alt = round2(off.fpts);
        if (!nearly(s.actual.pf, alt, 0.05)) {
          warn(`${s.name}: matchup PF ${s.actual.pf} vs official fpts ${offPf} (alt ${alt})`);
        }
      }
    }

    if (!reb) fail(`${s.name}: missing from rebuilt book`);
    else {
      if (reb.record !== recordLabel(s.bb) || !nearly(reb.pf, s.bb.pf)) {
        fail(`${s.name}: rebuilt ${reb.record}/${reb.pf} ≠ audit ${recordLabel(s.bb)}/${s.bb.pf}`);
      }
    }

    if (!pub) fail(`${s.name}: missing from published ${publishedPath}`);
    else {
      if (pub.record !== recordLabel(s.bb)) {
        fail(`${s.name}: published BB ${pub.record} ≠ audit ${recordLabel(s.bb)}`);
      }
      if (!nearly(pub.pf, s.bb.pf)) {
        fail(`${s.name}: published PF ${pub.pf} ≠ audit ${s.bb.pf}`);
      }
      if (!nearly(pub.pa, s.bb.pa)) {
        fail(`${s.name}: published PA ${pub.pa} ≠ audit ${s.bb.pa}`);
      }
      if (pub.actual_record !== recordLabel(s.actual)) {
        fail(`${s.name}: published actual ${pub.actual_record} ≠ audit ${recordLabel(s.actual)}`);
      }
      if (!nearly(pub.actual_pf, s.actual.pf)) {
        fail(`${s.name}: published actual PF ${pub.actual_pf} ≠ audit ${s.actual.pf}`);
      }
      if (Number(pub.delta_wins) !== (s.bb.wins - s.actual.wins)) {
        fail(`${s.name}: published delta_wins ${pub.delta_wins} ≠ ${s.bb.wins - s.actual.wins}`);
      }
      if (!Array.isArray(pub.weeks) || pub.weeks.length !== s.weeks.length) {
        fail(`${s.name}: published weeks ${pub.weeks?.length} ≠ audit ${s.weeks.length}`);
      } else {
        for (let i = 0; i < s.weeks.length; i++) {
          const a = s.weeks[i];
          const p = pub.weeks[i];
          if (Number(p.week) !== a.week || p.result !== a.result) {
            fail(`${s.name}: W${a.week} published ${p.week}${p.result} ≠ audit ${a.week}${a.result}`);
          }
          if (!nearly(p.bb, a.bb) || !nearly(p.actual, a.actual)) {
            fail(`${s.name}: W${a.week} scores pub bb=${p.bb}/act=${p.actual} ≠ audit bb=${a.bb}/act=${a.actual}`);
          }
          if (Number(p.opp_roster_id) !== Number(a.opp_roster_id)) {
            fail(`${s.name}: W${a.week} opp ${p.opp_roster_id} ≠ ${a.opp_roster_id}`);
          }
          if (!nearly(p.opp_bb, a.opp_bb)) {
            fail(`${s.name}: W${a.week} opp_bb ${p.opp_bb} ≠ ${a.opp_bb}`);
          }
        }
      }
    }

    // BB PF must equal sum of weekly bb scores
    const sumBb = round2(s.weeks.reduce((a, w) => a + w.bb, 0));
    if (!nearly(sumBb, s.bb.pf)) fail(`${s.name}: sum weekly BB ${sumBb} ≠ PF ${s.bb.pf}`);
    const sumAct = round2(s.weeks.reduce((a, w) => a + w.actual, 0));
    if (!nearly(sumAct, s.actual.pf)) fail(`${s.name}: sum weekly actual ${sumAct} ≠ PF ${s.actual.pf}`);

    // Every week BB >= actual
    for (const w of s.weeks) {
      if (w.bb + 0.005 < w.actual) {
        fail(`${s.name}: W${w.week} BB ${w.bb} < actual ${w.actual}`);
      }
    }

    seatReport.push(row);
  }

  // League-wide: sum BB wins == sum BB losses; published seat count
  const totW = Object.values(seatAcc).reduce((a, s) => a + s.bb.wins, 0);
  const totL = Object.values(seatAcc).reduce((a, s) => a + s.bb.losses, 0);
  const totT = Object.values(seatAcc).reduce((a, s) => a + s.bb.ties, 0);
  if (totW !== totL) fail(`league BB wins ${totW} ≠ losses ${totL}`);
  if ((published?.seats || []).length !== rids.length) {
    fail(`published seats ${(published?.seats || []).length} ≠ audited ${rids.length}`);
  }
  if (Number(published?.week) !== lastScored) {
    warn(`published week ${published?.week} vs live last_scored ${lastScored}`);
  }

  // Rank order check
  const sorted = [...seatReport].sort((a, b) => {
    const aw = a.bb_record.split("-").map(Number);
    const bw = b.bb_record.split("-").map(Number);
    return (bw[0] - aw[0]) || (aw[1] - bw[1]) || (b.bb_pf - a.bb_pf);
  });
  if (published?.seats) {
    for (let i = 0; i < published.seats.length; i++) {
      if (Number(published.seats[i].roster_id) !== sorted[i]?.rid) {
        // only fail if records differ in order significance
        const p = published.seats[i];
        const e = sorted[i];
        if (p && e && (p.record !== e.bb_record || !nearly(p.pf, e.bb_pf))) {
          fail(`rank ${i + 1}: published ${p.name} ${p.record} ≠ expected ${e.name} ${e.bb_record}`);
        }
      }
    }
  }

  const summary = {
    ok: FAIL.length === 0,
    as_of: new Date().toISOString(),
    league_id: String(leagueId),
    season: live.season,
    last_scored: lastScored,
    published_path: publishedPath,
    published_week: published?.week,
    starter_slots: slots,
    fail_n: FAIL.length,
    warn_n: WARN.length,
    fails: FAIL,
    warns: WARN,
    info: INFO,
    seats: seatReport.sort((a, b) => {
      const aw = a.bb_record.split("-").map(Number);
      const bw = b.bb_record.split("-").map(Number);
      return (bw[0] - aw[0]) || (aw[1] - bw[1]) || (b.bb_pf - a.bb_pf);
    }),
    week_board: weekReports.map((w) => ({
      week: w.week,
      skipped: !!w.skipped,
      wins: w.wins,
      losses: w.losses,
      ties: w.ties,
      teams: (w.detail || []).map((d) => ({
        name: d.name,
        bb: d.bb,
        actual: d.actual,
        left: d.left,
        greedy: d.greedy,
        indep: d.indep,
        missing_pos_n: d.missing_pos_n,
      })),
    })),
    totals: { bb_wins: totW, bb_losses: totL, bb_ties: totT },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = `${OUT_DIR}/best-ball-hype-audit.json`;
  writeFileSync(outPath, JSON.stringify(summary, null, 2));

  // Human table
  console.log("\n=== Best Ball Hype audit ===");
  console.log(`season ${live.season} through W${lastScored} | published=${publishedPath}`);
  console.log(
    "name".padEnd(20),
    "BB".padEnd(8),
    "ACT".padEnd(8),
    "OFF".padEnd(8),
    "ΔW".padStart(3),
    "BB-PF".padStart(8),
    "ACT-PF".padStart(8),
    "weeks",
  );
  for (const s of summary.seats) {
    const dW = s.bb_record.split("-")[0] - s.actual_from_matchups.split("-")[0];
    console.log(
      String(s.name).padEnd(20),
      String(s.bb_record).padEnd(8),
      String(s.actual_from_matchups).padEnd(8),
      String(s.official_record || "?").padEnd(8),
      String(dW).padStart(3),
      String(s.bb_pf).padStart(8),
      String(s.actual_pf_matchups).padStart(8),
      s.week_results,
    );
  }
  console.log(`\nfails=${FAIL.length} warns=${WARN.length}`);
  for (const m of FAIL) console.log("FAIL:", m);
  for (const m of WARN) console.log("WARN:", m);
  console.log(`\nwrote ${outPath}`);
  if (FAIL.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
