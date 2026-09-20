#!/usr/bin/env node
/** League overnight letter. Trades + named wire + IR board. Not first-person. */
import { readJson, readUi, setLeagueId, writeUi } from "./lib.mjs";

const leagueId = setLeagueId(process.argv[2] || process.env.LEAGUE_ID);
const ORDS = { 1: "1st", 2: "2nd", 3: "3rd" };
const IR_STATUSES = new Set(["IR", "OUT", "PUP", "NFI"]);
const SKILL = new Set(["QB", "RB", "WR", "TE"]);

function ymd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function prettyAsset(label) {
  const raw = String(label || "").trim();
  const m = raw.match(/^(\d{4})\s+R(\d+)/i);
  if (m) return m[1] + " " + (ORDS[Number(m[2])] || (m[2] + "th"));
  return raw;
}

function tradeLegs(row) {
  return Object.keys((row && row.sides) || {}).map((name) => {
    const bag = row.sides[name] || {};
    return {
      name,
      sent: (bag.out || []).map(prettyAsset).join(" + "),
      got: (bag.in || []).map(prettyAsset).join(" + "),
    };
  });
}

function tradeLine(row) {
  const legs = tradeLegs(row);
  if (!legs.length) return "A trade landed.";
  if (legs.length === 1) {
    return legs[0].name + (legs[0].got ? (" got " + legs[0].got) : " was in a deal");
  }
  return legs.map((leg) => leg.name + " sent " + (leg.sent || "—")).join(" · ");
}

function tradeRecord(row) {
  return {
    date: row.date,
    transaction_id: String(row.transaction_id || ""),
    line: tradeLine(row),
    legs: tradeLegs(row),
  };
}

function dateline(asOf, leagueName) {
  const d = new Date(asOf + "T12:00:00Z");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const name = String(leagueName || "League").replace(/Chunckle/g, "Chunkle");
  return days[d.getUTCDay()] + " " + months[d.getUTCMonth()] + " " + d.getUTCDate() + " · " + name;
}

function ledeFor(trades, wire) {
  const nT = trades.length;
  const nW = wire.length;
  if (nT === 1 && nW) return "1 trade · wire moved";
  if (nT > 1 && nW) return nT + " trades · wire moved";
  if (nT === 1) return "1 trade last night";
  if (nT > 1) return nT + " trades last night";
  if (nW) return "Wire moved · no trades";
  return "Quiet night";
}

function nameByUser(members) {
  return Object.fromEntries(
    (members || []).map((m) => [String(m.user_id), m.canonical_name || m.name || String(m.user_id)]),
  );
}

function rosterIndex(rosters, members) {
  const names = nameByUser(members);
  const byPid = new Map();
  const byRoster = new Map();
  for (const r of rosters || []) {
    const owner = names[String(r.owner_id)] || String(r.owner_id || "");
    byRoster.set(String(r.roster_id), owner);
    const starters = new Set((r.starters || []).map(String));
    const reserve = new Set((r.reserve || []).map(String));
    const taxi = new Set((r.taxi || []).map(String));
    for (const id of [...(r.players || []), ...(r.reserve || []), ...(r.taxi || [])]) {
      if (!id) continue;
      const sid = String(id);
      let slot = "bench";
      if (starters.has(sid)) slot = "starter";
      else if (reserve.has(sid)) slot = "ir";
      else if (taxi.has(sid)) slot = "taxi";
      byPid.set(sid, { owner, slot });
    }
  }
  return { byPid, byRoster };
}

function playerName(id, playersNfl, injury) {
  const p = (playersNfl && playersNfl[id]) || ((injury && injury.players) || {})[id] || {};
  return p.full_name || p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || String(id);
}

