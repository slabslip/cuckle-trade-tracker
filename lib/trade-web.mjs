/**
 * Trade web — league-wide asset lineage.
 *
 * Pick a player. Walk every hop across every manager from first possession
 * to today. At each trade, branch the full package (every asset that moved),
 * then keep expanding those pieces. Same view for anyone.
 */

import {
  indexCurve,
  indexVmax,
  pricePickAt,
  pricePlayerAt,
} from "./cornerstone-trades.mjs";

export const TRADE_WEB_BOOK_V = 3;
/** Soft safety only — high enough for long careers + package branches. */
export const TRADE_WEB_MAX_PLAYER_DEPTH = 16;
export const TRADE_WEB_MAX_PICK_HOPS = 24;
export const TRADE_WEB_MAX_NODES = 220;
export const TRADE_WEB_MAX_EXITS_PER_PLAYER = 12;
export const TRADE_WEB_SLIM_DEPTH = 14;

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
  const insByAsset = new Map();
  for (const leg of legs || []) {
    if (!leg || !leg.transaction_id || !leg.asset_key) continue;
    const tx = String(leg.transaction_id);
    const key = String(leg.asset_key);
    if (!byTx.has(tx)) byTx.set(tx, []);
    byTx.get(tx).push(leg);
    if (leg.direction === "out") {
      if (!outsByAsset.has(key)) outsByAsset.set(key, []);
      outsByAsset.get(key).push(leg);
    } else if (leg.direction === "in") {
      if (!insByAsset.has(key)) insByAsset.set(key, []);
      insByAsset.get(key).push(leg);
    }
  }
  return { byTx, outsByAsset, insByAsset };
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
  const uid = seatUserId != null ? String(seatUserId) : "";
  const after = afterDate ? String(afterDate) : "";
  let hit = null;
  for (const m of moves || []) {
    if (!m || !m.drops) continue;
    if (m.drops[pid] == null) continue;
    const date = m.date ? String(m.date).slice(0, 10)
      : (m.created ? new Date(m.created).toISOString().slice(0, 10) : "");
    if (after && date && date < after) continue;
    if (uid && m.user_id != null && String(m.user_id) !== uid) continue;
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

function sortLegsByDate(legs, tradesById) {
  return (legs || []).slice().sort((a, b) => {
    const da = String(txMeta(tradesById, a.transaction_id).date || "");
    const db = String(txMeta(tradesById, b.transaction_id).date || "");
    return da.localeCompare(db)
      || String(a.transaction_id).localeCompare(String(b.transaction_id));
  });
}

/**
 * Next time this asset leaves a roster after afterDate.
 * Prefer the current holder when several same-day outs exist.
 */
function nextOutForAsset(outsByAsset, tradesById, assetKey, afterDate, preferUserId, blockTx) {
  const outs = outsByAsset.get(String(assetKey)) || [];
  const after = afterDate ? String(afterDate) : "";
  const blocked = blockTx || new Set();
  const cands = [];
  for (const leg of outs) {
    const tx = String(leg.transaction_id);
    if (blocked.has(tx)) continue;
    const meta = txMeta(tradesById, tx);
    const d = meta.date ? String(meta.date) : "";
    if (after && d && d < after) continue;
    // Same calendar day as receive: only count if this holder is sending.
    if (after && d === after && preferUserId
      && String(leg.from_user_id) !== String(preferUserId)) {
      continue;
    }
    cands.push({ leg, meta });
  }
  cands.sort((a, b) => {
    const da = String(a.meta.date || "");
    const db = String(b.meta.date || "");
    if (da !== db) return da.localeCompare(db);
    const pa = preferUserId && String(a.leg.from_user_id) === String(preferUserId) ? 0 : 1;
    const pb = preferUserId && String(b.leg.from_user_id) === String(preferUserId) ? 0 : 1;
    return pa - pb || String(a.leg.transaction_id).localeCompare(String(b.leg.transaction_id));
  });
  return cands[0] || null;
}

function careerEvents(legsIndex, tradesById, assetKey) {
  const events = [];
  for (const leg of legsIndex.outsByAsset.get(String(assetKey)) || []) {
    const meta = txMeta(tradesById, leg.transaction_id);
    events.push({
      date: meta.date || "",
      kind: "out",
      seat_user_id: leg.from_user_id != null ? String(leg.from_user_id) : "",
      transaction_id: String(leg.transaction_id),
      label: leg.label,
    });
  }
  for (const leg of legsIndex.insByAsset.get(String(assetKey)) || []) {
    const meta = txMeta(tradesById, leg.transaction_id);
    events.push({
      date: meta.date || "",
      kind: "in",
      seat_user_id: leg.to_user_id != null ? String(leg.to_user_id) : "",
      transaction_id: String(leg.transaction_id),
      label: leg.label,
    });
  }
  events.sort((a, b) => String(a.date).localeCompare(String(b.date))
    || String(a.transaction_id).localeCompare(String(b.transaction_id))
    || a.kind.localeCompare(b.kind));
  return events;
}

/**
 * Expand one asset from a possession point across any manager.
 * At each trade, branch every received asset in that deal, then continue.
 */
function expandAssetLineage(opts) {
  const {
    assetKey,
    label,
    kind,
    holderUserId,
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
    blockTx,
    focusKey,
  } = opts;
  const path = Array.isArray(opts.path) ? opts.path : [];
  const key = String(assetKey);
  const isFocus = focusKey && key === String(focusKey);

  // Package side-branches: don't re-enter an ancestor asset (except focus spine).
  if (!isFocus && path.includes(key)) {
    return {
      asset_key: key,
      label: clean(label) || key,
      kind: kind || (key.startsWith("pick:") ? "pick" : "player"),
      status: "cycle",
      seat: seatName(nameByUser, holderUserId),
      seat_user_id: holderUserId != null ? String(holderUserId) : null,
      children: [],
      role: "cycle",
    };
  }

  if (nodeBudget.count >= TRADE_WEB_MAX_NODES) {
    return {
      asset_key: key,
      label: clean(label) || key,
      kind: kind || (key.startsWith("pick:") ? "pick" : "player"),
      status: "truncated",
      seat: seatName(nameByUser, holderUserId),
      seat_user_id: holderUserId != null ? String(holderUserId) : null,
      children: [],
      role: "truncated",
    };
  }
  nodeBudget.count += 1;

  const visitKey = `${key}|${holderUserId || ""}|${receiveDate || ""}|${depth}`;
  if (visited.has(visitKey)) {
    return {
      asset_key: key,
      label: clean(label) || key,
      kind: kind || (key.startsWith("pick:") ? "pick" : "player"),
      status: "cycle",
      seat: seatName(nameByUser, holderUserId),
      seat_user_id: holderUserId != null ? String(holderUserId) : null,
      children: [],
      role: "cycle",
    };
  }
  visited.add(visitKey);

  const nextPath = isFocus ? path : path.concat([key]);
  const node = {
    asset_key: key,
    label: clean(label) || key,
    kind: kind || (key.startsWith("pick:") ? "pick" : "player"),
    status: "held",
    seat: seatName(nameByUser, holderUserId),
    seat_user_id: holderUserId != null ? String(holderUserId) : null,
    receive_date: receiveDate || null,
    hop_t0: null,
    hop_out: null,
    role: isFocus ? "spine" : "package",
    children: [],
  };

  // Enrich pick labels / hop values from picks book.
  if (node.kind === "pick") {
    const pick = pickNodeFromBook(picksBook, key);
    if (pick) {
      node.label = clean(pick.label) || node.label;
      const hops = Array.isArray(pick.hops) ? pick.hops : [];
      const after = receiveDate ? String(receiveDate) : "";
      for (const h of hops) {
        if (!h) continue;
        const hd = h.date ? String(h.date).slice(0, 10) : "";
        if (after && hd && hd < after) continue;
        if (h.t0 != null) node.hop_t0 = money(h.t0);
        if (h.out != null) node.hop_out = money(h.out);
      }
      if (pick.holder) node.holder = pick.holder;
    }
  }

  if (!isFocus && playerDepth >= TRADE_WEB_MAX_PLAYER_DEPTH) {
    node.status = "depth_cap";
    return node;
  }

  const blocked = new Set([...(blockTx || [])].map(String));
  const next = nextOutForAsset(
    outsByAsset,
    tradesById,
    key,
    receiveDate,
    holderUserId,
    blocked,
  );

  if (next) {
    const meta = next.meta;
    const txId = String(meta.transaction_id);
    const txRows = byTx.get(txId) || [];
    const inLeg = txRows.find((l) => l.direction === "in" && String(l.asset_key) === key);
    const toId = inLeg && inLeg.to_user_id != null ? String(inLeg.to_user_id) : null;
    const fromId = next.leg.from_user_id != null ? String(next.leg.from_user_id) : null;

    node.status = "traded";
    node.exit = {
      ...meta,
      from_user_id: fromId,
      from: fromId ? seatName(nameByUser, fromId) : null,
      to_user_id: toId,
      to: toId ? seatName(nameByUser, toId) : null,
    };

    // Full package: every asset received on this deal (all managers).
    // Expand the focus spine FIRST so career hops aren't starved by package budget.
    const receives = txRows.filter((l) => l.direction === "in");
    const nextBlock = new Set(blocked);
    nextBlock.add(txId);
    const spineLegs = [];
    const packageLegs = [];
    for (const leg of receives) {
      const childKey = String(leg.asset_key);
      const childIsFocus = focusKey && childKey === String(focusKey);
      if (childIsFocus) spineLegs.push(leg);
      else packageLegs.push(leg);
    }
    for (const leg of spineLegs.concat(packageLegs)) {
      const childKey = String(leg.asset_key);
      const childIsFocus = focusKey && childKey === String(focusKey);
      const childHolder = leg.to_user_id != null ? String(leg.to_user_id) : null;
      // Skip expanding unrelated package pieces that are the same as an ancestor
      // unless it's the focus spine continuing.
      if (!childIsFocus && nextPath.includes(childKey)) continue;

      const child = expandAssetLineage({
        ...opts,
        assetKey: childKey,
        label: leg.label,
        kind: leg.kind,
        holderUserId: childHolder,
        receiveDate: meta.date || receiveDate,
        depth: depth + 1,
        playerDepth: childIsFocus ? playerDepth : playerDepth + 1,
        blockTx: nextBlock,
        path: nextPath,
      });
      child.role = childIsFocus ? "spine" : "package";
      node.children.push(child);
    }

    // Drafted pick with no further pick outs: attach became player if missing as child.
    if (node.kind === "pick" && !(node.children || []).length) {
      const pick = pickNodeFromBook(picksBook, key);
      if (pick && pick.became) {
        const becameName = clean(pick.became);
        const becameKey = pick.became_key
          || (pick.player_key ? String(pick.player_key) : null)
          || (pick.became_player_id ? `player:${pick.became_player_id}` : null)
          || (becameName && nameIndex ? nameIndex.get(becameName.toLowerCase()) : null)
          || null;
        node.status = "drafted";
        node.became = becameName;
        if (becameKey) {
          node.children.push(expandAssetLineage({
            ...opts,
            assetKey: becameKey,
            label: becameName,
            kind: "player",
            holderUserId: holderUserId,
            receiveDate: meta.date || receiveDate,
            depth: depth + 1,
            playerDepth: playerDepth + 1,
            blockTx: nextBlock,
            path: nextPath,
          }));
        }
      }
    }
    return node;
  }

  // No further trade — draft resolution for picks still open on this seat.
  if (node.kind === "pick") {
    const pick = pickNodeFromBook(picksBook, key);
    if (pick && pick.became && !pick.still_pick) {
      node.status = "drafted";
      node.became = clean(pick.became);
      const becameName = node.became;
      const becameKey = pick.became_key
        || (pick.player_key ? String(pick.player_key) : null)
        || (pick.became_player_id ? `player:${pick.became_player_id}` : null)
        || (becameName && nameIndex ? nameIndex.get(becameName.toLowerCase()) : null)
        || null;
      if (becameKey && !nextPath.includes(becameKey)) {
        node.children.push(expandAssetLineage({
          ...opts,
          assetKey: becameKey,
          label: becameName,
          kind: "player",
          holderUserId: holderUserId,
          receiveDate: receiveDate,
          depth: depth + 1,
          playerDepth: playerDepth + 1,
          blockTx: blocked,
          path: nextPath,
        }));
      }
      return node;
    }
    if (pick && pick.still_pick) {
      node.status = "still_pick";
      node.holder = pick.holder || node.seat;
      return node;
    }
  }

  const dropped = dropAfter(moves, key, holderUserId, receiveDate);
  if (dropped) {
    node.status = "dropped";
    node.exit = dropped;
    return node;
  }

  node.status = node.kind === "pick" ? "still_pick" : "held";
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

  if ((node.children || []).length && node.status === "traded") {
    // Deal P&L for the seat that sent this node: sum of package pieces they received
    // (children whose receive seat matches exit.from), else sum of non-spine children.
    const fromId = node.exit && node.exit.from_user_id;
    let got = 0;
    let priced = 0;
    for (const c of node.children) {
      if (c.role === "spine") continue;
      if (fromId && c.seat_user_id && String(c.seat_user_id) !== String(fromId)) continue;
      if (c.value_in != null) {
        got += c.value_in;
        priced += 1;
      }
    }
    // Fallback: any non-spine child values.
    if (!priced) {
      for (const c of node.children) {
        if (c.role === "spine") continue;
        if (c.value_in != null) {
          got += c.value_in;
          priced += 1;
        }
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

function collectSpine(node, out = []) {
  if (!node) return out;
  if (node.role === "spine" || out.length === 0) {
    out.push({
      asset_key: node.asset_key,
      label: node.label,
      seat: node.seat,
      seat_user_id: node.seat_user_id,
      status: node.status,
      receive_date: node.receive_date,
      exit: node.exit || null,
      value_in: node.value_in,
      value_out: node.value_out,
      value_now: node.value_now,
      deal_pnl: node.deal_pnl,
      mark_pnl: node.mark_pnl,
    });
  }
  const spineChild = (node.children || []).find((c) => c.role === "spine"
    && String(c.asset_key) === String(node.asset_key));
  if (spineChild) collectSpine(spineChild, out);
  else {
    // drafted into a player
    const drafted = (node.children || []).find((c) => c.kind === "player" && node.status === "drafted");
    if (drafted) collectSpine(drafted, out);
  }
  return out;
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
    status: "origin",
    seat: web.origin && web.origin.seat,
    value: web.origin && web.origin.value,
    asset_key: web.root.asset_key,
    depth: 0,
    slot: 0,
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
      asset_key: node.asset_key,
      role: node.role || null,
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
      pnl: node.role === "spine" && node.deal_pnl != null ? node.deal_pnl : null,
      lab: node.deal_pnl != null && node.status === "traded"
        ? ((node.deal_pnl >= 0 ? "+" : "") + String(node.deal_pnl))
        : (node.value_in != null ? String(node.value_in) : ""),
      kind: node.role === "spine" ? "spine" : "package",
    });

    if (node.status === "traded" && (node.children || []).length) {
      const nextId = `tx:${id}`;
      const toSeat = node.exit && node.exit.to ? String(node.exit.to) : "";
      const shortTo = toSeat.length > 12 ? `${toSeat.slice(0, 11)}…` : toSeat;
      nodes.push({
        id: nextId,
        label: shortTo ? `→ ${shortTo}` : "Trade",
        kind: "trade",
        status: "deal",
        seat: node.exit && node.exit.to,
        date: (node.exit && node.exit.date) || null,
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
        // Date/P&L live on the trade bubble — keep the edge clear.
        lab: "",
        kind: "next_trade",
      });
      for (const c of node.children) walk(c, nextId, depth + 2);
    } else if ((node.children || []).length) {
      for (const c of node.children) walk(c, id, depth + 1);
    } else if (node.mark_pnl != null) {
      const last = edges[edges.length - 1];
      if (last && last.to === id) {
        last.pnl = node.mark_pnl;
        last.lab = (node.mark_pnl >= 0 ? "+" : "") + String(node.mark_pnl)
          + (node.value_now != null ? ` now ${node.value_now}` : "");
        last.kind = "mark";
      }
    }
  }

  // Career web: branches are the first possession node's children already under rootNode.
  if (web.root_node) {
    walk(web.root_node, rootId, 1);
  } else {
    const hubId = `tx:${web.transaction_id || "0"}`;
    const toSeat = web.partner ? String(web.partner) : "";
    const shortTo = toSeat.length > 12 ? `${toSeat.slice(0, 11)}…` : toSeat;
    nodes.push({
      id: hubId,
      label: shortTo ? `→ ${shortTo}` : "Trade",
      kind: "trade",
      status: "deal",
      seat: web.partner || web.seat,
      date: web.date || null,
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
      lab: "",
      kind: "exit",
    });
    for (const b of web.branches || []) walk(b, hubId, 2);
  }
  return { nodes, edges };
}

/**
 * Build one rooted exit web (legacy helper used by tests): seat sent root in tx.
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

  const career = buildAssetCareerWeb({
    assetKey: rootAssetKey,
    label: rootLabel,
    nameByUser,
    legsIndex,
    tradesById,
    picksBook,
    moves,
    nameIndex,
    price,
    asOf,
    preferStartTx: transactionId,
    preferStartSeat: seatUserId,
  });
  return career;
}

/**
 * Full career web for one asset across every manager.
 */
export function buildAssetCareerWeb(opts = {}) {
  const {
    assetKey,
    label,
    nameByUser = {},
    legsIndex,
    tradesById,
    picksBook = null,
    moves = [],
    nameIndex = null,
    price = null,
    asOf = new Date().toISOString().slice(0, 10),
    preferStartTx = null,
    preferStartSeat = null,
  } = opts;

  const key = String(assetKey);
  const events = careerEvents(legsIndex, tradesById, key);
  if (!events.length) return null;

  let startSeat = preferStartSeat != null ? String(preferStartSeat) : "";
  let startDate = null;
  let startTx = preferStartTx != null ? String(preferStartTx) : null;

  if (preferStartTx && preferStartSeat) {
    const meta = txMeta(tradesById, preferStartTx);
    startDate = meta.date;
  } else {
    const firstOut = events.find((e) => e.kind === "out");
    const firstIn = events.find((e) => e.kind === "in");
    if (firstOut && (!firstIn || firstOut.date <= firstIn.date)) {
      startSeat = firstOut.seat_user_id;
      startDate = firstOut.date;
      startTx = firstOut.transaction_id;
    } else if (firstIn) {
      startSeat = firstIn.seat_user_id;
      startDate = firstIn.date;
      startTx = firstIn.transaction_id;
    }
  }

  const priceFn = price || (() => null);
  // Career start: first holder. If preferStart* set, begin on that seat at that trade day
  // so nextOut matches the exit (same-day holder preference).
  let receiveDate = null;
  if (preferStartTx && preferStartSeat) {
    receiveDate = startDate || null;
  } else {
    const firstIn = events.find((e) => e.kind === "in");
    const firstOut = events.find((e) => e.kind === "out");
    if (firstIn && (!firstOut || firstIn.date < firstOut.date)) {
      receiveDate = firstIn.date || null;
    }
  }

  const rootNode = expandAssetLineage({
    assetKey: key,
    label,
    kind: key.startsWith("pick:") ? "pick" : "player",
    holderUserId: startSeat || null,
    receiveDate,
    depth: 0,
    playerDepth: 0,
    visited: new Set(),
    nameByUser,
    byTx: legsIndex.byTx,
    outsByAsset: legsIndex.outsByAsset,
    tradesById,
    picksBook,
    moves,
    nodeBudget: { count: 0 },
    nameIndex,
    blockTx: new Set(),
    path: [],
    focusKey: key,
  });

  annotateNodeValues(rootNode, priceFn, asOf);

  const lastIn = [...events].reverse().find((e) => e.kind === "in");
  const lastOut = [...events].reverse().find((e) => e.kind === "out");
  let nowSeat = null;
  let nowStatus = "held";
  if (lastIn && (!lastOut || String(lastIn.date) > String(lastOut.date)
    || (lastIn.date === lastOut.date && lastIn.transaction_id >= lastOut.transaction_id))) {
    nowSeat = lastIn.seat_user_id;
    nowStatus = "held";
  } else if (lastOut) {
    nowSeat = lastOut.seat_user_id;
    nowStatus = "traded_away";
  }

  const spine = collectSpine(rootNode);
  const originVal = priceFn(key, startDate || asOf, null);
  const nowVal = priceFn(key, asOf, null);

  // Trail follows the focus piece: each spine deal + how the piece aged to today.
  let spineDeal = 0;
  let spineDealN = 0;
  function walkSpineDeals(node) {
    if (!node) return;
    if (String(node.asset_key) === key && node.deal_pnl != null) {
      spineDeal += node.deal_pnl;
      spineDealN += 1;
    }
    for (const c of node.children || []) {
      if (c.role === "spine" || String(c.asset_key) === key) walkSpineDeals(c);
    }
  }
  walkSpineDeals(rootNode);
  const gave_value = rootNode.value_out != null ? rootNode.value_out
    : (rootNode.value_in != null ? rootNode.value_in : (originVal && originVal.value));
  const deal_pnl = rootNode.deal_pnl != null ? rootNode.deal_pnl : null;
  const got_value = rootNode.deal_got != null ? rootNode.deal_got : null;
  const asset_age = (originVal && originVal.value != null && nowVal && nowVal.value != null)
    ? money(nowVal.value - originVal.value)
    : null;
  const realized_pnl = spineDealN ? money(spineDeal) : null;
  const mark_pnl = asset_age;
  const trailBits = [realized_pnl, asset_age].filter((x) => x != null);
  const trail_pnl = trailBits.length ? money(trailBits.reduce((a, b) => a + b, 0)) : null;

  const partner = rootNode.exit && rootNode.exit.to ? rootNode.exit.to : null;
  const web = {
    root: {
      asset_key: key,
      label: clean(label) || key,
      kind: key.startsWith("pick:") ? "pick" : "player",
    },
    root_node: rootNode,
    origin: {
      seat_user_id: startSeat || null,
      seat: startSeat ? seatName(nameByUser, startSeat) : null,
      date: startDate || null,
      transaction_id: startTx,
      value: originVal ? originVal.value : null,
    },
    now: {
      seat_user_id: nowSeat,
      seat: nowSeat ? seatName(nameByUser, nowSeat) : null,
      status: nowStatus,
      value: nowVal ? nowVal.value : null,
    },
    spine,
    seat_user_id: startSeat || null,
    seat: startSeat ? seatName(nameByUser, startSeat) : null,
    partner_user_id: rootNode.exit && rootNode.exit.to_user_id || null,
    partner,
    transaction_id: rootNode.exit && rootNode.exit.transaction_id || startTx,
    date: rootNode.exit && rootNode.exit.date || startDate,
    season: rootNode.exit && rootNode.exit.season || null,
    week: rootNode.exit && rootNode.exit.week != null ? rootNode.exit.week : null,
    received_n: (rootNode.children || []).filter((c) => c.role !== "spine").length,
    branches: rootNode.children || [],
    gave_value: gave_value != null ? money(gave_value) : null,
    got_value,
    deal_pnl,
    mark_pnl,
    realized_pnl,
    trail_pnl,
    n_hops: Math.max(0, spine.length - 1),
    thesis: "",
  };
  web.thesis = buildCareerThesis(web);
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
    const pnl = node.deal_pnl != null
      ? ` · next trade ${node.deal_pnl >= 0 ? "+" : ""}${node.deal_pnl}`
      : "";
    return `${node.label}${v} → ${node.exit && node.exit.to ? node.exit.to : "traded"}${pnl}`;
  }
  if (node.status === "drafted") {
    return `${node.label}${v}${node.became ? " → " + node.became : " (drafted)"}`;
  }
  return node.label + v;
}

function buildCareerThesis(web) {
  const name = web.root.label;
  const origin = web.origin && web.origin.seat ? web.origin.seat : "—";
  const now = web.now && web.now.seat ? web.now.seat : "—";
  const hops = web.n_hops != null ? web.n_hops : 0;
  const trail = web.trail_pnl != null
    ? ` · trail ${web.trail_pnl >= 0 ? "+" : ""}${web.trail_pnl}`
    : "";
  const spineBits = (web.spine || []).slice(0, 5).map((s) => {
    if (s.exit && s.exit.to) return `${s.seat || "?"}→${s.exit.to}`;
    return s.seat || "?";
  });
  const flow = spineBits.length ? ` · ${spineBits.join(" · ")}` : "";
  return `${name}: ${origin} → ${now} · ${hops} hop${hops === 1 ? "" : "s"}${trail}${flow}`;
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
    role: node.role || null,
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

function slimWeb(web) {
  if (!web) return null;
  return {
    root: web.root,
    origin: web.origin || null,
    now: web.now || null,
    spine: (web.spine || []).map((s) => ({
      asset_key: s.asset_key,
      label: s.label,
      seat: s.seat,
      seat_user_id: s.seat_user_id || null,
      status: s.status,
      receive_date: s.receive_date || null,
      exit: s.exit || null,
      value_in: s.value_in != null ? s.value_in : null,
      value_out: s.value_out != null ? s.value_out : null,
      value_now: s.value_now != null ? s.value_now : null,
      deal_pnl: s.deal_pnl != null ? s.deal_pnl : null,
      mark_pnl: s.mark_pnl != null ? s.mark_pnl : null,
    })),
    seat_user_id: web.seat_user_id,
    seat: web.seat,
    partner_user_id: web.partner_user_id || null,
    partner: web.partner || null,
    transaction_id: web.transaction_id,
    date: web.date || null,
    season: web.season || null,
    week: web.week != null ? web.week : null,
    received_n: web.received_n || 0,
    n_hops: web.n_hops || 0,
    thesis: web.thesis || "",
    gave_value: web.gave_value != null ? web.gave_value : null,
    got_value: web.got_value != null ? web.got_value : null,
    deal_pnl: web.deal_pnl != null ? web.deal_pnl : null,
    mark_pnl: web.mark_pnl != null ? web.mark_pnl : null,
    realized_pnl: web.realized_pnl != null ? web.realized_pnl : null,
    trail_pnl: web.trail_pnl != null ? web.trail_pnl : null,
    // Prefer root_node tree; keep branches alias for older UI.
    root_node: web.root_node ? slimNode(web.root_node, 0) : null,
    branches: web.root_node
      ? (slimNode(web.root_node, 0).children || [])
      : (web.branches || []).map((b) => slimNode(b, 0)).filter(Boolean),
  };
}

/**
 * Career web(s) for a player — one full lineage. Optional exit slices kept empty.
 */
export function websForPlayer(opts = {}) {
  const web = buildAssetCareerWeb(opts);
  return web ? [web] : [];
}

/**
 * Build the League Data book: searchable players with full career webs.
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
  // Sort asset leg lists by date once trades are known.
  for (const [key, list] of legsIndex.outsByAsset.entries()) {
    legsIndex.outsByAsset.set(key, sortLegsByDate(list, tradesById));
  }
  for (const [key, list] of legsIndex.insByAsset.entries()) {
    legsIndex.insByAsset.set(key, sortLegsByDate(list, tradesById));
  }

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
  const seen = new Set();
  for (const assetKey of legsIndex.outsByAsset.keys()) {
    if (!String(assetKey).startsWith("player:")) continue;
    if (seen.has(assetKey)) continue;
    seen.add(assetKey);
    const outs = legsIndex.outsByAsset.get(assetKey) || [];
    if (!outs.length) continue;
    const label = playerLabel(assetKey, outs[0] && outs[0].label);
    const web = buildAssetCareerWeb({
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
    });
    if (!web) continue;
    const slim = slimWeb(web);
    const seats = [...new Set((web.spine || []).map((s) => s.seat).filter(Boolean))];
    players.push({
      key: assetKey,
      asset_key: assetKey,
      player_id: String(assetKey).slice("player:".length),
      name: label,
      n_exits: web.n_hops || outs.length,
      n_hops: web.n_hops || 0,
      seats,
      seat_lab: seats.join(" · "),
      origin_lab: web.origin && web.origin.seat ? web.origin.seat : "",
      now_lab: web.now && web.now.seat ? web.now.seat : "",
      thesis: slim.thesis || "",
      trail_pnl: slim.trail_pnl,
      deal_pnl: slim.deal_pnl,
      webs: [slim],
    });
  }

  players.sort((a, b) => {
    const ta = a.trail_pnl != null ? Math.abs(a.trail_pnl) : -1;
    const tb = b.trail_pnl != null ? Math.abs(b.trail_pnl) : -1;
    return tb - ta
      || (Number(b.n_hops) || 0) - (Number(a.n_hops) || 0)
      || String(a.name).localeCompare(String(b.name));
  });

  return {
    v: TRADE_WEB_BOOK_V,
    as_of: asOf,
    league_id: String(leagueId || ""),
    n_players: players.length,
    pricing: {
      curve: "DynastyProcess flatten (Cornerstone day-of) + pick hop t0/out fallback",
      deal: "got − gave for the seat that sent a piece",
      aged: "value_now − value_in on still-held pieces",
      next_trade: "later package P&L along the lineage",
      trail: "deal + later trade P&L + aged mark",
    },
    rule: {
      root: "A player's first known possession in the league.",
      branch: "Every asset that moved in each trade along the way — any manager.",
      recurse: "Follow each piece across seats until held, dropped, or drafted.",
      value: "Same public web for everyone. Click a piece to open its own lineage.",
      caps: `Soft node budget ${TRADE_WEB_MAX_NODES}; depth ≤${TRADE_WEB_MAX_PLAYER_DEPTH}.`,
    },
    players,
  };
}
