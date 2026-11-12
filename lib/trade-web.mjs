/**
 * Trade web — blockchain-style map of what a traded-away asset turned into.
 *
 * Root: a player leaves a seat in a trade.
 * Branch: every asset that seat received on that same transaction.
 * Recurse: later trades / draft resolutions / drops for those pieces.
 * Values: DynastyProcess flatten (same as Cornerstone) on each hop;
 * connector P&L = got − gave for each flip, mark Δ for still-held pieces.
 */

import {
  indexCurve,
  indexVmax,
  pricePickAt,
  pricePlayerAt,
} from "./cornerstone-trades.mjs";

export const TRADE_WEB_BOOK_V = 2;
export const TRADE_WEB_MAX_PLAYER_DEPTH = 3;
export const TRADE_WEB_MAX_PICK_HOPS = 6;
export const TRADE_WEB_MAX_NODES = 28;
export const TRADE_WEB_MAX_EXITS_PER_PLAYER = 6;
export const TRADE_WEB_SLIM_DEPTH = 2;

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : null;
}

function seatName(map, userId) {
  const uid = userId == null ? "" : String(userId);
  if (!uid) return "—";
  return clean(map && map[uid]) || uid;
}

function txMeta(tradesById, txId) {
  const t = tradesById.get(String(txId));
  if (!t) return { transaction_id: String(txId), date: null, season: null, week: null };
  return {
    transaction_id: String(txId),
    date: t.date || null,
    season: t.season != null ? String(t.season) : null,
    week: t.week != null ? Number(t.week) : null,
  };
}

/**
 * Index trade legs for fast lookup.
 */
export function indexTradeLegs(legs) {
  const byTx = new Map();
  const outsByAsset = new Map();
  for (const leg of legs || []) {
    if (!leg || !leg.transaction_id || !leg.asset_key) continue;
    const tx = String(leg.transaction_id);
    const key = String(leg.asset_key);
    if (!byTx.has(tx)) byTx.set(tx, []);
    byTx.get(tx).push(leg);
    if (leg.direction === "out") {
      if (!outsByAsset.has(key)) outsByAsset.set(key, []);
      outsByAsset.get(key).push(leg);
    }
  }
  for (const list of outsByAsset.values()) {
    list.sort((a, b) => String(a.transaction_id).localeCompare(String(b.transaction_id)));
  }
  return { byTx, outsByAsset };
}

/** Lowercased player label → player:id from NFL book + trade legs. */
export function buildPlayerNameIndex(playersNfl, legs) {
  const map = new Map();
  for (const [pid, p] of Object.entries(playersNfl || {})) {
    if (!p) continue;
    const n = clean(p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name);
    if (n) map.set(n.toLowerCase(), `player:${pid}`);
  }
  for (const leg of legs || []) {
    if (!leg || leg.kind !== "player" || !leg.asset_key || !leg.label) continue;
    const n = clean(leg.label).toLowerCase();
    if (n && !map.has(n)) map.set(n, String(leg.asset_key));
  }
  return map;
}

function returnBag(byTx, txId, seatUserId) {
  const uid = String(seatUserId);
  const rows = byTx.get(String(txId)) || [];
  return rows.filter((l) => l.direction === "in" && String(l.to_user_id) === uid);
}

function pickNodeFromBook(picksBook, assetKey) {
  if (!picksBook) return null;
  if (picksBook[assetKey]) return picksBook[assetKey];
  if (picksBook.picks && picksBook.picks[assetKey]) return picksBook.picks[assetKey];
  return null;
}

function dropAfter(moves, assetKey, seatUserId, afterDate) {
  const pid = String(assetKey).startsWith("player:")
    ? String(assetKey).slice("player:".length)
    : null;
  if (!pid) return null;
  const uid = String(seatUserId);
  const after = afterDate ? String(afterDate) : "";
  let hit = null;
  for (const m of moves || []) {
    if (!m || !m.drops) continue;
    const dropRoster = m.drops[pid];
    if (dropRoster == null) continue;
    const date = m.date ? String(m.date).slice(0, 10)
      : (m.created ? new Date(m.created).toISOString().slice(0, 10) : "");
    if (after && date && date < after) continue;
    if (m.user_id != null && String(m.user_id) !== uid) continue;
    if (!hit || (date && (!hit.date || date < hit.date))) {
      hit = {
        date,
        type: m.type || "drop",
        transaction_id: m.transaction_id != null ? String(m.transaction_id) : null,
      };
    }
  }
  return hit;
}