function wireLine(row, byRoster, playersNfl, injury) {
  const kind = row.type === "free_agent" ? "FA" : row.type === "commissioner" ? "commish" : "waiver";
  const bags = new Map();
  for (const [pid, rid] of Object.entries(row.adds || {})) {
    const owner = byRoster.get(String(rid)) || "Someone";
    if (!bags.has(owner)) bags.set(owner, { adds: [], drops: [] });
    bags.get(owner).adds.push(playerName(pid, playersNfl, injury));
  }
  for (const [pid, rid] of Object.entries(row.drops || {})) {
    const owner = byRoster.get(String(rid)) || "Someone";
    if (!bags.has(owner)) bags.set(owner, { adds: [], drops: [] });
    bags.get(owner).drops.push(playerName(pid, playersNfl, injury));
  }
  const lines = [...bags.entries()].map(([owner, bag]) => {
    const got = bag.adds.join(" + ");
    const lost = bag.drops.join(" + ");
    if (got && lost) return owner + " " + kind + " claimed " + got + " · dropped " + lost;
    if (got) return owner + " " + kind + " claimed " + got;
    if (lost) return owner + " dropped " + lost;
    return kind + " move";
  });
  return lines.join(" · ") || (kind + " move");
}

function cuffIndex(cuffs) {
  const byStarter = new Map();
  for (const row of (cuffs && cuffs.rows) || []) {
    if (!row || row.starter_id == null) continue;
    byStarter.set(String(row.starter_id), row);
  }
  return byStarter;
}

function attachCuff(row, cuff) {
  if (!cuff) {
    return Object.assign({}, row, { cuff: "", cuff_owner: "", cuff_owned: null });
  }
  return Object.assign({}, row, {
    cuff: cuff.cuff || "",
    cuff_owner: cuff.cuff_owned ? (cuff.cuff_owner || "") : "",
    cuff_owned: !!cuff.cuff_owned,
  });
}

const DESK_STUD = 5500;
const DESK_START = 2200;
const DESK_MID = 1800;
const DESK_SLOTS = { QB: 2, RB: 2, WR: 3, TE: 1 };
const TRADE_LO = 0.55;
const TRADE_HI = 1.8;

function nflName(p, id) {
  return (p && (p.full_name || p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim())) || String(id);
}

function nflPos(p) {
  const pos = (p && (p.position || (p.fantasy_positions || [])[0])) || "";
  return SKILL.has(pos) ? pos : "";
}

function onDepthChart(p) {
  if (!p || !p.team || !nflPos(p)) return false;
  if (p.active === false) return false;
  const st = String(p.status || "");
  if (st === "Inactive" || st === "Retired" || st === "Practice Squad") return false;
  return p.depth_chart_order != null;
}

