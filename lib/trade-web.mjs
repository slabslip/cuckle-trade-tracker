/**
 * Trade web — blockchain-style map of what a traded-away asset turned into.
 *
 * Root: a player leaves a seat in a trade.
 * Branch: every asset that seat received on that same transaction.
 * Recurse: later trades / draft resolutions / drops for those pieces.
 */

export const TRADE_WEB_BOOK_V = 1;
export const TRADE_WEB_MAX_PLAYER_DEPTH = 3;
export const TRADE_WEB_MAX_PICK_HOPS = 6;
export const TRADE_WEB_MAX_NODES = 28;
export const TRADE_WEB_MAX_EXITS_PER_PLAYER = 6;

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
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

function returnBag(byTx, txId, seatUserId) {
  const uid = String(seatUserId);
  const rows = byTx.get(String(txId)) || [];
  return rows.filter((l) => l.direction === "in" && String(l.to_user_id) === uid);
}

function laterOutForSeat(outsByAsset, assetKey, seatUserId, afterDate, tradesById) {
  const uid = String(seatUserId);
  const outs = outsByAsset.get(String(assetKey)) || [];
  const after = afterDate ? String(afterDate) : "";
  const candidates = [];
  for (const leg of outs) {
    if (String(leg.from_user_id) !== uid) continue;
    const meta = txMeta(tradesById, leg.transaction_id);
    const d = meta.date ? String(meta.date) : "";
    if (after && d && d < after) continue;
    candidates.push({ leg, meta });
  }
  candidates.sort((a, b) => String(a.meta.date || "").localeCompare(String(b.meta.date || ""))
    || String(a.leg.transaction_id).localeCompare(String(b.leg.transaction_id)));
  return candidates[0] || null;
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
    // moves may not have user_id; match via roster when provided on move
    const d = m.date ? String(m.date).slice(0, 10) : (m.created ? null : null);
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
  } = opts;

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
    children: [],
  };

  // Picks: follow hops after receive, then draft → player expand.
  if (node.kind === "pick") {
    const pick = pickNodeFromBook(picksBook, assetKey);
    if (pick) {
      node.label = clean(pick.label) || node.label;
      const hops = Array.isArray(pick.hops) ? pick.hops : [];
      const after = receiveDate ? String(receiveDate) : "";
      let hopN = 0;
      for (const h of hops) {
        if (!h) continue;
        const hd = h.date ? String(h.date).slice(0, 10) : "";
        if (after && hd && hd < after) continue;
        hopN += 1;
        if (hopN > TRADE_WEB_MAX_PICK_HOPS) break;
        node.status = h.exit === "drafted" ? "drafted" : (h.exit === "held" ? "held" : "traded");
        node.hop = {
          date: hd || null,
          from: h.from || null,
          to: h.to || null,
          exit: h.exit || null,
          transaction_id: h.transaction_id != null ? String(h.transaction_id) : null,
        };
        // Only keep the next hop away from this seat as a child story when they traded it.
        if (h.exit === "flip" || (h.to && h.from && String(h.from) === node.seat && String(h.to) !== node.seat)) {
          // If this seat flipped the pick, show what they received if we can find the tx.
          if (h.transaction_id) {
            const bag = returnBag(byTx, h.transaction_id, seatUserId);
            for (const leg of bag) {
              node.children.push(expandBranch({
                ...opts,
                assetKey: String(leg.asset_key),
                label: leg.label,
                kind: leg.kind,
                receiveDate: hd || receiveDate,
                depth: depth + 1,
                playerDepth,
              }));
            }
          }
        }
        if (h.exit === "drafted" && pick.became) {
          const becameKey = pick.became_key
            || (pick.player_key ? String(pick.player_key) : null)
            || null;
          // became is often a display name; try player_key fields
          const childKey = becameKey
            || (pick.became_player_id ? `player:${pick.became_player_id}` : null);
          if (childKey) {
            node.children.push(expandBranch({
              ...opts,
              assetKey: childKey,
              label: pick.became,
              kind: "player",
              receiveDate: hd || receiveDate,
              depth: depth + 1,
              playerDepth: playerDepth + 1,
            }));
          } else {
            node.became = clean(pick.became);
          }
        }
        // One meaningful hop layer is enough for readability when still a pick.
        if (node.children.length) break;
      }
      if (pick.still_pick && !node.children.length) {
        node.status = "still_pick";
        node.holder = pick.holder || node.seat;
      } else if (pick.became && !node.children.length) {
        node.became = clean(pick.became);
        node.status = "drafted";
      }
    }
    return node;
  }

  // Players: next trade out for this seat after receive.
  if (playerDepth >= TRADE_WEB_MAX_PLAYER_DEPTH) {
    node.status = "depth_cap";
    return node;
  }

  const next = laterOutForSeat(outsByAsset, assetKey, seatUserId, receiveDate, tradesById);
  if (next) {
    const meta = next.meta;
    node.status = "traded";
    node.exit = {
      ...meta,
      to: null,
    };
    // Partner who received this asset
    const txRows = byTx.get(String(meta.transaction_id)) || [];
    const inLeg = txRows.find((l) => l.direction === "in" && String(l.asset_key) === String(assetKey));
    if (inLeg) {
      node.exit.to_user_id = inLeg.to_user_id != null ? String(inLeg.to_user_id) : null;
      node.exit.to = seatName(nameByUser, inLeg.to_user_id);
    }
    const bag = returnBag(byTx, meta.transaction_id, seatUserId);
    for (const leg of bag) {
      node.children.push(expandBranch({
        ...opts,
        assetKey: String(leg.asset_key),
        label: leg.label,
        kind: leg.kind,
        receiveDate: meta.date || receiveDate,
        depth: depth + 1,
        playerDepth: playerDepth + 1,
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
  }));

  // Who received the root asset
  const txRows = legsIndex.byTx.get(String(transactionId)) || [];
  const inRoot = txRows.find((l) => l.direction === "in" && String(l.asset_key) === String(rootAssetKey));
  const partnerId = inRoot && inRoot.to_user_id != null ? String(inRoot.to_user_id) : null;

  return {
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
    thesis: buildThesis(clean(rootLabel) || rootAssetKey, seatName(nameByUser, seatUserId), children, meta),
  };
}

function branchSummary(node) {
  if (!node) return "";
  if (node.status === "held" || node.status === "still_pick") {
    return `${node.label} (still on ${node.seat})`;
  }
  if (node.status === "dropped") {
    return `${node.label} (dropped${node.exit && node.exit.date ? " " + node.exit.date : ""})`;
  }
  if (node.status === "traded") {
    const n = (node.children || []).length;
    if (n) {
      return `${node.label} → traded${node.exit && node.exit.to ? " to " + node.exit.to : ""} · became ${n} piece${n === 1 ? "" : "s"}`;
    }
    return `${node.label} → traded${node.exit && node.exit.to ? " to " + node.exit.to : ""} · no return`;
  }
  if (node.status === "drafted") {
    return `${node.label}${node.became ? " → " + node.became : " (drafted)"}`;
  }
  return node.label;
}

function slimNode(node, depth = 0) {
  if (!node) return null;
  const kids = depth >= 2 ? [] : (node.children || []).map((c) => slimNode(c, depth + 1)).filter(Boolean);
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
    children: kids,
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
    branches: (web.branches || []).map((b) => slimNode(b, 0)).filter(Boolean),
  };
}