/**
 * Price an asset on a date. Players/picks via DP flatten; optional hop fallback.
 */
export function priceAssetAt(curveIdx, vmaxIdx, assetKey, asOf, hopFallback) {
  if (!assetKey || !asOf) {
    const fb = hopFallback != null ? money(hopFallback) : null;
    return fb != null ? { value: fb, as_of: asOf || null, flag: "hop" } : null;
  }
  const key = String(assetKey);
  let priced = null;
  if (key.startsWith("pick:")) {
    priced = pricePickAt(curveIdx, vmaxIdx, key, asOf);
  } else if (key.startsWith("player:")) {
    priced = pricePlayerAt(curveIdx, vmaxIdx, key, asOf);
  }
  if (priced && priced.value != null) {
    return { value: money(priced.value), as_of: priced.as_of || asOf, flag: priced.flag || "curve" };
  }
  const fb = hopFallback != null ? money(hopFallback) : null;
  if (fb != null) return { value: fb, as_of: asOf, flag: "hop" };
  return null;
}

function makePricer(curveIdx, vmaxIdx) {
  return (assetKey, asOf, hopFallback) => priceAssetAt(curveIdx, vmaxIdx, assetKey, asOf, hopFallback);
}

/**
 * Expand one branch node: what became of this asset for this seat after receiveDate.
 */
