#!/usr/bin/env node
/**
 * Build data/ui/cuffs.json — fantasy starter → NFL handcuff → who owns the cuff.
 *
 * For each rostered manager, rank their QB/RB/WR/TE by KTC (fallback: NFL depth),
 * take slot 1 as QB1 / RB1 / WR1 / TE1, then find the next player on that NFL
 * team's depth chart at the same position. Attach fantasy ownership for both.
 *
 * Requires data/players.nfl.json (run ensure-players.mjs / sleeper-sync first).
 *
 *   node build-cuffs.mjs [sleeper_league_id]
 */
import fs from "node:fs";
import {
  CUCKLE_LEAGUE_ID,
  DATA,
  LEAGUE_ID,
  readJson,
  setLeagueId,
  writeUi,
} from "./lib.mjs";

const leagueArg = process.argv[2] && /^\d{6,64}$/.test(process.argv[2])
  ? process.argv[2]
  : LEAGUE_ID || CUCKLE_LEAGUE_ID;
setLeagueId(leagueArg);

const POSITIONS = ["QB", "RB", "WR", "TE"];
const SLOT_OF = { QB: "QB1", RB: "RB1", WR: "WR1", TE: "TE1" };

function loadPlayers() {
  const path = `${DATA}/players.nfl.json`;
  if (!fs.existsSync(path)) {
    throw new Error("data/players.nfl.json missing — run `node ensure-players.mjs` first");
  }
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function playerName(p) {
  if (!p) return null;
  return p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || null;
}

function playerPos(p) {
  if (!p) return null;
  const pos = p.position || (p.fantasy_positions || [])[0] || null;
  return POSITIONS.includes(pos) ? pos : null;
}

/** Active enough to sit on an NFL depth chart (practice squad / inactive drop out). */
function onDepthChart(p) {
  if (!p || !p.team || !playerPos(p)) return false;
  if (p.active === false) return false;
  const st = String(p.status || "");
  if (st === "Inactive" || st === "Retired" || st === "Practice Squad") return false;
  return p.depth_chart_order != null;
}

function buildOwnership() {
  const rosters = readJson("rosters_now.json", []) || [];
  const members = readJson("ui/members.json", []) || [];
  // Prefer league-scoped members when present (writeUi dual-writes for Cuckle).
  const scopedMembersPath = `${DATA}/leagues/${LEAGUE_ID}/ui/members.json`;
  let mem = members;
  if (fs.existsSync(scopedMembersPath)) {
    mem = JSON.parse(fs.readFileSync(scopedMembersPath, "utf8"));
  }
  const nameById = new Map((mem || []).map((m) => [String(m.user_id), m.name]));
  const byPlayer = new Map();
  const byOwner = new Map(); // user_id -> [player_id]
  for (const r of rosters) {
    const uid = r.owner_id ? String(r.owner_id) : null;
    if (!uid) continue;
    if (!byOwner.has(uid)) byOwner.set(uid, []);
    for (const raw of r.players || []) {
      const pid = String(raw);
      if (!byPlayer.has(pid)) {
        byPlayer.set(pid, {
          user_id: uid,
          manager: nameById.get(uid) || uid,
          roster_id: r.roster_id,
        });
      }
      byOwner.get(uid).push(pid);
    }
  }
  return { byPlayer, byOwner, nameById, rosters: rosters.length };
}

function ktcMap() {
  const book = readJson("ktc/latest.json", null);
  const by = new Map();
  for (const p of (book && book.players) || []) {
    if (p.sleeper_id) by.set(String(p.sleeper_id), p);
  }
  return by;
}

/**
 * Same NFL team + position, ordered by depth_chart_order (then name).
 * Used to find who takes snaps if the starter is out.
 */
function depthLists(players) {
  const groups = new Map(); // `${team}|${pos}` -> [{id, order, name, injury, status}]
  for (const [pid, p] of Object.entries(players)) {
    if (!onDepthChart(p)) continue;
    const pos = playerPos(p);
    const key = `${p.team}|${pos}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      id: String(pid),
      order: Number(p.depth_chart_order),
      name: playerName(p),
      injury: p.injury_status || null,
      status: p.status || null,
      team: p.team,
      pos,
    });
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
  }
  return groups;
}

function nextCuff(depthGroups, starterId, team, pos, players) {
  if (!team || !pos) return null;
  const list = depthGroups.get(`${team}|${pos}`) || [];
  const idx = list.findIndex((r) => r.id === String(starterId));
  if (idx >= 0) return list[idx + 1] || null;
  // Starter missing from chart (e.g. no depth_order): pick first charted teammate who is not them.
  const p = players[String(starterId)];
  const order = p && p.depth_chart_order != null ? Number(p.depth_chart_order) : null;
  if (order != null) {
    const after = list.find((r) => r.order > order && r.id !== String(starterId));
    if (after) return after;
  }
  return list.find((r) => r.id !== String(starterId)) || null;
}

function fantasyStartersForOwner(pids, players, ktc) {
  const byPos = Object.create(null);
  for (const pos of POSITIONS) byPos[pos] = [];
  for (const pid of pids) {
    const p = players[pid];
    const pos = playerPos(p);
    if (!pos) continue;
    const k = ktc.get(pid);
    const depth = p && p.depth_chart_order != null ? Number(p.depth_chart_order) : 99;
    const value = k && k.value != null ? Number(k.value) : 0;
    byPos[pos].push({
      id: pid,
      name: playerName(p) || (k && k.name) || pid,
      team: (p && p.team) || (k && k.team) || null,
      pos,
      value,
      depth,
      injury: (p && p.injury_status) || null,
      status: (p && p.status) || null,
    });
  }
  const out = [];
  for (const pos of POSITIONS) {
    const list = byPos[pos];
    // Best fantasy starter = highest KTC; tie-break lower NFL depth, then name.
    list.sort((a, b) => (b.value - a.value) || (a.depth - b.depth) || a.name.localeCompare(b.name));
    if (!list.length) continue;
    const s = list[0];
    out.push({
      ...s,
      slot: SLOT_OF[pos],
      slot_n: 1,
    });
  }
  return out;
}

function build() {
  const players = loadPlayers();
  const { byPlayer, byOwner, nameById, rosters } = buildOwnership();
  const ktc = ktcMap();
  const depthGroups = depthLists(players);
  const rows = [];

  const owners = [...byOwner.keys()].sort((a, b) => {
    const na = nameById.get(a) || a;
    const nb = nameById.get(b) || b;
    return na.localeCompare(nb);
  });

  for (const uid of owners) {
    const ownerName = nameById.get(uid) || uid;
    const starters = fantasyStartersForOwner(byOwner.get(uid) || [], players, ktc);
    for (const s of starters) {
      const cuff = nextCuff(depthGroups, s.id, s.team, s.pos, players);
      const cuffOwn = cuff ? byPlayer.get(cuff.id) : null;
      rows.push({
        slot: s.slot,
        pos: s.pos,
        nfl_team: s.team,
        owner_id: uid,
        owner: ownerName,
        starter_id: s.id,
        starter: s.name,
        starter_injury: s.injury,
        starter_value: s.value || null,
        cuff_id: cuff ? cuff.id : null,
        cuff: cuff ? cuff.name : null,
        cuff_depth: cuff ? cuff.order : null,
        cuff_injury: cuff ? cuff.injury : null,
        cuff_owner_id: cuffOwn ? cuffOwn.user_id : null,
        cuff_owner: cuffOwn ? cuffOwn.manager : null,
        cuff_owned: !!cuffOwn,
        cuff_mine: !!(cuffOwn && cuffOwn.user_id === uid),
      });
    }
  }

  // Stable order: by owner name, then QB→RB→WR→TE.
  const posRank = { QB: 0, RB: 1, WR: 2, TE: 3 };
  rows.sort((a, b) => a.owner.localeCompare(b.owner)
    || (posRank[a.pos] - posRank[b.pos])
    || a.starter.localeCompare(b.starter));

  const book = {
    v: 1,
    as_of: new Date().toISOString().slice(0, 10),
    league_id: LEAGUE_ID,
    slots: ["QB1", "RB1", "WR1", "TE1"],
    note: "Fantasy slot-1 starters (by KTC) → next NFL depth-chart teammate at the same position, plus who owns that cuff.",
    n: rows.length,
    rosters,
    rows,
  };
  writeUi("cuffs.json", book);
  console.log(`cuffs.json: ${rows.length} starter→cuff rows across ${owners.length} seats (${rosters} rosters)`);
  const withCuff = rows.filter((r) => r.cuff_id).length;
  const ownedCuff = rows.filter((r) => r.cuff_owned).length;
  const mineCuff = rows.filter((r) => r.cuff_mine).length;
  console.log(`  with cuff ${withCuff}; cuff rostered ${ownedCuff}; self-cuffed ${mineCuff}`);
}

build();
