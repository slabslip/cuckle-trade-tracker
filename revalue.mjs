#!/usr/bin/env node
/** Rebuild meters. Incomplete ≠ zero. No silent Mid. Readable pick lines. */
import { pickTier, readJson, roundName, writeJson, writeUi } from "./lib.mjs";

const TEAMS = 10;
const MIN_ACTIVE = 300;
const FLAT_SCALE = 10000;
// ponytail: blend fitted to 12 KTC names (2026-08-28). Top stays near raw DP; bottom lifts. Hill will stay high vs KTC — DP ranks him 285, KTC 1069.
const FLAT_EXP = 0.3;
const FLAT_TOP_MIX = 0.5;
// ponytail: pinned calibration tape. Swap IDs here, not a CMS.
const REVIEW_IDS = [
  "460470201385742336",
  "471856282999975936",
  "641429892827013120",
  "701112437734211584",
  "826292607033421824",
  "1008489561648959488",
  "1167606865556242432",
  "1178835654515593216",
  "1269369347395026944",
  "1397412606653767680",
];

function indexCurve(curve) {
  const map = new Map();
  for (const row of curve) {
    if (!map.has(row.asset_key)) map.set(row.asset_key, []);
    map.get(row.asset_key).push(row);
  }
  for (const rows of map.values()) rows.sort((a, b) => a.as_of.localeCompare(b.as_of));
  return map;
}

function asofRow(index, key, asOf) {
  const rows = index.get(key);
  if (!rows) return null;
  let best = null;
  for (const row of rows) if (row.as_of <= asOf) best = row;
  return best;
}

function asofRowNear(index, key, asOf) {
  return asofRow(index, key, asOf) || index.get(key)?.[0] || null;
}

function playerValue(index, key, asOf) {
  const hit = asofRow(index, key, asOf);
  if (hit) return { value: hit.value, flag: null, priced_as: key, as_of: hit.as_of };
  const rows = index.get(key);
  if (rows?.length) {
    const last = rows[rows.length - 1];
    if (last.as_of < asOf) {
      return { value: 0, flag: "off_board", priced_as: key, as_of: last.as_of };
    }
  }
  return { value: null, flag: "unpriced", priced_as: key, as_of: null };
}

function pickKeys(year, round, slot) {
  const keys = [];
  if (slot) {
    keys.push(`pickval:${year}:${round}:${Number(slot)}`);
    keys.push(`pickval:${year}:${round}:${pickTier(slot, TEAMS)}`);
  }
  keys.push(`pickval:${year}:${round}:Mid`);
  keys.push(`pickval:${year}:${round}:Early`);
  keys.push(`pickval:${year}:${round}:Late`);
  return keys;
}

function pickValueAt(index, year, round, slot, asOf) {
  const y = String(year);
  const r = Number(round);
  if (slot) {
    const exactKey = `pickval:${y}:${r}:${Number(slot)}`;
    const exact = asofRowNear(index, exactKey, asOf);
    if (exact) return { value: exact.value, flag: null, priced_as: exactKey, as_of: exact.as_of };
    const wanted = pickTier(slot, TEAMS);
    const tierKey = `pickval:${y}:${r}:${wanted}`;
    const tier = asofRowNear(index, tierKey, asOf);
    if (tier) return { value: tier.value, flag: null, priced_as: tierKey, as_of: tier.as_of };
    return { value: null, flag: "unpriced", priced_as: tierKey, as_of: null };
  }
  const midKey = `pickval:${y}:${r}:Mid`;
  const mid = asofRowNear(index, midKey, asOf);
  if (mid) return { value: mid.value, flag: "priced_as_mid", priced_as: midKey, as_of: mid.as_of };
  return { value: null, flag: "unpriced", priced_as: midKey, as_of: null };
}

let _pickYears = null;
let _pickMaxRound = null;
function pickBoardYears(index) {
  if (_pickYears) return _pickYears;
  const ys = new Set();
  let maxR = 0;
  for (const key of index.keys()) {
    if (!key.startsWith("pickval:")) continue;
    const p = key.split(":");
    ys.add(Number(p[1]));
    maxR = Math.max(maxR, Number(p[2]) || 0);
  }
  _pickYears = [...ys].sort((a, b) => a - b);
  _pickMaxRound = maxR || 4;
  return _pickYears;
}

// ponytail: DP has no 2019/2029 rows and no 5th+. Closest year, then deepest round on the board.
function pickValue(index, year, round, slot, asOf) {
  const y0 = Number(year);
  const r0 = Number(round);
  const years = pickBoardYears(index).slice().sort((a, b) => {
    const d = Math.abs(a - y0) - Math.abs(b - y0);
    return d || a - b;
  });
  const tryRound = (r) => {
    const useSlot = r === r0 ? slot : null;
    for (const y of years) {
      const hit = pickValueAt(index, y, r, useSlot, asOf);
      if (hit.value == null) continue;
      if (y === y0 && r === r0) return hit;
      return { ...hit, flag: r === r0 ? `priced_as_${y}` : `priced_as_${y}r${r}` };
    }
    return null;
  };
  return tryRound(r0) || tryRound(_pickMaxRound)
    || { value: null, flag: "unpriced", priced_as: `pickval:${year}:${round}:Mid`, as_of: null };
}

function latestAsOf(curve) {
  let max = "1970-01-01";
  for (const row of curve) if (row.as_of > max) max = row.as_of;
  return max;
}

function resIndex(resolutions) {
  const map = new Map();
  for (const r of resolutions) {
    if (!map.has(r.pick_key)) map.set(r.pick_key, []);
    map.get(r.pick_key).push(r);
  }
  for (const rows of map.values()) rows.sort((a, b) => a.as_of.localeCompare(b.as_of));
  return map;
}

function latestRes(index, pickKey, asOf, kind) {
  const rows = index.get(pickKey);
  if (!rows) return null;
  let best = null;
  for (const r of rows) if (r.kind === kind && r.as_of <= asOf) best = r;
  return best;
}

function pickDisplay(year, round, origin, became, draftedBy) {
  const rnd = roundName(round);
  if (became) {
    return `${year} ${rnd} · became ${became}${draftedBy ? ` (${draftedBy})` : ""}`;
  }
  return `${year} ${rnd}${origin ? ` (${origin})` : ""}`;
}

function priceLeg(leg, asOf, lens, ctx) {
  const { curveIdx, resIdx, nameById, originOf } = ctx;
  if (leg.kind === "player") {
    const priced = playerValue(curveIdx, leg.asset_key, asOf);
    return { ...priced, display: leg.label };
  }
  const [, year, round] = leg.asset_key.split(":");
  const playerRes = latestRes(resIdx, leg.asset_key, asOf, "player");
  const slotRes = latestRes(resIdx, leg.asset_key, asOf, "slot");
  const slot = slotRes?.draft_slot ?? null;
  const origin = originOf(leg);
  const draftedBy = playerRes?.drafted_by_user_id
    ? (nameById[playerRes.drafted_by_user_id] || playerRes.drafted_by_user_id)
    : null;

  if (lens === "realized" && playerRes) {
    const priced = playerValue(curveIdx, playerRes.player_key, asOf);
    return {
      ...priced,
      display: pickDisplay(year, round, origin, playerRes.label, draftedBy),
      became: playerRes.label,
      drafted_by: draftedBy,
    };
  }
  const priced = pickValue(curveIdx, year, Number(round), slot, asOf);
  const became = playerRes && lens === "pick" ? playerRes.label : null;
  return {
    ...priced,
    display: pickDisplay(year, round, origin, became, became ? draftedBy : null),
    became,
    drafted_by: draftedBy,
  };
}