function expandBranch(opts) {
  const {
    assetKey,
    label,
    kind,
    seatUserId,
    receiveDate,
    depth,
    playerDepth,
    visited,
    nameByUser,
    byTx,
    outsByAsset,
    tradesById,
    picksBook,
    moves,
    nodeBudget,
    nameIndex,
    skipTxId,
  } = opts;
  const path = Array.isArray(opts.path) ? opts.path : [];

  if (path.includes(String(assetKey))) {
    return {
      asset_key: assetKey,
      label: clean(label) || assetKey,
      kind: kind || (String(assetKey).startsWith("pick:") ? "pick" : "player"),
      status: "cycle",
      seat: seatName(nameByUser, seatUserId),
      seat_user_id: String(seatUserId),
      children: [],
    };
  }
  const nextPath = path.concat([String(assetKey)]);

  if (nodeBudget.count >= TRADE_WEB_MAX_NODES) {
    return {
      asset_key: assetKey,
      label: clean(label) || assetKey,
      kind: kind || (String(assetKey).startsWith("pick:") ? "pick" : "player"),
      status: "truncated",
      seat: seatName(nameByUser, seatUserId),
      seat_user_id: String(seatUserId),
      children: [],
    };
  }
  nodeBudget.count += 1;

  const visitKey = `${assetKey}|${seatUserId}|${receiveDate || ""}|${depth}`;
  if (visited.has(visitKey)) {
    return {
      asset_key: assetKey,
      label: clean(label) || assetKey,
      kind: kind || (String(assetKey).startsWith("pick:") ? "pick" : "player"),
      status: "cycle",
      seat: seatName(nameByUser, seatUserId),
      seat_user_id: String(seatUserId),
      children: [],
    };
  }
  visited.add(visitKey);

  const node = {
    asset_key: assetKey,
    label: clean(label) || assetKey,
    kind: kind || (String(assetKey).startsWith("pick:") ? "pick" : "player"),
    status: "held",
    seat: seatName(nameByUser, seatUserId),
    seat_user_id: String(seatUserId),
    receive_date: receiveDate || null,
    hop_t0: null,
    hop_out: null,
    children: [],
  };

  // Picks: follow hops after receive, then draft → player expand.
  if (node.kind === "pick") {
    const pick = pickNodeFromBook(picksBook, assetKey);
    if (pick) {
      node.label = clean(pick.label) || node.label;
      const hops = Array.isArray(pick.hops) ? pick.hops : [];
      const after = receiveDate ? String(receiveDate) : "";
      const blockTx = new Set(
        [skipTxId, opts.receiveTxId].filter(Boolean).map((x) => String(x)),
      );
      let hopN = 0;
      for (const h of hops) {
        if (!h) continue;
        const hd = h.date ? String(h.date).slice(0, 10) : "";
        if (after && hd && hd < after) continue;
        const txId = h.transaction_id != null ? String(h.transaction_id) : "";
        // Skip the receive-leg hop (same deal that delivered this pick) — expanding
        // that bag re-enters the parent package and loops the web.
        if (txId && blockTx.has(txId)) continue;
        hopN += 1;
        if (hopN > TRADE_WEB_MAX_PICK_HOPS) break;
        if (h.t0 != null) node.hop_t0 = money(h.t0);
        if (h.out != null) node.hop_out = money(h.out);

        const fromLab = h.from != null ? String(h.from) : "";
        const toLab = h.to != null ? String(h.to) : "";
        const seatOwnsHop = fromLab === node.seat;
        const seatReceivedHop = toLab === node.seat && fromLab && fromLab !== node.seat;

        // Inbound hop while we hold it — keep still_pick / held, do not mark traded.
        if (seatReceivedHop && !seatOwnsHop) {
          node.status = pick.still_pick ? "still_pick" : "held";
          continue;
        }

        node.hop = {
          date: hd || null,
          from: h.from || null,
          to: h.to || null,
          exit: h.exit || null,
          t0: h.t0 != null ? money(h.t0) : null,
          out: h.out != null ? money(h.out) : null,
          out_date: h.out_date ? String(h.out_date).slice(0, 10) : null,
          transaction_id: txId || null,
        };

        if (h.exit === "drafted" && seatOwnsHop) {
          node.status = "drafted";
          const becameName = clean(pick.became);
          const becameKey = pick.became_key
            || (pick.player_key ? String(pick.player_key) : null)
            || (pick.became_player_id ? `player:${pick.became_player_id}` : null)
            || (becameName && nameIndex ? nameIndex.get(becameName.toLowerCase()) : null)
            || null;
          if (becameKey) {
            node.children.push(expandBranch({
              ...opts,
              assetKey: becameKey,
              label: becameName || pick.became,
              kind: "player",
              receiveDate: hd || receiveDate,
              depth: depth + 1,
              playerDepth: playerDepth + 1,
              skipTxId: txId || null,
              path: nextPath,
            }));
          } else if (becameName) {
            node.became = becameName;
          }
          break;
        }

        // Only expand when THIS seat sent the pick onward.
        if (seatOwnsHop && toLab && toLab !== node.seat && txId) {
          node.status = "traded";
          node.exit = {
            date: hd || null,
            transaction_id: txId,
            to: toLab,
          };
          const bag = returnBag(byTx, txId, seatUserId);
          for (const leg of bag) {
            if (String(leg.asset_key) === String(assetKey)) continue;
            node.children.push(expandBranch({
              ...opts,
              assetKey: String(leg.asset_key),
              label: leg.label,
              kind: leg.kind,
              receiveDate: hd || receiveDate,
              depth: depth + 1,
              playerDepth,
              skipTxId: txId,
              receiveTxId: txId,
              path: nextPath,
            }));
          }
          break;
        }

        if (h.exit === "held" && seatOwnsHop) {
          node.status = pick.still_pick ? "still_pick" : "held";
          break;
        }
      }
      if (!node.children.length && node.status !== "traded" && node.status !== "drafted") {
        if (pick.still_pick) {
          node.status = "still_pick";
          node.holder = pick.holder || node.seat;
        } else if (pick.became) {
          node.became = clean(pick.became);
          node.status = "drafted";
        } else {
          node.status = "held";
        }
        const last = hops.length ? hops[hops.length - 1] : null;
        if (last) {
          if (last.t0 != null) node.hop_t0 = money(last.t0);
          if (last.out != null) node.hop_out = money(last.out);
        }
      }
    }
    return node;
  }

  // Players: next trade out for this seat after receive (skip the receive tx).
  if (playerDepth >= TRADE_WEB_MAX_PLAYER_DEPTH) {
    node.status = "depth_cap";
    return node;
  }

  const outs = outsByAsset.get(String(assetKey)) || [];
  const after = receiveDate ? String(receiveDate) : "";
  const uid = String(seatUserId);
  const blockTx = new Set(
    [skipTxId, opts.receiveTxId].filter(Boolean).map((x) => String(x)),
  );
  const candidates = [];
  for (const leg of outs) {
    if (String(leg.from_user_id) !== uid) continue;
    if (blockTx.has(String(leg.transaction_id))) continue;
    const meta = txMeta(tradesById, leg.transaction_id);
    const d = meta.date ? String(meta.date) : "";
    if (after && d && d < after) continue;
    candidates.push({ leg, meta });
  }
  candidates.sort((a, b) => String(a.meta.date || "").localeCompare(String(b.meta.date || ""))
    || String(a.leg.transaction_id).localeCompare(String(b.leg.transaction_id)));
  const next = candidates[0] || null;
  if (next) {
    const meta = next.meta;
    node.status = "traded";
    node.exit = { ...meta, to: null };
    const txRows = byTx.get(String(meta.transaction_id)) || [];
    const inLeg = txRows.find((l) => l.direction === "in" && String(l.asset_key) === String(assetKey));
    if (inLeg) {
      node.exit.to_user_id = inLeg.to_user_id != null ? String(inLeg.to_user_id) : null;
      node.exit.to = seatName(nameByUser, inLeg.to_user_id);
    }
    const bag = returnBag(byTx, meta.transaction_id, seatUserId);
    for (const bagLeg of bag) {
      if (String(bagLeg.asset_key) === String(assetKey)) continue;
      node.children.push(expandBranch({
        ...opts,
        assetKey: String(bagLeg.asset_key),
        label: bagLeg.label,
        kind: bagLeg.kind,
        receiveDate: meta.date || receiveDate,
        depth: depth + 1,
        playerDepth: playerDepth + 1,
        skipTxId: String(meta.transaction_id),
        receiveTxId: String(meta.transaction_id),
        path: nextPath,
      }));
    }
    return node;
  }

  const dropped = dropAfter(moves, assetKey, seatUserId, receiveDate);
  if (dropped) {
    node.status = "dropped";
    node.exit = dropped;
    return node;
  }

  node.status = "held";
  return node;
}

