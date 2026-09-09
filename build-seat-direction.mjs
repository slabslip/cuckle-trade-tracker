#!/usr/bin/env node
/**
 * Build data/ui/seat-direction.json — last-window tape review per seat.
 *
 * Labels (captions only): Hard rebuild / Rebuild / Win-now / Reload.
 * They do not move a clock, a delta, VA, or calcValueNum.
 *
 *   node build-seat-direction.mjs [sleeper_league_id]
 *
 * Requires calculator.json (run build-calculator.mjs first) plus raw trades / trade_legs.
 */
import fs from "node:fs";
import {
  CUCKLE_LEAGUE_ID,
  DATA,
  LEAGUE_ID,
  leagueRawDir,
  leagueUiDir,
  readJson,
  setLeagueId,
  writeUi,
} from "./lib.mjs";

const leagueArg = process.argv[2] && /^\d{6,64}$/.test(process.argv[2])
  ? process.argv[2]
  : LEAGUE_ID || CUCKLE_LEAGUE_ID;
setLeagueId(leagueArg);

const POSITIONS = ["QB", "RB", "WR", "TE"];
const DESK_STUD = 5500;
const DESK_START = 2200;
const DESK_MID = 1800;
const DESK_SLOTS = { QB: 2, RB: 2, WR: 3, TE: 1 };

function readUiJson(name, fallback) {
  const scoped = `${leagueUiDir()}/${name}`;
  if (fs.existsSync(scoped)) return JSON.parse(fs.readFileSync(scoped, "utf8"));
  const legacy = `${DATA}/ui/${name}`;
  if (fs.existsSync(legacy)) return JSON.parse(fs.readFileSync(legacy, "utf8"));
  return fallback;
}