function yearEnds(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4));
  const ty = Number(to.slice(0, 4));
  while (y < ty) {
    const day = `${y}-12-31`;
    if (day >= from && day <= to) out.push(day);
    y += 1;
  }
  if (!out.includes(to)) out.push(to);
  return out;
}

function addYears(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return `${y + n}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

function windowAsOfs(t0, today, years) {
  const end = years == null ? today : (addYears(t0, years) < today ? addYears(t0, years) : today);
  return yearEnds(t0, end);
}

function floorActive(v) {
  return v < MIN_ACTIVE ? 0 : v;
}

function indexVmax(curve) {
  const by = new Map();
  for (const r of curve) {
    if (r.value == null) continue;
    const prev = by.get(r.as_of) || 0;
    if (r.value > prev) by.set(r.as_of, r.value);
  }
  return { by, dates: [...by.keys()].sort() };
}

function vmaxAt(idx, asOf) {
  let v = null;
  for (const d of idx.dates) {
    if (d <= asOf) v = idx.by.get(d);
  }
  if (v == null && idx.dates.length) v = idx.by.get(idx.dates[0]);
  return v || FLAT_SCALE;
}

function flatten(v, top) {
  if (v == null) return null;
  if (v <= 0) return 0;
  const t = v / top;
  const w = t ** FLAT_TOP_MIX;
  return Math.round(FLAT_SCALE * (w * t + (1 - w) * (t ** FLAT_EXP)));
}

function flattenLegs(legs, top) {
  return (legs || []).map((l) => ({ ...l, value: flatten(l.value, top) }));
}

// ponytail: year-end (+ today if inside the window) only, not monthly. Monthly if a mid-year crash must count.
function y3Snaps(leg, dates, ctx) {
  const snaps = [];
  for (const d of dates) {
    const priced = priceLeg(leg, d, "realized", ctx);
    if (priced.value == null) continue;
    const raw = priced.value;
    const dead = leg.kind === "player" && raw < MIN_ACTIVE;
    const top = vmaxAt(ctx.vmaxIdx, d);
    const even = flatten(dead ? 0 : raw, top);
    snaps.push({
      raw,
      floored: dead ? 0 : raw,
      even,
    });
  }
  return snaps;
}

function y3Score(leg, dates, today, ctx) {
  const snaps = y3Snaps(leg, dates, ctx);
  const display = priceLeg(leg, today, "realized", ctx);
  if (!snaps.length) return { ...display, value: null, flag: "unpriced" };
  const value = snaps.reduce((a, s) => a + s.even, 0) / snaps.length;
  return { ...display, value };
}

function bagAtEven(legs, uid, asOf, ctx, which) {
  const raw = bagFor(legs, uid, asOf, "pick", ctx, which);
  const top = vmaxAt(ctx.vmaxIdx, asOf);
  const graded = flattenLegs(raw.legs, top);
  return {
    points: graded.reduce((a, l) => a + (l.value || 0), 0),
    unpriced: raw.unpriced,
    legs: graded,
  };
}

function bagY3(legs, uid, dates, today, ctx, which) {
  const mine = which === "in"
    ? legs.filter((l) => l.direction !== "out" && l.to_user_id === uid)
    : legs.filter((l) => l.direction === "out" && l.from_user_id === uid);
  let points = 0;
  let unpriced = 0;
  const rows = [];
  for (const leg of mine) {
    const priced = y3Score(leg, dates, today, ctx);
    rows.push(compactLeg({ ...leg, ...priced }));
    if (priced.value == null) unpriced += 1;
    else points += priced.value;
  }
  return { points, unpriced, legs: rows };
}

function compactLeg(l) {
  return {
    label: l.display || l.label,
    kind: l.kind,
    asset_key: l.asset_key || null,
    value: l.value,
    flag: l.flag,
    became: l.became || null,
    drafted_by: l.drafted_by || null,
  };
}

function nowPoints(legs, tradeYear) {
  let now = 0, priced = 0;
  for (const l of legs) {
    if (l.value == null) continue;
    priced += l.value;
    if (l.kind === "player") now += l.value;
    else if (l.kind === "pick") {
      const y = Number((l.asset_key || "").split(":")[1]);
      if (y && y <= tradeYear) now += l.value;
    }
  }
  return { now, priced };
}

// ponytail: 0.55/0.45 is the label cut, not a third score. Tune if a team sits on the fence.
function styleLabel(nowShare, horizon) {
  if (nowShare == null || horizon == null) return null;
  if (nowShare >= 0.55 && horizon <= 0) return "Win-now";
  if (nowShare <= 0.45 && horizon > 0) return "Investor";
  return "Balanced";
}

function styleOf(nowGot, nowPriced, horizons, soldPicks, soldPlayers) {
  const nowShare = nowPriced ? nowGot / nowPriced : null;
  const horizon = horizons.length ? horizons.reduce((a, b) => a + b, 0) / horizons.length : null;
  return {
    label: styleLabel(nowShare, horizon),
    now_share: nowShare,
    horizon,
    sold_picks_for_players: soldPicks,
    sold_players_for_picks: soldPlayers,
  };
}

function bagFor(legs, uid, asOf, lens, ctx, which) {
  const mine = which === "in"
    ? legs.filter((l) => l.direction !== "out" && l.to_user_id === uid)
    : legs.filter((l) => l.direction === "out" && l.from_user_id === uid);
  let points = 0;
  let unpriced = 0;
  const rows = [];
  for (const leg of mine) {
    const priced = priceLeg(leg, asOf, lens, ctx);
    rows.push(compactLeg({ ...leg, ...priced }));
    if (priced.value == null) unpriced += 1;
    else points += priced.value;
  }
  return { points, unpriced, legs: rows };
}

function check(name, cond) {
  if (!cond) throw new Error(`self-check failed: ${name}`);
}

function slimCurve(curve, keys) {
  return curve.filter((r) => keys.has(r.asset_key));
}

async function main() {
  const allTrades = readJson("trades.json", []);
  const allLegs = readJson("trade_legs.json", []).filter((l) => l.kind !== "faab");
  const members = readJson("members.json", []);
  const fullCurve = readJson("value_curve.json", []);
  const resolutions = readJson("asset_resolutions.json", []);
  const draftPicks = readJson("draft_picks.json", []);
  const seats = readJson("seats.json", []);
  const nameById = Object.fromEntries(members.map((m) => [m.user_id, m.canonical_name]));
  const latestSeason = String(Math.max(0, ...seats.map((s) => Number(s.season))));
  const seatOwner = new Map(seats.map((s) => [`${s.season}:${s.roster_id}`, s.owner_id]));
  function originOf(leg) {
    const roster = leg.origin_roster_id ?? leg.pick?.roster_id ?? (leg.asset_key || "").split(":")[3];
    if (roster == null || roster === "") return null;
    const year = (leg.asset_key || "").split(":")[1] || latestSeason;
    const season = Number(year) > Number(latestSeason) ? latestSeason : year;
    const uid = seatOwner.get(`${season}:${roster}`) || seatOwner.get(`${latestSeason}:${roster}`);
    return uid ? (nameById[uid] || uid) : null;
  }

  const used = new Set();
  for (const l of allLegs) {
    used.add(l.asset_key);
    if (l.kind === "pick") {
      const [, y, r] = l.asset_key.split(":");
      for (const k of pickKeys(y, Number(r), null)) used.add(k);
    }
  }
  for (const r of fullCurve) {
    if (r.asset_key.startsWith("pickval:")) used.add(r.asset_key);
  }
  for (const r of resolutions) {
    if (r.player_key) used.add(r.player_key);
    if (r.draft_slot && r.pick_key) {
      const [, y, rnd] = r.pick_key.split(":");
      for (const k of pickKeys(y, Number(rnd), r.draft_slot)) used.add(k);
    }
  }
  for (const p of draftPicks) {
    if (p.player_id) used.add(`player:${p.player_id}`);
    for (const k of pickKeys(p.season, Number(p.round), p.draft_slot)) used.add(k);
  }

  const curve = slimCurve(fullCurve, used);
  writeJson("value_curve_used.json", curve);

  const inByTx = new Map();
  for (const l of allLegs) {
    if (!inByTx.has(l.transaction_id)) inByTx.set(l.transaction_id, []);
    inByTx.get(l.transaction_id).push(l);
  }
  const withAssets = allTrades.filter((t) => (inByTx.get(t.transaction_id) || []).some((l) => l.direction !== "out"));
  const trades = withAssets.filter((t) => {
    const legs = inByTx.get(t.transaction_id) || [];
    const uids = t.user_ids.filter(Boolean);
    if (uids.length < 2) return false;
    return uids.every((uid) => legs.some((l) => l.direction !== "out" && l.to_user_id === uid));
  });
  const tossed = withAssets.length - trades.length;

  check("has trades", trades.length > 0);
  check("has curve", curve.length > 0);

  const curveIdx = indexCurve(curve);
  const vmaxIdx = indexVmax(curve);
  const resIdx = resIndex(resolutions);
  const today = latestAsOf(fullCurve.length ? fullCurve : curve);
  const ctx = { curveIdx, resIdx, nameById, originOf, vmaxIdx };
  const tradeById = new Map(allTrades.map((t) => [t.transaction_id, t]));

  function buildPicks() {
    const byKey = new Map();
    for (const leg of allLegs) {
      if (leg.kind !== "pick" || leg.direction === "out") continue;
      const trade = tradeById.get(leg.transaction_id);
      if (!trade) continue;
      const date = trade.date || new Date(trade.created).toISOString().slice(0, 10);
      if (!byKey.has(leg.asset_key)) byKey.set(leg.asset_key, []);
      byKey.get(leg.asset_key).push({ date, trade, leg });
    }
    const out = {};
    for (const [key, raw] of byKey) {
      raw.sort((a, b) => a.date.localeCompare(b.date) || String(a.trade.transaction_id).localeCompare(String(b.trade.transaction_id)));
      const [, year, round] = key.split(":");
      const playerRes = latestRes(resIdx, key, today, "player");
      const hops = raw.map((h, i) => {
        const last = i === raw.length - 1;
        const toId = h.leg.to_user_id;
        const fromId = h.leg.from_user_id;
        const isDrafter = !!(playerRes && toId === playerRes.drafted_by_user_id);
        let exit = "held";
        let outDate = today;
        if (!last) {
          exit = "flip";
          outDate = raw[i + 1].date;
        } else if (isDrafter) {
          exit = "drafted";
          outDate = today;
        } else if (playerRes) {
          outDate = playerRes.as_of;
        }
        const inn = priceLeg(h.leg, h.date, "pick", ctx);
        let outPriced;
        if (exit === "drafted") {
          outPriced = playerValue(curveIdx, playerRes.player_key, today);
        } else if (last && playerRes && !isDrafter) {
          outPriced = priceLeg(h.leg, playerRes.as_of, "pick", ctx);
        } else if (last && !playerRes) {
          outPriced = priceLeg(h.leg, today, "pick", ctx);
        } else {
          const lens = playerRes && playerRes.as_of <= outDate ? "realized" : "pick";
          outPriced = priceLeg(h.leg, outDate, lens, ctx);
        }
        return {
          date: h.date,
          from: fromId ? (nameById[fromId] || fromId) : null,
          to: toId ? (nameById[toId] || toId) : null,
          t0: inn.value,
          out: outPriced.value,
          out_date: outDate,
          exit,
          transaction_id: h.trade.transaction_id,
        };
      });
      out[key] = {
        label: pickDisplay(year, round, originOf(raw[0].leg), null, null),
        became: playerRes?.label || null,
        used_by: playerRes?.drafted_by_user_id
          ? (nameById[playerRes.drafted_by_user_id] || playerRes.drafted_by_user_id)
          : null,
        still_pick: !playerRes,
        hops,
      };
    }
    return out;
  }

  const meters = [];
  const edges = {};
  for (const m of members) {
    edges[m.user_id] = {
      realized: 0, pick: 0, even: 0, two_way: 0, incomplete: 0,
      realized_per: [], pick_per: [], even_per: [],
      now_got: 0, now_priced: 0, horizons: [],
      sold_picks: 0, sold_players: 0,
    };
  }

  for (const trade of trades) {
    const t0 = trade.date || new Date(trade.created).toISOString().slice(0, 10);
    const legs = inByTx.get(trade.transaction_id) || [];
    const uids = trade.user_ids.filter(Boolean);
    const entry = {
      transaction_id: trade.transaction_id,
      date: t0,
      season: trade.season,
      week: trade.week,
      user_ids: uids,
      names: uids.map((id) => nameById[id] || id),
      lenses: {},
    };

    for (const lens of ["realized", "pick"]) {
      const sides = {};
      const bags = {};
      for (const uid of uids) {
        bags[uid] = {
          got: bagFor(legs, uid, today, lens, ctx, "in"),
          sent: bagFor(legs, uid, today, lens, ctx, "out"),
          got0: bagFor(legs, uid, t0, lens, ctx, "in"),
          sent0: bagFor(legs, uid, t0, lens, ctx, "out"),
        };
      }
      const incomplete = uids.some((uid) => bags[uid].got.unpriced + bags[uid].sent.unpriced > 0);
      for (const uid of uids) {
        const { got, sent, got0, sent0 } = bags[uid];
        const t0Priced = got0.legs.some((l) => l.value != null) || sent0.legs.some((l) => l.value != null);
        const delta = incomplete ? null : got.points - sent.points;
        const t0Delta = incomplete || !t0Priced ? null : got0.points - sent0.points;
        sides[uid] = {
          name: nameById[uid] || uid,
          today: got.points,
          sent_today: sent.points,
          today_delta: delta,
          t0: t0Priced ? got0.points : null,
          t0_delta: t0Delta,
          unpriced: got.unpriced,
          sent_unpriced: sent.unpriced,
          t0_unpriced: got0.unpriced,
          incomplete,
          legs: got.legs,
          sent: sent.legs,
          t0_legs: got0.legs,
        };
        if (incomplete) {
          if (lens === "realized") edges[uid].incomplete += 1;
        } else if (lens === "realized") {
          edges[uid].realized += delta;
          edges[uid].realized_per.push(delta);
          edges[uid].two_way += 1;
        } else {
          edges[uid].pick += delta;
          edges[uid].pick_per.push(delta);
        }
        if (lens === "pick" && !incomplete && uids.length === 2) {
          const tradeYear = Number(t0.slice(0, 4));
          const g = nowPoints(got0.legs, tradeYear);
          const s = nowPoints(sent0.legs, tradeYear);
          edges[uid].now_got += g.now;
          edges[uid].now_priced += g.priced;
          const r0 = entry.lenses.realized.sides[uid]?.t0_delta;
          const rNow = entry.lenses.realized.sides[uid]?.today_delta;
          if (r0 != null && rNow != null) edges[uid].horizons.push(rNow - r0);
          if (g.priced && s.priced) {
            const gShare = g.now / g.priced;
            const sShare = s.now / s.priced;
            if (gShare >= 0.55 && sShare <= 0.45) edges[uid].sold_picks += 1;
            if (gShare <= 0.45 && sShare >= 0.55) edges[uid].sold_players += 1;
          }
        }
      }
      const t0Priced = Object.values(sides).some((s) => s.t0 != null);
      const points = yearEnds(t0, today).map((d) => {
        const pts = {};
        for (const uid of uids) {
          pts[nameById[uid] || uid] = bagFor(legs, uid, d, lens, ctx, "in").points;
        }
        return { as_of: d, points: pts };
      });
      entry.lenses[lens] = { sides, year_ends: points, t0_priced: t0Priced, incomplete };
    }
    const y3Dates = windowAsOfs(t0, today, 3);
    const y3Sides = {};
    for (const uid of uids) {
      const got = bagY3(legs, uid, y3Dates, today, ctx, "in");
      const sent = bagY3(legs, uid, y3Dates, today, ctx, "out");
      const incomplete = !y3Dates.length || got.unpriced + sent.unpriced > 0;
      y3Sides[uid] = {
        name: nameById[uid] || uid,
        today: got.points,
        sent_today: sent.points,
        today_delta: incomplete ? null : got.points - sent.points,
        unpriced: got.unpriced,
        sent_unpriced: sent.unpriced,
        incomplete,
        legs: got.legs,
        sent: sent.legs,
      };
    }
    entry.lenses.y3 = {
      sides: y3Sides,
      incomplete: uids.some((uid) => y3Sides[uid].incomplete),
    };
    const topToday = vmaxAt(vmaxIdx, today);
    const top0 = vmaxAt(vmaxIdx, t0);
    const evenSides = {};
    for (const uid of uids) {
      const s = entry.lenses.realized.sides[uid];
      const gotLegs = flattenLegs(s.legs, topToday);
      const sentLegs = flattenLegs(s.sent, topToday);
      const gotP = gotLegs.reduce((a, l) => a + (l.value || 0), 0);
      const sentP = sentLegs.reduce((a, l) => a + (l.value || 0), 0);
      const sent0Raw = bagFor(legs, uid, t0, "realized", ctx, "out");
      const got0Legs = flattenLegs(s.t0_legs, top0);
      const sent0Legs = flattenLegs(sent0Raw.legs, top0);
      const t0Got = got0Legs.reduce((a, l) => a + (l.value || 0), 0);
      const t0Sent = sent0Legs.reduce((a, l) => a + (l.value || 0), 0);
      const t0Priced = s.t0 != null;
      const todayDelta = s.incomplete ? null : gotP - sentP;
      const t0Delta = s.incomplete || !t0Priced ? null : t0Got - t0Sent;
      evenSides[uid] = {
        name: s.name,
        today: gotP,
        sent_today: sentP,
        today_delta: todayDelta,
        t0: t0Priced ? t0Got : null,
        t0_delta: t0Delta,
        unpriced: s.unpriced,
        sent_unpriced: s.sent_unpriced,
        incomplete: s.incomplete,
        legs: gotLegs,
        sent: sentLegs,
      };
      if (!s.incomplete && todayDelta != null) {
        edges[uid].even += todayDelta;
        edges[uid].even_per.push(todayDelta);
      }
    }
    const evenYearEnds = yearEnds(t0, today).map((d) => {
      const top = vmaxAt(vmaxIdx, d);
      const pts = {};
      for (const uid of uids) {
        const bag = bagFor(legs, uid, d, "realized", ctx, "in");
        const graded = flattenLegs(bag.legs, top);
        pts[nameById[uid] || uid] = graded.reduce((a, l) => a + (l.value || 0), 0);
      }
      return { as_of: d, points: pts };
    });
    entry.lenses.even = {
      sides: evenSides,
      year_ends: evenYearEnds,
      incomplete: entry.lenses.realized.incomplete,
    };
    const winKeys = [["t0", 0], ["y1", 1], ["y2", 2], ["y3", 3], ["all", null]];
    entry.lenses.windows = {};
    for (const [key, n] of winKeys) {
      const dates = n === 0 ? [t0] : windowAsOfs(t0, today, n);
      const sides = {};
      for (const uid of uids) {
        const got = n === 0
          ? bagAtEven(legs, uid, t0, ctx, "in")
          : bagY3(legs, uid, dates, today, ctx, "in");
        const sent = n === 0
          ? bagAtEven(legs, uid, t0, ctx, "out")
          : bagY3(legs, uid, dates, today, ctx, "out");
        const incomplete = got.unpriced + sent.unpriced > 0 || (n !== 0 && !dates.length);
        sides[uid] = {
          name: nameById[uid] || uid,
          today: got.points,
          sent_today: sent.points,
          today_delta: incomplete ? null : got.points - sent.points,
          unpriced: got.unpriced,
          sent_unpriced: sent.unpriced,
          incomplete,
          snaps: dates.length,
          legs: got.legs,
          sent: sent.legs,
        };
      }
      entry.lenses.windows[key] = {
        sides,
        snaps: dates.length,
        incomplete: uids.some((uid) => sides[uid].incomplete),
      };
    }
    entry.incomplete = entry.lenses.realized.incomplete;
    meters.push(entry);
  }

  function gradeRaw(raw, asOf) {
    if (raw == null) return null;
    return flatten(raw, vmaxAt(vmaxIdx, asOf));
  }

  const drafterRows = [];
  for (const p of draftPicks) {
    if (!p.drafted_by_user_id || !p.player_id) continue;
    const draftDay = p.as_of || today;
    const playerKey = `player:${p.player_id}`;
    const nowRaw = playerValue(curveIdx, playerKey, today);
    const costRaw = pickValue(curveIdx, p.season, Number(p.round), p.draft_slot, draftDay);
    const nowVal = gradeRaw(nowRaw.value, today);
    const costVal = gradeRaw(costRaw.value, draftDay);
    const surplus = nowVal != null && costVal != null ? nowVal - costVal : null;
    const startup = p.season === "2019";
    drafterRows.push({
      season: p.season,
      round: p.round,
      pick_no: p.pick_no,
      draft_slot: p.draft_slot,
      player: p.label,
      player_key: playerKey,
      drafted_by_user_id: p.drafted_by_user_id,
      drafted_by: nameById[p.drafted_by_user_id] || p.drafted_by_user_id,
      startup,
      pick_cost: costVal,
      player_today: nowVal,
      surplus,
      flag: nowRaw.flag || costRaw.flag || null,
      year_ends: yearEnds(draftDay, today).map((d) => ({
        as_of: d,
        player: gradeRaw(playerValue(curveIdx, playerKey, d).value, d),
        pick: startup ? null : gradeRaw(
          pickValue(curveIdx, p.season, Number(p.round), p.draft_slot, d).value,
          d,
        ),
      })),
    });
  }

  function drafterBoard(rows, mode) {
    return members.map((m) => {
      const mine = rows.filter((r) => r.drafted_by_user_id === m.user_id);
      if (mode === "rookie") {
        const priced = mine.filter((r) => r.surplus != null);
        const surplus = priced.reduce((a, r) => a + r.surplus, 0);
        const best = priced.slice().sort((a, b) => b.surplus - a.surplus)[0];
        const worst = priced.slice().sort((a, b) => a.surplus - b.surplus)[0];
        return {
          user_id: m.user_id,
          name: m.canonical_name,
          used: mine.length,
          graded: priced.length,
          surplus,
          per_pick: priced.length ? surplus / priced.length : null,
          best: best ? { player: best.player, season: best.season, surplus: best.surplus } : null,
          worst: worst ? { player: worst.player, season: worst.season, surplus: worst.surplus } : null,
        };
      }
      const valued = mine.filter((r) => r.player_today != null);
      const total = valued.reduce((a, r) => a + r.player_today, 0);
      const best = valued.slice().sort((a, b) => b.player_today - a.player_today)[0];
      const worst = valued.slice().sort((a, b) => a.player_today - b.player_today)[0];
      return {
        user_id: m.user_id,
        name: m.canonical_name,
        used: mine.length,
        graded: valued.length,
        player_today: total,
        per_pick: valued.length ? total / valued.length : null,
        best: best ? { player: best.player, season: best.season, value: best.player_today } : null,
        worst: worst ? { player: worst.player, season: worst.season, value: worst.player_today } : null,
      };
    }).sort((a, b) => (b.per_pick ?? -Infinity) - (a.per_pick ?? -Infinity));
  }

  const rookies = drafterRows.filter((r) => !r.startup);
  const startups = drafterRows.filter((r) => r.startup);
  const draftersRookie = drafterBoard(rookies, "rookie");
  const draftersStartup = drafterBoard(startups, "startup");

  const EVEN = 100;
  function partnerGrade(per) {
    if (per == null) return "even";
    if (per >= EVEN) return "you_extract";
    if (per <= -EVEN) return "they_extract";
    return "even";
  }

  function partnersFor(uid) {
    const by = {};
    for (const t of meters) {
      if (!t.user_ids.includes(uid) || t.user_ids.length !== 2) continue;
      const other = t.user_ids.find((id) => id !== uid);
      if (!by[other]) {
        by[other] = { user_id: other, name: nameById[other] || other, n: 0, realized: [], pick: [], even: [] };
      }
      by[other].n += 1;
      if (t.incomplete) continue;
      const rd = t.lenses.realized.sides[uid]?.today_delta;
      const pd = t.lenses.pick.sides[uid]?.today_delta;
      const ed = t.lenses.even.sides[uid]?.today_delta;
      if (rd != null) by[other].realized.push(rd);
      if (pd != null) by[other].pick.push(pd);
      if (ed != null) by[other].even.push(ed);
    }
    return Object.values(by).map((p) => {
      const rAvg = p.realized.length ? p.realized.reduce((a, b) => a + b, 0) / p.realized.length : null;
      const pAvg = p.pick.length ? p.pick.reduce((a, b) => a + b, 0) / p.pick.length : null;
      const eAvg = p.even.length ? p.even.reduce((a, b) => a + b, 0) / p.even.length : null;
      return {
        user_id: p.user_id,
        name: p.name,
        trades: p.n,
        complete: p.realized.length,
        realized_total: p.realized.reduce((a, b) => a + b, 0),
        realized_per_trade: rAvg,
        pick_total: p.pick.reduce((a, b) => a + b, 0),
        pick_per_trade: pAvg,
        even_total: p.even.reduce((a, b) => a + b, 0),
        even_per_trade: eAvg,
        grade: partnerGrade(eAvg),
      };
    }).sort((a, b) => (b.realized_per_trade ?? -1e9) - (a.realized_per_trade ?? -1e9));
  }

  function partnerHeadlines(list) {
    const graded = list.filter((p) => p.complete >= 2);
    const pool = graded.length ? graded : list.filter((p) => p.complete >= 1);
    const best = pool.slice().sort((a, b) => (b.even_per_trade ?? b.realized_per_trade ?? -1e9) - (a.even_per_trade ?? a.realized_per_trade ?? -1e9))[0];
    const worst = pool.slice().sort((a, b) => (a.even_per_trade ?? a.realized_per_trade ?? 1e9) - (b.even_per_trade ?? b.realized_per_trade ?? 1e9))[0];
    const most = list.slice().sort((a, b) => b.trades - a.trades)[0];
    const slim = (p) => p ? { name: p.name, per: p.even_per_trade ?? p.realized_per_trade, n: p.complete, trades: p.trades, grade: p.grade } : null;
    return {
      best: slim(best),
      worst: worst && best && worst.user_id !== best.user_id ? slim(worst) : slim(worst),
      most: most ? { name: most.name, trades: most.trades } : null,
    };
  }

  const leaderboard = members.map((m) => {
    const e = edges[m.user_id];
    const per = e.realized_per;
    const avg = per.length ? per.reduce((a, b) => a + b, 0) / per.length : null;
    const evenAvg = e.even_per.length ? e.even_per.reduce((a, b) => a + b, 0) / e.even_per.length : null;
    return {
      user_id: m.user_id,
      name: m.canonical_name,
      two_way: e.two_way,
      incomplete: e.incomplete,
      realized_total: e.realized,
      realized_per_trade: avg,
      pick_total: e.pick,
      pick_per_trade: e.pick_per.length ? e.pick_per.reduce((a, b) => a + b, 0) / e.pick_per.length : null,
      even_total: e.even,
      even_per_trade: evenAvg,
      style: styleOf(e.now_got, e.now_priced, e.horizons, e.sold_picks, e.sold_players),
    };
  }).sort((a, b) => (b.even_per_trade ?? -Infinity) - (a.even_per_trade ?? -Infinity));

  function headlineOf(side) {
    const first = (side.legs || []).find((l) => l.label);
    if (!first?.label) return "";
    const became = first.label.includes(" · became ") ? first.label.split(" · became ")[1] : first.label;
    return became.replace(/\s*\([^)]+\)$/, "");
  }

  function tradeBoards() {
    const rows = [];
    for (const t of meters) {
      if (t.user_ids.length !== 2 || t.incomplete) continue;
      for (const uid of t.user_ids) {
        const s = t.lenses.even.sides[uid];
        if (s.today_delta == null) continue;
        const win = t.lenses.windows || {};
        const windows = {};
        for (const [k, w] of Object.entries(win)) {
          const side = w.sides[uid];
          windows[k] = {
            delta: side?.today_delta ?? null,
            got: side?.today ?? null,
            sent: side?.sent_today ?? null,
            snaps: side?.snaps ?? w.snaps ?? 0,
            incomplete: !!(side?.incomplete || w.incomplete),
          };
        }
        rows.push({
          transaction_id: t.transaction_id,
          date: t.date,
          user_id: uid,
          name: s.name,
          other: t.names.find((n) => n !== s.name),
          today_delta: s.today_delta,
          t0_delta: s.t0_delta,
          aged: s.t0_delta != null ? s.today_delta - s.t0_delta : null,
          headline: headlineOf(s),
          windows,
        });
      }
    }
    const best = (list, key) => list.slice().sort((a, b) => (b[key] ?? -1e15) - (a[key] ?? -1e15)).slice(0, 10);
    const worst = (list, key) => list.slice().sort((a, b) => (a[key] ?? 1e15) - (b[key] ?? 1e15)).slice(0, 10);
    const aged = rows.filter((r) => r.aged != null);
    return {
      sides: rows,
      today: { best: best(rows, "today_delta"), worst: worst(rows, "today_delta") },
      aged: { best: best(aged, "aged"), worst: worst(aged, "aged") },
    };
  }

  const trade_boards = tradeBoards();

  // ponytail: ownership from startup/rookie draft + player in-legs only. Waivers/drops are invisible.
  function playerLists() {
    function dayDiff(a, b) {
      const ms = Date.parse(b) - Date.parse(a);
      if (!Number.isFinite(ms) || ms < 0) return 0;
      return Math.round(ms / 86400000);
    }
    function nowVal(key) {
      return playerValue(curveIdx, key, today).value ?? 0;
    }
    const rostersNow = readJson("rosters_now.json", []);
    const rosterOwner = new Map();
    for (const r of rostersNow) {
      for (const pid of r.players || []) rosterOwner.set(`player:${pid}`, r.owner_id);
    }
    const origin = new Map();
    for (const p of draftPicks) {
      if (!p.player_id) continue;
      const key = `player:${p.player_id}`;
      const prev = origin.get(key);
      if (!prev || (p.as_of || "") < (prev.as_of || "") || ((p.as_of || "") === (prev.as_of || "") && Number(p.season) < Number(prev.season))) {
        origin.set(key, p);
      }
    }
    const hopsBy = new Map();
    for (const l of allLegs) {
      if (l.kind !== "player" || l.direction !== "in" || !String(l.asset_key || "").startsWith("player:")) continue;
      const t = tradeById.get(l.transaction_id);
      if (!t?.date || !l.to_user_id) continue;
      if (!hopsBy.has(l.asset_key)) hopsBy.set(l.asset_key, []);
      hopsBy.get(l.asset_key).push({
        date: t.date,
        to: l.to_user_id,
        tx: l.transaction_id,
        label: l.label,
      });
    }
    const keys = new Set([...origin.keys(), ...hopsBy.keys()]);
    const rows = [];
    for (const key of keys) {
      const d = origin.get(key);
      const hops = (hopsBy.get(key) || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.tx.localeCompare(b.tx));
      const name = d?.label || hops[hops.length - 1]?.label || key;
      let owner = d?.drafted_by_user_id || hops[0]?.to || null;
      let from = d?.as_of || hops[0]?.date || today;
      let i = 0;
      if (!d && hops.length) {
        owner = hops[0].to;
        from = hops[0].date;
        i = 1;
      }
      const stints = [];
      for (; i < hops.length; i++) {
        const h = hops[i];
        if (!h.to || h.to === owner) continue;
        stints.push({ owner, from, to: h.date });
        owner = h.to;
        from = h.date;
      }
      stints.push({ owner, from, to: today });
      const sitsWith = rosterOwner.get(key) || owner;
      const onNow = stints.filter((s) => s.owner === sitsWith);
      let days = onNow.reduce((a, s) => a + dayDiff(s.from, s.to), 0);
      if (!onNow.length && d?.drafted_by_user_id === sitsWith) days = dayDiff(d.as_of || today, today);
      const leftHome = !!(d && hops.some((h) => h.to && h.to !== d.drafted_by_user_id));
      rows.push({
        key,
        name,
        team: nameById[sitsWith] || sitsWith || "—",
        trades: new Set(hops.map((h) => h.tx)).size,
        days,
        stays: Math.max(onNow.length, days ? 1 : 0),
        start: d?.as_of || hops[0]?.date || today,
        value: nowVal(key),
        rostered: rosterOwner.has(key),
        drafted: !!d,
        forever: !!(d && d.season === "2019" && !leftHome && sitsWith === d.drafted_by_user_id && rosterOwner.has(key)),
      });
    }
    const slim = (r) => ({
      name: r.name,
      team: r.team,
      trades: r.trades,
      days: r.days,
      stays: r.stays,
    });
    const onRoster = rows.filter((r) => r.rostered);
    const most_traded = rows.slice().sort((a, b) => b.trades - a.trades || b.value - a.value).slice(0, 5).map(slim);
    const least_traded = onRoster.slice()
      .sort((a, b) => a.trades - b.trades || b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, 5).map(slim);
    const forever = onRoster.filter((r) => r.forever).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).map(slim);
    const homesteaders = onRoster.filter((r) => !r.forever)
      .sort((a, b) => b.days - a.days || b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, 5).map(slim);
    return { most_traded, least_traded, forever, homesteaders };
  }

  const player_lists = playerLists();
  check("has current rosters", readJson("rosters_now.json", []).length === 10);
  check("most traded is 5", player_lists.most_traded.length === 5);
  check("least traded is 5", player_lists.least_traded.length === 5);
  check("homesteaders is 5", player_lists.homesteaders.length === 5);
  check("most ranked by trades", player_lists.most_traded[0].trades >= player_lists.most_traded[4].trades);
  check("least ranked by trades", player_lists.least_traded[0].trades <= player_lists.least_traded[4].trades);
  check("forever never moved", player_lists.forever.every((r) => r.trades === 0));
  check("forever still rostered", player_lists.forever.length > 0);
  check("homestead not forever", player_lists.homesteaders.every((r) => !player_lists.forever.some((f) => f.name === r.name)));
  check("homestead days ranked", player_lists.homesteaders[0].days >= player_lists.homesteaders[4].days);

  function reviewTape() {
    return REVIEW_IDS.map((id) => {
      const t = meters.find((x) => x.transaction_id === id);
      if (!t) return null;
      const winnerId = t.user_ids.slice().sort((a, b) =>
        (t.lenses.even.sides[b]?.today_delta ?? -1e15) - (t.lenses.even.sides[a]?.today_delta ?? -1e15)
      )[0];
      const loserId = t.user_ids.find((uid) => uid !== winnerId);
      const row = slimTrade(t, winnerId);
      row.winner = nameById[winnerId] || winnerId;
      row.loser = nameById[loserId] || loserId;
      row.winner_id = winnerId;
      row.steep_delta = t.lenses.realized.sides[winnerId]?.today_delta ?? null;
      row.y3_delta = t.lenses.y3?.sides[winnerId]?.today_delta ?? null;
      return row;
    }).filter(Boolean);
  }

  const review_trades = reviewTape();
  check("review tape is 10", review_trades.length === 10);

  writeJson("trade_meter.json", meters);
  writeJson("leaderboard.json", leaderboard);
  writeJson("draft_skill.json", {
    picks: drafterRows.map(({ year_ends, ...r }) => r),
    drafters_rookie: draftersRookie,
    drafters_startup: draftersStartup,
  });

  const pickIndex = buildPicks();
  writeUi("members.json", members.map((m) => ({ user_id: m.user_id, name: m.canonical_name })));
  writeUi("league.json", {
    traders: leaderboard,
    drafters_rookie: draftersRookie,
    drafters_startup: draftersStartup,
    trade_boards,
    review_trades,
    player_lists,
    today,
  });
  writeUi("picks.json", pickIndex);

  for (const m of members) {
    const mine = meters.filter((t) => t.user_ids.includes(m.user_id)).sort((a, b) => b.date.localeCompare(a.date));
    const myPicks = drafterRows.filter((r) => r.drafted_by_user_id === m.user_id);
    const myRookie = myPicks.filter((r) => !r.startup).sort((a, b) => (b.surplus ?? -1e9) - (a.surplus ?? -1e9));
    const myStart = myPicks.filter((r) => r.startup).sort((a, b) => (b.player_today ?? -1) - (a.player_today ?? -1));
    const recentRookies = myPicks.filter((r) => !r.startup).sort((a, b) => {
      if (a.season !== b.season) return Number(b.season) - Number(a.season);
      return (b.pick_no || 0) - (a.pick_no || 0);
    });
    const board = leaderboard.find((x) => x.user_id === m.user_id);
    const hit = myRookie.find((r) => r.surplus != null);
    const miss = [...myRookie].reverse().find((r) => r.surplus != null);
    const incompleteN = mine.filter((t) => t.incomplete).length;
    const partners = partnersFor(m.user_id);
    writeUi(`me/${m.user_id}.json`, {
      user_id: m.user_id,
      name: m.canonical_name,
      hero: { ...board, incomplete: incompleteN },
      style: board?.style || null,
      hit: hit ? { player: hit.player, season: hit.season, round: hit.round, surplus: hit.surplus } : null,
      miss: miss && miss !== hit ? { player: miss.player, season: miss.season, round: miss.round, surplus: miss.surplus } : null,
      partners,
      partner_headlines: partnerHeadlines(partners),
      recent_trades: mine.slice(0, 5).map((t) => slimTrade(t, m.user_id)),
      recent_rookies: recentRookies.slice(0, 5),
      trades: mine.map((t) => slimTrade(t, m.user_id)),
      drafts: { rookie: myRookie, startup: myStart },
    });
  }

  check("no faab", !allLegs.some((l) => l.kind === "faab"));
  check("has sent legs", allLegs.some((l) => l.direction === "out"));
  check("no one-way on meter", meters.every((t) =>
    t.user_ids.every((uid) => (t.lenses.realized.sides[uid]?.legs.length || 0) > 0),
  ));
  check("year end clamped", !meters.some((t) =>
    t.lenses.realized.year_ends.some((p) => p.as_of > today),
  ));
  const zeroBreaks = meters.filter((t) => {
    if (t.user_ids.length !== 2 || t.incomplete) return false;
    const sides = Object.values(t.lenses.realized.sides);
    if (sides.some((s) => s.today_delta == null)) return false;
    return Math.abs(sides[0].today_delta + sides[1].today_delta) >= 1;
  });
  check("zero-sum 2-team", zeroBreaks.length === 0);
  const pairBreaks = [];
  for (const a of members) {
    for (const row of partnersFor(a.user_id)) {
      if (a.user_id >= row.user_id || !row.complete) continue;
      const back = partnersFor(row.user_id).find((p) => p.user_id === a.user_id);
      if (!back || back.realized_per_trade == null || row.realized_per_trade == null) continue;
      if (Math.abs(row.realized_per_trade + back.realized_per_trade) >= 1) {
        pairBreaks.push(`${a.canonical_name}/${row.name}`);
      }
    }
  }
  check("partner pairs invert", pairBreaks.length === 0);
  const wilson = pickIndex["pick:2022:1:7"];
  check("wilson hops", wilson?.hops.length === 5);
  const wilsonToday = wilson.hops.find((h) => h.exit === "drafted")?.out;
  check("wilson flip not player-today", wilson.hops.some((h) => h.exit === "flip" && h.out !== wilsonToday));
  check("wilson one drafted exit", wilson.hops.filter((h) => h.exit === "drafted").length === 1);
  check("breece hops", pickIndex["pick:2022:1:1"]?.hops.length === 6);
  const bubbaTx = meters.find((t) => t.transaction_id === "1397412606653767680");
  const bubbaId = members.find((m) => m.canonical_name === "BubbaCuckShremp")?.user_id;
  const bubbaGot = bubbaTx?.lenses.realized.sides[bubbaId]?.legs || [];
  check("truman-bubba complete", bubbaTx && !bubbaTx.incomplete);
  check("bubba got 3 picks", bubbaGot.filter((l) => l.kind === "pick").length === 3);
  check("2029 as 2028", bubbaGot.some((l) => l.asset_key === "pick:2029:4:9" && l.value != null && l.flag === "priced_as_2028"));
  check("today best 10", trade_boards.today.best.length === 10);
  check("today best sorted", trade_boards.today.best[0].today_delta >= trade_boards.today.best[9].today_delta);
  check("today worst sorted", trade_boards.today.worst[0].today_delta <= trade_boards.today.worst[9].today_delta);
  check("aged has aged", trade_boards.aged.best.every((r) => r.aged != null) && trade_boards.aged.worst.every((r) => r.aged != null));
  check("aged best sorted", trade_boards.aged.best[0].aged >= trade_boards.aged.best[9].aged);
  check("aged worst sorted", trade_boards.aged.worst[0].aged <= trade_boards.aged.worst[9].aged);
  const sideCounts = {};
  for (const r of trade_boards.sides) {
    sideCounts[r.transaction_id] = (sideCounts[r.transaction_id] || 0) + 1;
  }
  check("sides 2-team pairs", Object.values(sideCounts).every((n) => n === 2));
  check("sides complete", trade_boards.sides.every((r) => r.today_delta != null && r.date && r.headline != null));
  check("sides have windows", trade_boards.sides.every((r) =>
    r.windows && r.windows.t0 && r.windows.all && ["t0", "y1", "y2", "y3", "all"].every((k) => r.windows[k])));
  check("MIN_ACTIVE", MIN_ACTIVE === 300);
  for (const row of leaderboard) {
    const ds = meters.filter((t) => !t.incomplete && t.user_ids.includes(row.user_id))
      .map((t) => t.lenses.realized.sides[row.user_id]?.today_delta)
      .filter((d) => d != null);
    const avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
    const ok = (avg == null && row.realized_per_trade == null)
      || (avg != null && row.realized_per_trade != null && Math.abs(avg - row.realized_per_trade) < 1e-6);
    check("y3 leaves realized_per_trade", ok);
  }
  const chiefArae = meters.find((t) => t.transaction_id === "460470201385742336");
  const chiefId = members.find((m) => m.canonical_name === "ChiefGumby")?.user_id;
  const zekeToday = chiefArae?.lenses.realized.sides[chiefId]?.legs.find((l) => l.became === "Ezekiel Elliott");
  const zekeY3 = chiefArae?.lenses.y3.sides[chiefId]?.legs.find((l) => l.became === "Ezekiel Elliott");
  check("zeke on chief-arae", !!(zekeToday && zekeY3));
  check("zeke 3y not leftover 3", zekeY3.value != null && zekeY3.value !== 3 && (zekeToday.value < MIN_ACTIVE ? zekeY3.value !== zekeToday.value : true));
  let badFloor = 0;
  for (const t of meters) {
    const dates = windowAsOfs(t.date, today, 3);
    for (const leg of inByTx.get(t.transaction_id) || []) {
      for (const snap of y3Snaps(leg, dates, ctx)) {
        if (leg.kind !== "player") continue;
        if (snap.floored > 0 && snap.floored < MIN_ACTIVE) badFloor += 1;
        if (snap.raw < MIN_ACTIVE && snap.floored !== 0) badFloor += 1;
      }
    }
  }
  check("no sub-300 positive 3y snap", badFloor === 0);
  const topToday = vmaxAt(vmaxIdx, today);
  check("flatten top is 10k", flatten(topToday, topToday) === FLAT_SCALE);
  const bigsbyFlat = flatten(83, topToday);
  check("flatten bigsby ktc-ish", bigsbyFlat >= 2000 && bigsbyFlat <= 2700);
  const bakerFlat = flatten(2588, topToday);
  check("flatten baker ktc-ish", bakerFlat >= 4200 && bakerFlat <= 5200);
  check("even leaves realized_per_trade", leaderboard.every((row) => {
    const ds = meters.filter((t) => !t.incomplete && t.user_ids.includes(row.user_id))
      .map((t) => t.lenses.realized.sides[row.user_id]?.today_delta)
      .filter((d) => d != null);
    const avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
    return (avg == null && row.realized_per_trade == null)
      || (avg != null && row.realized_per_trade != null && Math.abs(avg - row.realized_per_trade) < 1e-6);
  }));
  check("even_per matches even deltas", leaderboard.every((row) => {
    const ds = meters.filter((t) => !t.incomplete && t.user_ids.includes(row.user_id))
      .map((t) => t.lenses.even.sides[row.user_id]?.today_delta)
      .filter((d) => d != null);
    const avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
    return (avg == null && row.even_per_trade == null)
      || (avg != null && row.even_per_trade != null && Math.abs(avg - row.even_per_trade) < 1e-6);
  }));
  const evenZeroBreaks = meters.filter((t) => {
    if (t.user_ids.length !== 2 || t.lenses.even.incomplete) return false;
    const sides = Object.values(t.lenses.even.sides);
    if (sides.some((s) => s.today_delta == null)) return false;
    return Math.abs(sides[0].today_delta + sides[1].today_delta) >= 1;
  });
  check("zero-sum 2-team even", evenZeroBreaks.length === 0);
  let flattenDrift = 0;
  for (const t of meters) {
    for (const uid of t.user_ids) {
      const r = t.lenses.realized.sides[uid];
      const e = t.lenses.even.sides[uid];
      const gotFlat = (r.legs || []).reduce((a, l) => a + (flatten(l.value, topToday) || 0), 0);
      if (Math.abs((e.today || 0) - gotFlat) >= 1) flattenDrift += 1;
    }
  }
  check("even is flatten-only", flattenDrift === 0);
  const winKeys = ["t0", "y1", "y2", "y3", "all"];
  check("every trade has windows", meters.every((t) => winKeys.every((k) => t.lenses.windows?.[k])));
  const winZero = meters.filter((t) => {
    if (t.user_ids.length !== 2) return false;
    return winKeys.some((k) => {
      const w = t.lenses.windows[k];
      if (w.incomplete) return false;
      const sides = Object.values(w.sides);
      if (sides.some((s) => s.today_delta == null)) return false;
      return Math.abs(sides[0].today_delta + sides[1].today_delta) >= 1;
    });
  });
  check("zero-sum 2-team windows", winZero.length === 0);
  check("chief-arae t0 scored", !chiefArae?.lenses.windows.t0.incomplete
    && chiefArae?.lenses.windows.t0.sides[chiefId]?.today_delta != null);
  check("chief-arae all scored", chiefArae?.lenses.windows.all.sides[chiefId]?.today_delta != null);
  let unpricedPickT0 = 0;
  for (const t of meters) {
    for (const uid of t.user_ids) {
      const s = t.lenses.windows.t0.sides[uid];
      for (const l of [...(s.legs || []), ...(s.sent || [])]) {
        if (l.kind === "pick" && l.value == null) unpricedPickT0 += 1;
      }
    }
  }
  check("all t0 picks priced", unpricedPickT0 === 0);

  console.log(JSON.stringify({
    trades: meters.length,
    tossed_one_way: tossed,
    incomplete: meters.filter((t) => t.incomplete).length,
    today,
    curve_used: curve.length,
    curve_full: fullCurve.length,
    pick_keys: Object.keys(pickIndex).length,
    pick_hops: Object.values(pickIndex).reduce((a, p) => a + p.hops.length, 0),
    rookie_graded: rookies.filter((r) => r.surplus != null).length,
    startup_used: startups.length,
    trader: leaderboard[0]?.name,
    drafter: draftersRookie[0]?.name,
    book: "even-flatten",
  }, null, 2));
}

function slimTrade(t, uid) {
  const even = t.lenses.even.sides[uid];
  const others = t.names.filter((n) => n !== (even?.name));
  const win = t.lenses.windows || {};
  const packWin = (id) => Object.fromEntries(
    Object.entries(win).map(([k, w]) => [k, w.sides[id]]),
  );
  const pack = (id) => ({
    name: t.lenses.even.sides[id].name,
    realized: t.lenses.even.sides[id],
    even: t.lenses.even.sides[id],
    windows: packWin(id),
  });
  const otherBags = t.user_ids.filter((id) => id !== uid).map(pack);
  return {
    transaction_id: t.transaction_id,
    date: t.date,
    season: t.season,
    others,
    incomplete: t.incomplete,
    realized: even,
    even,
    windows: packWin(uid),
    other_bags: otherBags,
    year_ends: t.lenses.even.year_ends,
    even_year_ends: t.lenses.even.year_ends,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