function buildThesis(rootLab, seat, children, meta) {
  const when = meta && meta.date ? meta.date : "that trade";
  if (!(children || []).length) {
    return `${seat} traded away ${rootLab} on ${when} — no return bag on the tape.`;
  }
  const bits = (children || []).slice(0, 4).map(branchSummary);
  return `${seat} traded away ${rootLab} on ${when} · turned into ${bits.join(" · ")}`;
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
    leagueId = "",
    asOf = new Date().toISOString().slice(0, 10),
  } = opts;

  const tradesById = new Map();
  for (const t of trades || []) {
    if (t && t.transaction_id != null) tradesById.set(String(t.transaction_id), t);
  }
  const legsIndex = indexTradeLegs(legs);

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
      webs,
    });
  }

  players.sort((a, b) => (Number(b.n_exits) || 0) - (Number(a.n_exits) || 0)
    || String(a.name).localeCompare(String(b.name)));

  return {
    v: TRADE_WEB_BOOK_V,
    as_of: asOf,
    league_id: String(leagueId || ""),
    n_players: players.length,
    rule: {
      root: "A player leaves a seat in a trade.",
      branch: "Every asset that seat received on that same deal.",
      recurse: "Later trades, drops, and drafted picks for those pieces — a blockchain-style trail of where value went.",
      caps: `Player depth ≤${TRADE_WEB_MAX_PLAYER_DEPTH}; pick hops ≤${TRADE_WEB_MAX_PICK_HOPS}.`,
    },
    players,
  };
}