function loadNfl() {
  const path = `${DATA}/players.nfl.json`;
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function nth(n) {
  const v = Number(n);
  if (!v) return String(n);
  const m = v % 100;
  if (m >= 11 && m <= 13) return `${v}th`;
  return v + ({ 1: "st", 2: "nd", 3: "rd" }[v % 10] || "th");
}

function loadBook() {
  const calc = readUiJson("calculator.json", null);
  if (!calc || !Array.isArray(calc.players)) {
    throw new Error("calculator.json missing — run build-calculator.mjs first");
  }
  const byId = new Map();
  for (const p of calc.players || []) if (p && p.id) byId.set(String(p.id), p);
  for (const p of calc.picks || []) if (p && p.id) byId.set(String(p.id), p);
  return { calc, byId };
}

function posOf(assetKey, book, nfl) {
  const a = book.byId.get(String(assetKey));
  if (a && a.pos && a.pos !== "PICK") return a.pos;
  if (String(assetKey).startsWith("player:")) {
    const pid = String(assetKey).slice(7);
    const p = nfl[pid];
    if (p) {
      const pos = p.position || (p.fantasy_positions || [])[0] || null;
      if (POSITIONS.includes(pos)) return pos;
    }
  }
  return null;
}

function valOf(assetKey, book) {
  const a = book.byId.get(String(assetKey));
  return a && a.value != null ? Number(a.value) : 0;
}

function nameOf(assetKey, label, book, nfl) {
  const a = book.byId.get(String(assetKey));
  if (a && a.name) return a.name;
  if (String(assetKey).startsWith("player:")) {
    const p = nfl[String(assetKey).slice(7)];
    if (p) return p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || label;
  }
  return label || String(assetKey);
}

function pickYearOf(a) {
  if (a && a.year != null && a.year !== "") return Number(a.year);
  const m = String((a && a.id) || "").match(/^pick:(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function heldPicks(bag) {
  let y2026 = 0;
  let y2027 = 0;
  let later = 0;
  let firsts2027 = 0;
  for (const a of bag || []) {
    if (!(a && (a.kind === "pick" || a.pos === "PICK"))) continue;
    const y = pickYearOf(a);
    if (y === 2026) y2026 += 1;
    else if (y === 2027) {
      y2027 += 1;
      if (Number(a.round) === 1) firsts2027 += 1;
    } else if (y >= 2028) later += 1;
  }
  return { y2026, y2027, later, firsts_2027: firsts2027 };
}

function bagAging(bag) {
  let agingRb = 0;
  let agingWr = 0;
  let young = 0;
  let rbVal = 0;
  let playerVal = 0;
  for (const a of bag || []) {
    if (!a || a.kind === "pick" || a.pos === "PICK") continue;
    const v = Number(a.value);
    if (!Number.isFinite(v) || v < 0) continue;
    playerVal += v;
    if (a.pos === "RB") rbVal += v;
    const age = Number(a.age);
    if (!Number.isFinite(age)) continue;
    if (age < 24.5 && v >= DESK_MID) young += 1;
    if (a.pos === "RB" && age >= 27 && v >= DESK_MID) agingRb += 1;
    if (a.pos === "WR" && age >= 28 && v >= DESK_MID) agingWr += 1;
  }
  return { agingRb, agingWr, young, rbShare: playerVal ? rbVal / playerVal : 0 };
}

function paceOf(label, held, aging, pickShare) {
  const later = held.later;
  const n27 = held.y2027;
  const agingN = aging.agingRb + aging.agingWr;
  if (label === "Win-now") {
    if (aging.agingRb >= 2 || agingN >= 3) {
      return { pace: "aging core", pace_why: `${aging.agingRb} aging RB` };
    }
    if (n27 <= 1 && later <= 1) {
      return { pace: "thin later", pace_why: `${n27} 2027s` };
    }
    return { pace: "window now", pace_why: `${n27} 2027s` };
  }
  if (label === "Hard rebuild" || label === "Rebuild") {
    if (n27 >= 6 || (n27 >= 4 && pickShare >= 0.30)) {
      return { pace: "short", pace_why: `${n27} 2027s` };
    }
    if (n27 <= 2 && pickShare < 0.25) {
      return { pace: "starved", pace_why: `${n27} 2027s` };
    }
    if (pickShare >= 0.35) return { pace: "pick-rich", pace_why: `${n27} 2027s` };
    if (n27 <= 2 && later >= 3) return { pace: "long", pace_why: `${later} later picks` };
    return { pace: "long", pace_why: `${n27} 2027s` };
  }
  if (n27 <= 1 && pickShare <= 0.20) return { pace: "pick-poor", pace_why: `${n27} 2027s` };
  if (agingN >= 3 || aging.agingRb >= 2) {
    return { pace: "aging core", pace_why: `${aging.agingRb} aging RB` };
  }
  if (n27 >= 4 && agingN <= 1) return { pace: "quick", pace_why: `${n27} 2027s` };
  if (n27 <= 2 && later >= 4) return { pace: "long", pace_why: `${later} later picks` };
  return { pace: "steady", pace_why: `${n27} 2027s` };
}

function bagProfile(bag) {
  let total = 0;
  let stud = 0;
  let pick = 0;
  const byPos = { QB: [], RB: [], WR: [], TE: [] };
  for (const a of bag || []) {
    const v = Number(a && a.value);
    if (!Number.isFinite(v) || v < 0) continue;
    total += v;
    const isPick = a.kind === "pick" || a.pos === "PICK";
    if (isPick) pick += v;
    else {
      if (v >= DESK_STUD) stud += v;
      if (byPos[a.pos]) byPos[a.pos].push(v);
    }
  }
  const holes = [];
  const thin = [];
  const surplus = [];
  const deep = [];
  for (const pos of POSITIONS) {
    const vs = (byPos[pos] || []).filter((x) => x >= DESK_START);
    const mid = (byPos[pos] || []).filter((x) => x >= DESK_MID);
    const slots = DESK_SLOTS[pos];
    const extras = Math.max(0, mid.length - slots);
    if (vs.length < slots) holes.push(pos);
    if (vs.length <= Math.max(0, slots - 1)) thin.push(pos);
    if (extras >= 1) surplus.push(pos);
    if (extras >= 2) deep.push(pos);
  }
  return {
    pickShare: total ? pick / total : 0,
    studShare: total ? stud / total : 0,
    holes,
    thin,
    surplus,
    deep,
  };
}

function netNoChurn(arrIn, arrOut) {
  const outKeys = new Set(arrOut.map((x) => x.key));
  const inKeys = new Set(arrIn.map((x) => x.key));
  return {
    inN: arrIn.filter((x) => !outKeys.has(x.key)),
    outN: arrOut.filter((x) => !inKeys.has(x.key)),
  };
}

function windowYears(trades, members) {
  const placeSeason = Math.max(
    0,
    ...((members || []).map((m) => Number(m.place_season) || 0)),
  );
  const latestTrade = Math.max(0, ...((trades || []).map((t) => Number(t.season) || 0)));
  const end = Math.max(placeSeason + 1, latestTrade, 2026);
  return [end - 2, end - 1, end];
}

function intentFor(label, soldPos, holes, thin, surplus, deep, flow) {
  if (label === "Hard rebuild" || label === "Rebuild") {
    return {
      buy: ["picks", "young"],
      sell: soldPos.map((p) => `${p} leftover`),
      refuse: soldPos.map((p) => `${p} starter`),
    };
  }
  if (label === "Win-now") {
    const buy = [...new Set([...(holes || []), ...(thin || [])])];
    const sell = [];
    if ((flow.picksOut || 0) > 0) sell.push("picks");
    return { buy, sell, refuse: [] };
  }
  const buy = [];
  const sell = [];
  for (const pos of POSITIONS) {
    const need = (holes || []).includes(pos) || (thin || []).includes(pos);
    const give = (surplus || []).includes(pos) || (deep || []).includes(pos);
    const bought = ((flow.byPos[pos] && flow.byPos[pos].in) || []).length > 0;
    const sold = ((flow.byPos[pos] && flow.byPos[pos].out) || []).length > 0;
    if (need && bought) buy.push(pos);
    if (give && sold) sell.push(pos);
  }
  if ((flow.picksOut || 0) > 0 && (flow.picksIn || 0) > 0) sell.push("picks");
  return { buy, sell, refuse: [] };
}

function build() {
  const members = (readUiJson("members.json", []) || []).slice()
    .sort((a, b) => (a.place || 99) - (b.place || 99));
  if (!members.length) throw new Error("members.json missing");
  const trades = readJson("trades.json", []) || [];
  const legs = readJson("trade_legs.json", []) || [];
  if (!fs.existsSync(`${leagueRawDir()}/trades.json`) && !trades.length) {
    const legacyTrades = `${DATA}/trades.json`;
    if (!fs.existsSync(legacyTrades)) throw new Error("trades.json missing");
  }
  const nfl = loadNfl();
  const book = loadBook();
  const years = windowYears(trades, members);
  const windowSet = new Set(years.map(String));
  const tradeBy = new Map((trades || []).map((t) => [String(t.transaction_id), t]));

  const bags = new Map();
  for (const m of members) bags.set(String(m.user_id), []);
  for (const a of (book.calc.players || []).concat(book.calc.picks || [])) {
    if (!a || a.value == null || !a.owner_id) continue;
    const uid = String(a.owner_id);
    if (!bags.has(uid)) bags.set(uid, []);
    bags.get(uid).push(a);
  }

  const seats = members.map((m) => {
    const uid = String(m.user_id);
    const prof = bagProfile(bags.get(uid) || []);
    const inP = [];
    const outP = [];
    const inPick = [];
    const outPick = [];
    for (const l of legs) {
      const t = tradeBy.get(String(l.transaction_id));
      if (!t || !windowSet.has(String(t.season))) continue;
      const isIn = l.direction === "in" && String(l.to_user_id) === uid;
      const isOut = l.direction === "out" && String(l.from_user_id) === uid;
      if (!isIn && !isOut) continue;
      const item = {
        key: String(l.asset_key),
        kind: l.kind,
        season: String(t.season),
        pos: posOf(l.asset_key, book, nfl),
        val: valOf(l.asset_key, book),
        name: nameOf(l.asset_key, l.label, book, nfl),
        year: l.pick && l.pick.season != null ? Number(l.pick.season) : null,
        round: l.pick && l.pick.round != null ? Number(l.pick.round) : null,
      };
      if (l.kind === "pick") (isIn ? inPick : outPick).push(item);
      else (isIn ? inP : outP).push(item);
    }
    const players = netNoChurn(inP, outP);
    const byPos = {};
    for (const pos of POSITIONS) {
      const inn = players.inN.filter((x) => x.pos === pos);
      const out = players.outN.filter((x) => x.pos === pos);
      byPos[pos] = {
        in: inn.map((x) => x.name),
        out: out.map((x) => x.name),
        studIn: inn.filter((x) => x.val >= DESK_STUD).map((x) => x.name),
        studOut: out.filter((x) => x.val >= DESK_STUD).map((x) => x.name),
      };
    }
    const soldStudNoBuy = POSITIONS.filter(
      (p) => byPos[p].studOut.length && !byPos[p].studIn.length,
    );
    const soldPos = [];
    const bottomFour = Number(m.place) >= 8 && Number(m.place) <= 10;
    for (const pos of POSITIONS) {
      const soldN = outP.filter((x) => x.pos === pos).length;
      if (soldN >= 2 || (soldN >= 1 && bottomFour)) soldPos.push(pos);
    }
    const p27in = inPick.filter((x) => x.year >= 2027).length;
    const p27out = outPick.filter((x) => x.year >= 2027).length;
    const net2027 = p27in - p27out;
    const firstsIn = inPick.filter((x) => x.round === 1).length;
    const firstsOut = outPick.filter((x) => x.round === 1).length;
    const votes = [];
    if (Number(m.place) >= 8 && Number(m.place) <= 10) votes.push("place");
    if (prof.pickShare >= 0.30) votes.push("picks");
    if (net2027 >= 2) votes.push("net_2027");
    if (soldStudNoBuy.length) votes.push("sold_stud");
    let label = "Reload";
    if (votes.length >= 2) label = "Hard rebuild";
    else if (prof.pickShare >= 0.28 || soldStudNoBuy.length >= 2) label = "Rebuild";
    else if (
      Number(m.place) >= 1 && Number(m.place) <= 4
      && prof.pickShare <= 0.22
      && !soldStudNoBuy.length
    ) label = "Win-now";

    const studsOut = [];
    const studsIn = [];
    for (const pos of POSITIONS) {
      for (const n of byPos[pos].studOut) if (!studsOut.includes(n)) studsOut.push(n);
      for (const n of byPos[pos].studIn) if (!studsIn.includes(n)) studsIn.push(n);
    }
    studsOut.sort((a, b) => {
      const va = players.outN.find((x) => x.name === a);
      const vb = players.outN.find((x) => x.name === b);
      return (vb && vb.val ? vb.val : 0) - (va && va.val ? va.val : 0);
    });

    const flow = {
      picksIn: inPick.length,
      picksOut: outPick.length,
      byPos,
    };
    const intent = intentFor(label, soldPos, prof.holes, prof.thin, prof.surplus, prof.deep, flow);

    const held = heldPicks(bags.get(uid) || []);
    const aging = bagAging(bags.get(uid) || []);
    const pace = paceOf(label, held, aging, prof.pickShare);

    const whyBits = [];
    if (m.place && m.place_season) whyBits.push(`${nth(m.place)} in ${m.place_season}`);
    if (studsOut[0]) whyBits.push(`sold ${studsOut[0]}`);
    whyBits.push(`${held.y2027} 2027s`);
    if (pace.pace) whyBits.push(pace.pace);

    const byPosOut = {};
    for (const pos of POSITIONS) {
      byPosOut[pos] = { in: byPos[pos].in, out: byPos[pos].out };
    }

    return {
      seat_user_id: uid,
      name: m.name,
      place: Number(m.place) || 0,
      place_season: String(m.place_season || years[1]),
      label,
      votes,
      why: whyBits.join(" · "),
      pick_share: Math.round(prof.pickShare * 1000) / 1000,
      stud_share: Math.round(prof.studShare * 1000) / 1000,
      holes: prof.holes,
      thin: prof.thin,
      sold_pos: soldPos,
      buy: intent.buy,
      sell: intent.sell,
      refuse: intent.refuse,
      picks: {
        in: inPick.length,
        out: outPick.length,
        firsts_in: firstsIn,
        firsts_out: firstsOut,
        net_2027_plus: net2027,
        held_2026: held.y2026,
        held_2027: held.y2027,
        held_later: held.later,
        firsts_2027: held.firsts_2027,
      },
      pace: pace.pace,
      pace_why: pace.pace_why,
      aging: {
        rb: aging.agingRb,
        wr: aging.agingWr,
        young: aging.young,
        rb_share: Math.round(aging.rbShare * 1000) / 1000,
      },
      by_pos: byPosOut,
      studs: { in: studsIn, out: studsOut },
    };
  });

  const asof = (book.calc && book.calc.as_of) || new Date().toISOString().slice(0, 10);
  const out = { v: 1, asof, window: years, seats };
  writeUi("seat-direction.json", out);
  const hard = seats.filter((s) => s.label === "Hard rebuild").map((s) => s.name);
  console.log(`seat-direction: ${seats.length} seats, window ${years.join("-")}, Hard rebuild: ${hard.join(", ") || "none"}`);
}

build();