function annotateNodeValues(node, price, asOf) {
  if (!node) return;
  const vin = price(node.asset_key, node.receive_date, node.hop_t0);
  node.value_in = vin ? vin.value : (node.hop_t0 != null ? node.hop_t0 : null);
  node.value_in_as_of = vin ? vin.as_of : null;

  if (node.status === "traded" && node.exit && node.exit.date) {
    const vout = price(node.asset_key, node.exit.date, null);
    node.value_out = vout ? vout.value : null;
    node.value_out_as_of = vout ? vout.as_of : null;
  } else if (node.status === "dropped" && node.exit && node.exit.date) {
    const vout = price(node.asset_key, node.exit.date, null);
    node.value_out = vout ? vout.value : null;
  }

  if (node.status === "held" || node.status === "still_pick" || node.status === "depth_cap") {
    const vnow = price(node.asset_key, asOf, node.hop_out);
    node.value_now = vnow ? vnow.value : (node.hop_out != null ? node.hop_out : null);
    node.value_now_as_of = vnow ? vnow.as_of : asOf;
    if (node.value_in != null && node.value_now != null) {
      node.mark_pnl = money(node.value_now - node.value_in);
    }
  } else if (node.status === "drafted" && !(node.children || []).length) {
    const vnow = price(node.asset_key, asOf, node.hop_out);
    node.value_now = vnow ? vnow.value : (node.hop_out != null ? node.hop_out : null);
  }

  for (const child of node.children || []) annotateNodeValues(child, price, asOf);

  if ((node.children || []).length && (node.status === "traded" || node.status === "drafted")) {
    let got = 0;
    let priced = 0;
    for (const c of node.children) {
      if (c.value_in != null) {
        got += c.value_in;
        priced += 1;
      }
    }
    if (priced) {
      node.deal_got = money(got);
      const gave = node.value_out != null ? node.value_out
        : (node.value_in != null ? node.value_in : null);
      node.deal_gave = gave;
      if (gave != null) node.deal_pnl = money(got - gave);
    }
  }
}

function sumOpenMark(nodes) {
  let total = 0;
  let n = 0;
  function walk(node) {
    if (!node) return;
    if ((node.status === "held" || node.status === "still_pick") && node.mark_pnl != null) {
      total += node.mark_pnl;
      n += 1;
    }
    for (const c of node.children || []) walk(c);
  }
  for (const node of nodes || []) walk(node);
  return n ? money(total) : null;
}

