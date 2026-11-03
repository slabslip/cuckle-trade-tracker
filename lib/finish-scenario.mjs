/**
 * Named finish scenarios for Expected Finish + Best Ball Hype.
 *
 * Truman 4-of-6 into playoffs (after official W8 at 4-4 → finishes 8-6):
 *   W  Bubba, Berg, ARae, Gumby
 *   L  Ted, Henry
 * That path locks a Championship-bracket (Top 6) cut in a 10-team league.
 */

export const TRUMAN_4OF6 = {
  id: "truman_4of6",
  label: "Truman wins 4 of last 6 into playoffs",
  // Prefer beatable / peer wins; drop the two elite matchups.
  wins_vs: ["BubbaCuckShremp", "bigjberg", "ARae", "ChiefGumby"],
  losses_vs: ["TedCumberbatch", "KingHenryXXVI"],
};

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameOf(rid, ownerByRoster, nameByUser) {
  const uid = ownerByRoster[rid] ?? ownerByRoster[String(rid)];
  return (uid != null && nameByUser[String(uid)]) || `roster ${rid}`;
}

function findRidByName(ownerByRoster, nameByUser, want) {
  const target = norm(want);
  for (const key of Object.keys(ownerByRoster || {})) {
    const rid = Number(key);
    if (!Number.isFinite(rid)) continue;
    if (norm(nameOf(rid, ownerByRoster, nameByUser)).includes(target)
      || target.includes(norm(nameOf(rid, ownerByRoster, nameByUser)))) {
      return rid;
    }
  }
  // Loose contains on aliases / display.
  for (const key of Object.keys(ownerByRoster || {})) {
    const rid = Number(key);
    const n = norm(nameOf(rid, ownerByRoster, nameByUser));
    if (n.includes(target.slice(0, 6)) || target.includes(n.slice(0, 6))) return rid;
  }
  return null;
}

/**
 * Resolve Truman 4-of-6 forced matchups from the remaining RS schedule.
 * @returns {{ note: string, truman_roster_id: number, forced: Array<{week:number,winner:number,loser:number,lab:string}>, final_record: string } | null}
 */
export function resolveTrumanFourOfSix(opts) {
  const ownerByRoster = opts.ownerByRoster || {};
  const nameByUser = opts.nameByUser || {};
  const schedule = opts.schedule || []; // [{week, a, b}]
  const trumanRid = findRidByName(ownerByRoster, nameByUser, "TrumanCooper")
    ?? findRidByName(ownerByRoster, nameByUser, "Truman");
  if (trumanRid == null) return null;

  const winSet = new Set(TRUMAN_4OF6.wins_vs.map(norm));
  const lossSet = new Set(TRUMAN_4OF6.losses_vs.map(norm));
  const forced = [];
  for (const g of schedule) {
    const week = Number(g.week);
    const a = Number(g.a);
    const b = Number(g.b);
    if (!week || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a !== trumanRid && b !== trumanRid) continue;
    const opp = a === trumanRid ? b : a;
    const oppName = nameOf(opp, ownerByRoster, nameByUser);
    const key = norm(oppName);
    let trumanWins = null;
    for (const w of winSet) {
      if (key.includes(w) || w.includes(key)) { trumanWins = true; break; }
    }
    if (trumanWins == null) {
      for (const w of lossSet) {
        if (key.includes(w) || w.includes(key)) { trumanWins = false; break; }
      }
    }
    if (trumanWins == null) continue;
    const winner = trumanWins ? trumanRid : opp;
    const loser = trumanWins ? opp : trumanRid;
    forced.push({
      week,
      winner,
      loser,
      lab: trumanWins
        ? (`Truman W vs ${oppName}`)
        : (`Truman L vs ${oppName}`),
    });
  }
  const wins = forced.filter((f) => f.winner === trumanRid).length;
  const losses = forced.filter((f) => f.loser === trumanRid).length;
  // Need the full 4-of-6 path; skip if the schedule/names don't resolve.
  if (wins !== 4 || losses !== 2 || forced.length !== 6) return null;
  return {
    id: TRUMAN_4OF6.id,
    note: `${TRUMAN_4OF6.label}: ${forced.map((f) => f.lab).join("; ")} → scenario ${wins}-${losses} rest (finishes ${4 + wins}-${4 + losses} from 4-4).`,
    truman_roster_id: trumanRid,
    forced,
    rest_record: `${wins}-${losses}`,
    final_from_4_4: `${4 + wins}-${4 + losses}`,
  };
}

/** Apply forced W/L onto a week's score map (mutates). */
export function applyForcedScores(scoreByRid, forcedForWeek) {
  for (const f of forcedForWeek || []) {
    const w = Number(f.winner);
    const l = Number(f.loser);
    if (!Number.isFinite(w) || !Number.isFinite(l)) continue;
    const wp = Number(scoreByRid[w]) || 0;
    const lp = Number(scoreByRid[l]) || 0;
    if (wp > lp) continue;
    // Nudge winner ahead while keeping magnitudes plausible.
    const base = Math.max(wp, lp, 100);
    scoreByRid[w] = Math.round((base + 12.5) * 100) / 100;
    scoreByRid[l] = Math.round((base - 8.5) * 100) / 100;
  }
  return scoreByRid;
}

export function forcedForWeek(scenario, week) {
  if (!scenario || !Array.isArray(scenario.forced)) return [];
  return scenario.forced.filter((f) => Number(f.week) === Number(week));
}

/** True when roster_id is forced to win this week under the scenario. */
export function forcedWinnerOf(scenario, week, rosterA, rosterB) {
  const hits = forcedForWeek(scenario, week);
  for (const f of hits) {
    if ((f.winner === rosterA && f.loser === rosterB)
      || (f.winner === rosterB && f.loser === rosterA)) {
      return f.winner;
    }
  }
  return null;
}