/** Same NFL team + position, ordered by depth_chart_order. */
function depthLists(playersNfl) {
  const groups = new Map();
  for (const [pid, p] of Object.entries(playersNfl || {})) {
    if (!onDepthChart(p)) continue;
    const pos = nflPos(p);
    const key = `${p.team}|${pos}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      id: String(pid),
      order: Number(p.depth_chart_order),
      name: nflName(p, pid),
      team: p.team,
      pos,
    });
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
  }
  return groups;
}

function nflTeamOf(id, playersNfl, injury) {
  const p = (playersNfl && playersNfl[id]) || {};
  const inj = ((injury && injury.players) || {})[id] || {};
  return p.team || inj.team || "";
}

/**
 * Who takes snaps if this name is out: next 2–3 on the same team/pos chart.
 * If nobody sits behind them, the remaining charted teammates.
 * Empty list = no depth — do not invent unowned.
 */
function beneficiariesFor(id, team, pos, depthGroups, byPid) {
  if (!team || !pos) return [];
  const list = depthGroups.get(`${team}|${pos}`) || [];
  const sid = String(id);
  const idx = list.findIndex((r) => r.id === sid);
  let after = idx >= 0 ? list.slice(idx + 1) : [];
  if (!after.length) after = list.filter((r) => r.id !== sid);
  return after.slice(0, 3).map((r) => {
    const seat = byPid.get(r.id) || { owner: "" };
    return {
      id: r.id,
      name: r.name,
      pos: r.pos || pos,
      owner: seat.owner || "",
      owned: !!(seat.owner),
    };
  });
}

function assetPos(a) {
  if (!a) return "";
  if (a.kind === "pick" || a.pos === "PICK") return "PICK";
  return String(a.pos || "").toUpperCase();
}

function assetVal(a) {
  const n = Number(a && a.value);
  return Number.isFinite(n) ? n : -1;
}

function bagsByOwner(calc, names) {
  const by = new Map();
  const all = ((calc && calc.players) || []).concat((calc && calc.picks) || []);
  for (const a of all) {
    if (!a || a.value == null || !a.owner_id) continue;
    const name = names[String(a.owner_id)] || a.owner || String(a.owner_id);
    if (!by.has(name)) by.set(name, []);
    by.get(name).push(a);
  }
  by.forEach((bag) => bag.sort((x, y) => assetVal(y) - assetVal(x)));
  return by;
}

/** Same cuts as homeDeskProfile / deskCuts — SF dynasty book. */
function bagProfile(bag) {
  const byPos = { QB: [], RB: [], WR: [], TE: [] };
  for (const a of bag || []) {
    const v = assetVal(a);
    if (v < 0) continue;
    const pos = assetPos(a);
    if (byPos[pos]) byPos[pos].push(v);
  }
  const holes = [];
  const thin = [];
  const surplus = [];
  const deep = [];
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const vs = (byPos[pos] || []).filter((x) => x >= DESK_START);
    const mid = (byPos[pos] || []).filter((x) => x >= DESK_MID);
    const slots = DESK_SLOTS[pos];
    const extras = Math.max(0, mid.length - slots);
    if (vs.length < slots) holes.push(pos);
    if (extras >= 1) surplus.push(pos);
    if (extras >= 2) deep.push(pos);
    if (vs.length <= Math.max(0, slots - 1)) thin.push(pos);
  }
  return { holes, thin, surplus, deep };
}

function bagExtras(bag, pos) {
  const slots = DESK_SLOTS[pos] || 1;
  return (bag || []).filter((a) => assetPos(a) === pos && assetVal(a) >= DESK_MID)
    .sort((a, b) => assetVal(b) - assetVal(a))
    .slice(slots);
}

/**
 * Obvious cuff trade only: Sunday starter, other-seat owned beneficiary,
 * hurt seat short that pos after the loss, cuff owner can spare it,
 * leftover vs cuff in the 0.55–1.8 book band. Unowned = no trade.
 */
function proposeTrade(hurt, beneficiaries, bags) {
  if (!hurt || hurt.slot !== "starter" || !hurt.owner) return null;
  const pos = String(hurt.pos || "").toUpperCase();
  if (!SKILL.has(pos)) return null;
  const myBag = bags.get(hurt.owner) || [];
  if (!myBag.length) return null;
  const without = myBag.filter((a) => String(a.sleeper_id) !== String(hurt.id));
  const myProf = bagProfile(without);
  if (!myProf.holes.includes(pos) && !myProf.thin.includes(pos)) return null;
  const owned = (beneficiaries || []).filter((b) => b.owned && b.owner && b.owner !== hurt.owner);
  if (!owned.length) return null;
  const givePos = ["QB", "RB", "WR", "TE"].filter((p) => (
    p !== pos && (myProf.surplus.includes(p) || myProf.deep.includes(p))
  ));
  const leftovers = givePos.flatMap((p) => bagExtras(without, p));
  if (!leftovers.length) return null;
  let best = null;
  for (const cuff of owned) {
    const cuffAsset = (bags.get(cuff.owner) || []).find((a) => String(a.sleeper_id) === String(cuff.id));
    const cuffVal = assetVal(cuffAsset);
    if (cuffVal < DESK_MID) continue;
    const theirBag = bags.get(cuff.owner) || [];
    const theirProf = bagProfile(theirBag);
    if (!theirProf.surplus.includes(pos) && !theirProf.deep.includes(pos)) continue;
    const theirBest = theirBag.find((a) => assetPos(a) === pos);
    if (theirBest && String(theirBest.sleeper_id) === String(cuff.id)) continue;
    for (const left of leftovers) {
      const lv = assetVal(left);
      if (lv < DESK_MID) continue;
      const ratio = lv / cuffVal;
      if (ratio < TRADE_LO || ratio > TRADE_HI) continue;
      const dist = Math.abs(1 - ratio);
      if (!best || dist < best.dist) {
        best = {
          dist,
          trade: {
            send: left.name,
            get: cuff.name,
            get_owner: cuff.owner,
            line: hurt.owner + " send " + left.name + " · get " + cuff.name + " from " + cuff.owner,
          },
        };
      }
    }
  }
  return best ? best.trade : null;
}

function irScore(row) {
  let s = 0;
  if (row.slot === "starter") s += 400;
  else if (row.slot === "ir") s += 20;
  else if (row.slot === "taxi") s -= 800;
  if (row.status === "OUT") s += 120;
  else if (row.status === "IR") s += 60;
  else if (row.status === "PUP" || row.status === "NFI") s += 30;
  if (SKILL.has(row.pos)) s += 80;
  if (row.cuff_owned === false) s += 150;
  s += Math.min(50, Math.round((Number(row.value) || 0) / 200));
  return s;
}

function main() {
  const leagues = readJson("leagues.json", []) || [];
  const members = readJson("members.json", []) || [];
  const rosters = readJson("rosters_now.json", []) || [];
  const tape = readJson("trade_tape.json", []) || [];
  const moves = readJson("moves.json", []) || [];
  const injury = readJson("injury_now.json", { players: {} }) || { players: {} };
  const playersNfl = readJson("players.nfl.json", {}) || {};
  const calc = readUi("calculator.json", { players: [] }) || { players: [] };
  const cuffs = readUi("cuffs.json", { rows: [] }) || { rows: [] };
  const cuffByStarter = cuffIndex(cuffs);
  const valueById = new Map();
  for (const p of calc.players || []) {
    if (p && p.sleeper_id) valueById.set(String(p.sleeper_id), Number(p.value) || 0);
  }
  const asOf = injury.as_of || ymd(Date.now());
  const since = addDays(asOf, -1);
  const leagueName = (leagues[0] && leagues[0].name) || "League";
  const { byPid, byRoster } = rosterIndex(rosters, members);
  const names = nameByUser(members);
  const depthGroups = depthLists(playersNfl);
  const bags = bagsByOwner(calc, names);

  const trades = tape
    .filter((row) => row && String(row.date || "") >= since)
    .map(tradeRecord);

  const latest = tape.length ? tradeRecord(tape[tape.length - 1]) : null;

  const wire = (Array.isArray(moves) ? moves : [])
    .filter((row) => row && String(row.date || "") >= since)
    .map((row) => ({
      date: row.date,
      type: row.type,
      line: wireLine(row, byRoster, playersNfl, injury),
    }))
    .slice(0, 8);

  const board = [];
  for (const [id, p] of Object.entries(injury.players || {})) {
    const status = String((p && p.injury_status) || "").toUpperCase();
    if (!IR_STATUSES.has(status)) continue;
    const seat = byPid.get(String(id)) || { owner: "", slot: "bench" };
    const pos = p.pos || "";
    const team = nflTeamOf(id, playersNfl, injury);
    const row = attachCuff({
      id,
      name: p.name || id,
      owner: seat.owner,
      status,
      pos,
      slot: seat.slot,
      value: valueById.get(String(id)) || 0,
    }, cuffByStarter.get(String(id)));
    row.beneficiaries = beneficiariesFor(id, team, pos, depthGroups, byPid);
    row.trade = proposeTrade(row, row.beneficiaries, bags);
    board.push(row);
  }
  board.sort((a, b) => irScore(b) - irScore(a)
    || String(a.name).localeCompare(String(b.name)));
  const strip = (row) => {
    const { value: _v, trade, ...rest } = row;
    if (trade && trade.line) rest.trade = trade;
    return rest;
  };
  const out = board.filter((p) => p.status === "OUT").map(strip);
  const ir = board.filter((p) => p.status === "IR").map(strip);
  const other = board.filter((p) => p.status !== "OUT" && p.status !== "IR").map(strip);

  const letter = {
    v: 1,
    as_of: asOf,
    since,
    league_id: String(leagueId),
    league_name: leagueName,
    dateline: dateline(asOf, leagueName),
    lede: ledeFor(trades, wire),
    trades,
    latest: trades.length ? null : latest,
    wire,
    out,
    ir,
    other,
    out_n: out.length,
    ir_n: ir.length,
    other_n: other.length,
    board_n: board.length,
    quiet: !trades.length && !wire.length,
  };
  writeUi("overnight.json", letter);
  console.log(JSON.stringify({
    as_of: asOf,
    lede: letter.lede,
    trades: trades.length,
    wire: wire.length,
    out: letter.out_n,
    ir: letter.ir_n,
    other: letter.other_n,
    quiet: letter.quiet,
    benef: board.filter((p) => (p.beneficiaries || []).length).length,
    ideas: board.filter((p) => p.trade && p.trade.line).length,
  }));
}

main();