function sumRealized(nodes) {
  let total = 0;
  let n = 0;
  function walk(node) {
    if (!node) return;
    if (node.deal_pnl != null && (node.children || []).length) {
      total += node.deal_pnl;
      n += 1;
    }
    for (const c of node.children || []) walk(c);
  }
  for (const node of nodes || []) walk(node);
  return n ? money(total) : null;
}

/**
 * Flat node-link graph for the SVG web view.
 */
export function webToGraph(web) {
  const nodes = [];
  const edges = [];
  if (!web || !web.root) return { nodes, edges };

  const rootId = "root";
  nodes.push({
    id: rootId,
    label: web.root.label,
    kind: "player",
    status: "sent",
    seat: web.seat,
    value: web.gave_value,
    depth: 0,
    slot: 0,
  });

  const hubId = `tx:${web.transaction_id || "0"}`;
  nodes.push({
    id: hubId,
    label: web.date || "trade",
    kind: "trade",
    status: "deal",
    seat: web.seat,
    pnl: web.deal_pnl,
    value: web.gave_value,
    depth: 1,
    slot: 0,
  });
  edges.push({
    from: rootId,
    to: hubId,
    date: web.date || null,
    value: web.gave_value,
    pnl: web.deal_pnl,
    lab: web.deal_pnl != null
      ? ((web.deal_pnl >= 0 ? "+" : "") + String(web.deal_pnl))
      : (web.gave_value != null ? String(web.gave_value) : ""),
    kind: "exit",
  });

  let slotCounter = 0;
  function walk(node, parentId, depth) {
    if (!node) return;
    const mySlot = slotCounter++;
    const id = `${node.asset_key}@${depth}.${mySlot}`;
    nodes.push({
      id,
      label: node.label,
      kind: node.kind || "asset",
      status: node.status,
      seat: node.seat,
      value: node.value_now != null ? node.value_now : node.value_in,
      value_in: node.value_in,
      value_now: node.value_now,
      value_out: node.value_out,
      mark_pnl: node.mark_pnl != null ? node.mark_pnl : null,
      deal_pnl: node.deal_pnl != null ? node.deal_pnl : null,
      depth,
      slot: mySlot,
    });
    edges.push({
      from: parentId,
      to: id,
      date: node.receive_date || null,
      value: node.value_in,
      pnl: null,
      lab: node.value_in != null ? String(node.value_in) : "",
      kind: "receive",
    });

    if (node.status === "traded" && (node.children || []).length) {
      const nextId = `next:${id}`;
      const nextLab = (node.exit && node.exit.date) || "next trade";
      nodes.push({
        id: nextId,
        label: nextLab,
        kind: "trade",
        status: "deal",
        seat: node.seat,
        pnl: node.deal_pnl,
        value: node.value_out,
        depth: depth + 1,
        slot: mySlot,
      });
      edges.push({
        from: id,
        to: nextId,
        date: node.exit && node.exit.date || null,
        value: node.value_out,
        pnl: node.deal_pnl,
        lab: node.deal_pnl != null
          ? ((node.deal_pnl >= 0 ? "+" : "") + String(node.deal_pnl))
          : (node.value_out != null ? String(node.value_out) : "next"),
        kind: "next_trade",
      });
      for (const c of node.children) walk(c, nextId, depth + 2);
    } else if ((node.children || []).length) {
      for (const c of node.children) walk(c, id, depth + 1);
    } else if (node.mark_pnl != null) {
      // Leaf hold: annotate last receive edge with mark Δ when useful.
      const last = edges[edges.length - 1];
      if (last && last.to === id) {
        last.pnl = node.mark_pnl;
        last.lab = (node.mark_pnl >= 0 ? "+" : "") + String(node.mark_pnl)
          + (node.value_now != null ? ` now ${node.value_now}` : "");
        last.kind = "mark";
      }
    }
  }

  for (const b of web.branches || []) walk(b, hubId, 2);
  return { nodes, edges };
}

/**
 * Build one rooted web: seat sent rootAsset in txId.
 */
