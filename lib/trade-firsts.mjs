/**
 * Trade FIRSTS — every deal where a seat sent a first-round draft pick.
 * Seat picker → trade list (newest first).
 */

export const TRADE_FIRSTS_BOOK_V = 1;

function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function pickRound(leg) {
  const nested = leg && leg.pick && leg.pick.round;
  if (nested != null && Number.isFinite(Number(nested))) return Number(nested);
  const parts = String((leg && leg.asset_key) || "").split(":");
  // pick:YEAR:ROUND:ORIGIN
  if (parts[0] === "pick" && parts.length >= 3 && Number.isFinite(Number(parts[2]))) {
    return Number(parts[2]);
  }
  const lab = String((leg && leg.label) || "");
  const m = lab.match(/\bR(\d+)\b/i);
  if (m) return Number(m[1]);
  return null;
}

export function isFirstRoundPickLeg(leg) {
  if (!leg || leg.kind !== "pick") return false;
  return pickRound(leg) === 1;
}

function partnerOf(leg, seatUid) {
  const from = leg.from_user_id != null ? String(leg.from_user_id) : "";
  const to = leg.to_user_id != null ? String(leg.to_user_id) : "";
  if (from === seatUid) return to || null;
  if (to === seatUid) return from || null;
  return to || from || null;
}

/**
 * @param {object} opts
 */
export function buildTradeFirstsBook(opts = {}) {
  const {
    leagueId = null,
    asOf = new Date().toISOString().slice(0, 10),
    tradeLegs = [],
    trades = [],
    members = [],
  } = opts;

  const nameById = new Map();
  for (const m of members || []) {
    if (!m || m.user_id == null) continue;
    const nm = cleanName(m.name || m.canonical_name || m.display_name || "");
    if (nm) nameById.set(String(m.user_id), nm);
  }

  const tradeById = new Map();
  for (const t of trades || []) {
    if (!t || t.transaction_id == null) continue;
    tradeById.set(String(t.transaction_id), t);
  }

  const legsByTx = new Map();
  for (const leg of tradeLegs || []) {
    if (!leg || leg.transaction_id == null) continue;
    const tid = String(leg.transaction_id);
    if (!legsByTx.has(tid)) legsByTx.set(tid, []);
    legsByTx.get(tid).push(leg);
  }

  const firstOuts = (tradeLegs || []).filter((leg) => (
    isFirstRoundPickLeg(leg) && leg.direction === "out" && leg.from_user_id != null
  ));

  const bySeat = new Map();
  for (const leg of firstOuts) {
    const uid = String(leg.from_user_id);
    if (!bySeat.has(uid)) {
      bySeat.set(uid, {
        user_id: uid,
        name: nameById.get(uid) || uid,
        deals: new Map(), // tid → trade row
      });
    }
    const seat = bySeat.get(uid);
    if (nameById.has(uid)) seat.name = nameById.get(uid);
    const tid = String(leg.transaction_id);
    const header = tradeById.get(tid) || {};
    if (!seat.deals.has(tid)) {
      const all = legsByTx.get(tid) || [];
      const firstsOut = [];
      const outLabels = [];
      const inLabels = [];
      let partnerUid = null;
      for (const L of all) {
        const from = L.from_user_id != null ? String(L.from_user_id) : "";
        const to = L.to_user_id != null ? String(L.to_user_id) : "";
        const lab = cleanName(L.label || L.asset_key || "");
        if (from === uid && L.direction === "out") {
          outLabels.push(lab);
          if (isFirstRoundPickLeg(L)) {
            firstsOut.push({
              asset_key: L.asset_key || null,
              label: lab,
              season: (L.pick && L.pick.season) || (String(L.asset_key || "").split(":")[1] || null),
              round: 1,
              origin_roster_id: L.origin_roster_id != null
                ? Number(L.origin_roster_id)
                : ((L.pick && L.pick.roster_id) != null ? Number(L.pick.roster_id) : null),
            });
          }
          if (!partnerUid && to) partnerUid = to;
        }
        if (to === uid && L.direction === "in") {
          inLabels.push(lab);
          if (!partnerUid && from) partnerUid = from;
        }
      }
      if (!partnerUid) partnerUid = partnerOf(leg, uid);
      seat.deals.set(tid, {
        transaction_id: tid,
        date: header.date || null,
        season: header.season != null ? String(header.season) : (leg.pick && leg.pick.season) || null,
        week: header.week != null ? Number(header.week) : null,
        partner_user_id: partnerUid,
        partner_name: partnerUid ? (nameById.get(String(partnerUid)) || String(partnerUid)) : "—",
        firsts_out: firstsOut,
        out_labels: outLabels,
        in_labels: inLabels,
        n_firsts: firstsOut.length,
      });
    }
  }

  // Ensure every known member seat appears (even with 0 firsts) for picker completeness
  for (const m of members || []) {
    if (!m || m.user_id == null) continue;
    const uid = String(m.user_id);
    if (!bySeat.has(uid)) {
      bySeat.set(uid, {
        user_id: uid,
        name: nameById.get(uid) || cleanName(m.name) || uid,
        deals: new Map(),
      });
    }
  }

  const seats = [...bySeat.values()].map((seat) => {
    const tradesList = [...seat.deals.values()].sort((a, b) => (
      String(b.date || "").localeCompare(String(a.date || ""))
      || String(b.transaction_id).localeCompare(String(a.transaction_id))
    ));
    const nFirsts = tradesList.reduce((sum, t) => sum + (Number(t.n_firsts) || 0), 0);
    return {
      key: seat.user_id,
      user_id: seat.user_id,
      name: seat.name,
      n_firsts: nFirsts,
      n_trades: tradesList.length,
      thesis: `${seat.name}: ${nFirsts} first${nFirsts === 1 ? "" : "s"} sent across ${tradesList.length} deal${tradesList.length === 1 ? "" : "s"}`,
      trades: tradesList,
    };
  }).sort((a, b) => (
    b.n_firsts - a.n_firsts
    || b.n_trades - a.n_trades
    || String(a.name).localeCompare(String(b.name))
  )).map((s, i) => ({ ...s, rank: i + 1 }));

  return {
    v: TRADE_FIRSTS_BOOK_V,
    league_id: leagueId != null ? String(leagueId) : null,
    as_of: asOf,
    n: seats.length,
    rule: {
      round: 1,
      direction: "out",
      metric: "firsts_sent",
    },
    seats,
  };
}