export function buildTradeWebRoot(opts = {}) {
  const {
    rootAssetKey,
    rootLabel,
    seatUserId,
    transactionId,
    nameByUser = {},
    legsIndex,
    tradesById,
    picksBook = null,
    moves = [],
    nameIndex = null,
    price = null,
    asOf = new Date().toISOString().slice(0, 10),
  } = opts;
  const meta = txMeta(tradesById, transactionId);
  const bag = returnBag(legsIndex.byTx, transactionId, seatUserId);
  const visited = new Set();
  const nodeBudget = { count: 0 };
  const children = bag.map((leg) => expandBranch({
    assetKey: String(leg.asset_key),
    label: leg.label,
    kind: leg.kind,
    seatUserId,
    receiveDate: meta.date,
    depth: 1,
    playerDepth: 0,
    visited,
    nameByUser,
    byTx: legsIndex.byTx,
    outsByAsset: legsIndex.outsByAsset,
    tradesById,
    picksBook,
    moves,
    nodeBudget,
    nameIndex,
    skipTxId: String(transactionId),
    receiveTxId: String(transactionId),
    path: [String(rootAssetKey)],
  }));

  const txRows = legsIndex.byTx.get(String(transactionId)) || [];
  const inRoot = txRows.find((l) => l.direction === "in" && String(l.asset_key) === String(rootAssetKey));
  const partnerId = inRoot && inRoot.to_user_id != null ? String(inRoot.to_user_id) : null;

  const priceFn = price || (() => null);
  for (const child of children) annotateNodeValues(child, priceFn, asOf);

  const gaveP = priceFn(rootAssetKey, meta.date, null);
  const gave_value = gaveP ? gaveP.value : null;
  let got = 0;
  let gotN = 0;
  for (const c of children) {
    if (c.value_in != null) {
      got += c.value_in;
      gotN += 1;
    }
  }
  const got_value = gotN ? money(got) : null;
  const deal_pnl = (gave_value != null && got_value != null) ? money(got_value - gave_value) : null;
  const mark_pnl = sumOpenMark(children);
  const realized_pnl = sumRealized(children);
  const trail_pnl = [deal_pnl, mark_pnl, realized_pnl]
    .filter((x) => x != null)
    .reduce((a, b) => a + b, 0);
  const trail = (deal_pnl != null || mark_pnl != null || realized_pnl != null)
    ? money(trail_pnl)
    : null;

  const web = {
    root: {
      asset_key: String(rootAssetKey),
      label: clean(rootLabel) || String(rootAssetKey),
      kind: "player",
    },
    seat_user_id: String(seatUserId),
    seat: seatName(nameByUser, seatUserId),
    partner_user_id: partnerId,
    partner: partnerId ? seatName(nameByUser, partnerId) : null,
    transaction_id: String(transactionId),
    date: meta.date,
    season: meta.season,
    week: meta.week,
    received_n: children.length,
    branches: children,
    gave_value,
    got_value,
    deal_pnl,
    mark_pnl,
    realized_pnl,
    trail_pnl: trail,
    thesis: "",
  };
  web.thesis = buildThesis(web);
  web.graph = webToGraph(web);
  return web;
}

function branchSummary(node) {
  if (!node) return "";
  const v = node.value_in != null ? ` (${node.value_in})` : "";
  if (node.status === "held" || node.status === "still_pick") {
    const m = node.mark_pnl != null
      ? ` · aged ${node.mark_pnl >= 0 ? "+" : ""}${node.mark_pnl}`
      : "";
    return `${node.label}${v} (still on ${node.seat}${m})`;
  }
  if (node.status === "dropped") {
    return `${node.label}${v} (dropped${node.exit && node.exit.date ? " " + node.exit.date : ""})`;
  }
  if (node.status === "traded") {
    const n = (node.children || []).length;
    const pnl = node.deal_pnl != null
      ? ` · next trade ${node.deal_pnl >= 0 ? "+" : ""}${node.deal_pnl}`
      : "";
    if (n) {
      return `${node.label}${v} → traded again${node.exit && node.exit.to ? " to " + node.exit.to : ""}${pnl}`;
    }
    return `${node.label}${v} → traded again${node.exit && node.exit.to ? " to " + node.exit.to : ""} · no return`;
  }
  if (node.status === "drafted") {
    return `${node.label}${v}${node.became ? " → " + node.became : " (drafted)"}`;
  }
  return node.label + v;
}

function buildThesis(web) {
  const rootLab = web.root.label;
  const seat = web.seat;
  const when = web.date || "that trade";
  const children = web.branches || [];
  const deal = web.deal_pnl != null
    ? ` · deal ${web.deal_pnl >= 0 ? "+" : ""}${web.deal_pnl}`
    : "";
  if (!children.length) {
    return `${seat} traded away ${rootLab} on ${when}${deal} — no return bag on the tape.`;
  }
  const bits = children.slice(0, 4).map(branchSummary);
  const trail = web.trail_pnl != null
    ? ` · trail ${web.trail_pnl >= 0 ? "+" : ""}${web.trail_pnl}`
    : "";
  return `${seat} traded away ${rootLab} on ${when}${deal}${trail} · turned into ${bits.join(" · ")}`;
}

function slimNode(node, depth = 0) {
  if (!node) return null;
  const kids = depth >= TRADE_WEB_SLIM_DEPTH
    ? []
    : (node.children || []).map((c) => slimNode(c, depth + 1)).filter(Boolean);
  return {
    asset_key: node.asset_key,
    label: node.label,
    kind: node.kind,
    status: node.status,
    seat: node.seat,
    seat_user_id: node.seat_user_id || null,
    receive_date: node.receive_date || null,
    exit: node.exit || null,
    became: node.became || null,
    holder: node.holder || null,
    value_in: node.value_in != null ? node.value_in : null,
    value_out: node.value_out != null ? node.value_out : null,
    value_now: node.value_now != null ? node.value_now : null,
    mark_pnl: node.mark_pnl != null ? node.mark_pnl : null,
    deal_pnl: node.deal_pnl != null ? node.deal_pnl : null,
    deal_got: node.deal_got != null ? node.deal_got : null,
    deal_gave: node.deal_gave != null ? node.deal_gave : null,
    children: kids,
  };
}

function slimGraph(graph) {
  if (!graph) return { nodes: [], edges: [] };
  return {
    nodes: (graph.nodes || []).map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      status: n.status,
      seat: n.seat || null,
      value: n.value != null ? n.value : null,
      value_in: n.value_in != null ? n.value_in : null,
      value_now: n.value_now != null ? n.value_now : null,
      mark_pnl: n.mark_pnl != null ? n.mark_pnl : null,
      deal_pnl: n.deal_pnl != null ? n.deal_pnl : null,
      pnl: n.pnl != null ? n.pnl : null,
      depth: n.depth,
      slot: n.slot,
    })),
    edges: (graph.edges || []).map((e) => ({
      from: e.from,
      to: e.to,
      date: e.date || null,
      value: e.value != null ? e.value : null,
      pnl: e.pnl != null ? e.pnl : null,
      lab: e.lab || "",
      kind: e.kind || "link",
    })),
  };
}

function slimWeb(web) {
  if (!web) return null;
  return {
    root: web.root,
    seat_user_id: web.seat_user_id,
    seat: web.seat,
    partner_user_id: web.partner_user_id || null,
    partner: web.partner || null,
    transaction_id: web.transaction_id,
    date: web.date || null,
    season: web.season || null,
    week: web.week != null ? web.week : null,
    received_n: web.received_n || 0,
    thesis: web.thesis || "",
    gave_value: web.gave_value != null ? web.gave_value : null,
    got_value: web.got_value != null ? web.got_value : null,
    deal_pnl: web.deal_pnl != null ? web.deal_pnl : null,
    mark_pnl: web.mark_pnl != null ? web.mark_pnl : null,
    realized_pnl: web.realized_pnl != null ? web.realized_pnl : null,
    trail_pnl: web.trail_pnl != null ? web.trail_pnl : null,
    branches: (web.branches || []).map((b) => slimNode(b, 0)).filter(Boolean),
    // Graph is rebuilt in the page from branches — keep the book slim for Pages.
  };
}

/**
 * All exit webs for a player asset across seats.
 */
export function websForPlayer(opts = {}) {
  const {
    assetKey,
    label,
    nameByUser,
    legsIndex,
    tradesById,
    picksBook,
    moves,
    nameIndex,
    price,
    asOf,
  } = opts;
  const outs = legsIndex.outsByAsset.get(String(assetKey)) || [];
  const webs = [];
  const seen = new Set();
  for (const leg of outs) {
    const seat = leg.from_user_id != null ? String(leg.from_user_id) : "";
    const tx = String(leg.transaction_id);
    const k = `${seat}|${tx}`;
    if (!seat || seen.has(k)) continue;
    seen.add(k);
    webs.push(buildTradeWebRoot({
      rootAssetKey: assetKey,
      rootLabel: label || leg.label,
      seatUserId: seat,
      transactionId: tx,
      nameByUser,
      legsIndex,
      tradesById,
      picksBook,
      moves,
      nameIndex,
      price,
      asOf,
    }));
  }
  webs.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))
    || String(a.seat).localeCompare(String(b.seat)));
  return webs;
}

/**
 * Build the League Data book: searchable players with precomputed webs.
 */
export function buildTradeWebBook(opts = {}) {
  const {
    legs = [],
    trades = [],
    picksBook = null,
    moves = [],
    nameByUser = {},
    playersNfl = {},
    curve = [],
    leagueId = "",
    asOf = new Date().toISOString().slice(0, 10),
  } = opts;

  const tradesById = new Map();
  for (const t of trades || []) {
    if (t && t.transaction_id != null) tradesById.set(String(t.transaction_id), t);
  }
  const legsIndex = indexTradeLegs(legs);
  const nameIndex = buildPlayerNameIndex(playersNfl, legs);
  const curveIdx = indexCurve(curve);
  const vmaxIdx = indexVmax(curve);
  const price = makePricer(curveIdx, vmaxIdx);

  function playerLabel(assetKey, fallback) {
    const pid = String(assetKey).startsWith("player:")
      ? String(assetKey).slice("player:".length) : "";
    const p = pid && playersNfl[pid];
    if (p) {
      return clean(p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name)
        || fallback || assetKey;
    }
    return clean(fallback) || assetKey;
  }

  const players = [];
  for (const [assetKey, outs] of legsIndex.outsByAsset.entries()) {
    if (!String(assetKey).startsWith("player:")) continue;
    if (!(outs || []).length) continue;
    const label = playerLabel(assetKey, outs[0] && outs[0].label);
    const webs = websForPlayer({
      assetKey,
      label,
      nameByUser,
      legsIndex,
      tradesById,
      picksBook,
      moves,
      nameIndex,
      price,
      asOf,
    }).slice(0, TRADE_WEB_MAX_EXITS_PER_PLAYER).map(slimWeb);
    if (!webs.length) continue;
    const seats = [...new Set(webs.map((w) => w.seat).filter(Boolean))];
    players.push({
      key: assetKey,
      asset_key: assetKey,
      player_id: String(assetKey).slice("player:".length),
      name: label,
      n_exits: webs.length,
      seats,
      seat_lab: seats.join(" · "),
      thesis: webs[0] ? webs[0].thesis : "",
      trail_pnl: webs[0] && webs[0].trail_pnl != null ? webs[0].trail_pnl : null,
      deal_pnl: webs[0] && webs[0].deal_pnl != null ? webs[0].deal_pnl : null,
      webs,
    });
  }

  players.sort((a, b) => {
    const ta = a.trail_pnl != null ? Math.abs(a.trail_pnl) : -1;
    const tb = b.trail_pnl != null ? Math.abs(b.trail_pnl) : -1;
    return tb - ta
      || (Number(b.n_exits) || 0) - (Number(a.n_exits) || 0)
      || String(a.name).localeCompare(String(b.name));
  });

  return {
    v: TRADE_WEB_BOOK_V,
    as_of: asOf,
    league_id: String(leagueId || ""),
    n_players: players.length,
    pricing: {
      curve: "DynastyProcess flatten (Cornerstone day-of) + pick hop t0/out fallback",
      deal: "got − gave on the first trade day",
      aged: "value_now − value_in on still-held pieces (how the bag aged)",
      next_trade: "got − gave when a return piece is traded again",
      trail: "first deal + later trade P&L + aged mark — net value created or destroyed",
    },
    rule: {
      root: "A player leaves a seat in a trade.",
      branch: "Every asset that seat received on that same deal.",
      recurse: "Later trades, drops, and drafted picks for those pieces — history → today.",
      value: "Follow one piece into a bag, then through later trades; trail adds deal + next-trade + aging.",
      caps: `Player depth ≤${TRADE_WEB_MAX_PLAYER_DEPTH}; pick hops ≤${TRADE_WEB_MAX_PICK_HOPS}.`,
    },
    players,
  };
}
