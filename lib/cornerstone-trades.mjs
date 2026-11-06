/**
 * Cornerstone trades — top N highest-value players moved in a trade,
 * priced at time of trade (trade_meter realized t0_legs).
 *
 * Ranking is by the player’s t0 value on the day they traded. One row per
 * player (keep the highest-value move). Each row carries both sides’ got
 * packages so the door can show what the deal was.
 */

export const CORNERSTONE_BOOK_V = 1;
export const CORNERSTONE_TOP_N = 10;

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : null;
}

function cleanLabel(label) {
  return String(label || "").replace(/\s+/g, " ").trim();
}

/**
 * Build per-side got packages from realized t0_legs.
 * @returns {{ sides: Array, assets: Array }}
 */
export function tradeT0Packages(trade) {
  const realized = (trade && trade.lenses && trade.lenses.realized) || {};
  const sideMap = realized.sides || {};
  const sides = [];
  const assets = [];
  for (const uid of Object.keys(sideMap)) {
    const s = sideMap[uid] || {};
    const got = [];
    for (const leg of s.t0_legs || []) {
      if (!leg) continue;
      const value = money(leg.value);
      if (value == null) continue;
      const row = {
        label: cleanLabel(leg.label) || String(leg.asset_key || ""),
        kind: String(leg.kind || "asset"),
        asset_key: leg.asset_key != null ? String(leg.asset_key) : null,
        value,
        flag: leg.flag || null,
      };
      got.push(row);
      assets.push({
        ...row,
        to_user_id: String(uid),
        to_name: s.name != null ? String(s.name) : String(uid),
      });
    }
    got.sort((a, b) => (b.value - a.value)
      || String(a.label).localeCompare(String(b.label)));
    sides.push({
      user_id: String(uid),
      name: s.name != null ? String(s.name) : String(uid),
      t0: money(s.t0),
      t0_delta: money(s.t0_delta),
      got,
    });
  }
  sides.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { sides, assets };
}

/** Counterpart names for a receiver (everyone else on the trade). */
export function counterpartNames(sides, toUserId) {
  return (sides || [])
    .filter((s) => String(s.user_id) !== String(toUserId))
    .map((s) => s.name)
    .filter(Boolean);
}

/**
 * Score every player leg across the tape; keep the highest t0 move per player.
 */
export function scoreCornerstoneAssets(trades) {
  const bestByKey = new Map();
  for (const trade of trades || []) {
    if (!trade) continue;
    const tid = trade.transaction_id != null ? String(trade.transaction_id) : "";
    if (!tid) continue;
    const date = String(trade.date || "");
    const season = String(trade.season || (date ? date.slice(0, 4) : ""));
    const names = Array.isArray(trade.names)
      ? trade.names.map((n) => String(n)).filter(Boolean)
      : [];
    const pack = tradeT0Packages(trade);
    for (const asset of pack.assets) {
      if (asset.kind !== "player") continue;
      if (asset.value == null || asset.value <= 0) continue;
      const key = asset.asset_key || `label:${asset.label}`;
      const fromNames = counterpartNames(pack.sides, asset.to_user_id);
      const row = {
        asset_key: asset.asset_key,
        asset: asset.label,
        kind: asset.kind,
        value: asset.value,
        date,
        season,
        week: trade.week != null ? Number(trade.week) : null,
        transaction_id: tid,
        names: names.length ? names : pack.sides.map((s) => s.name),
        to_user_id: asset.to_user_id,
        to_name: asset.to_name,
        from_names: fromNames,
        sides: pack.sides,
      };
      const prev = bestByKey.get(key);
      if (!prev
        || row.value > prev.value
        || (row.value === prev.value && row.date > prev.date)) {
        bestByKey.set(key, row);
      }
    }
  }
  return [...bestByKey.values()];
}

export function buildCornerstoneTradesBook({
  leagueId,
  asOf,
  trades,
  topN = CORNERSTONE_TOP_N,
}) {
  const scored = scoreCornerstoneAssets(trades);
  scored.sort((a, b) => (b.value - a.value)
    || String(b.date).localeCompare(String(a.date))
    || String(a.asset).localeCompare(String(b.asset)));
  const n = Math.max(1, Number(topN) || CORNERSTONE_TOP_N);
  const rows = scored.slice(0, n).map((r, i) => ({
    rank: i + 1,
    asset_key: r.asset_key,
    asset: r.asset,
    kind: r.kind,
    value: r.value,
    date: r.date,
    season: r.season,
    week: r.week,
    transaction_id: r.transaction_id,
    names: r.names,
    to_user_id: r.to_user_id,
    to_name: r.to_name,
    from_names: r.from_names,
    sides: r.sides,
  }));
  return {
    v: CORNERSTONE_BOOK_V,
    as_of: asOf || new Date().toISOString().slice(0, 10),
    league_id: String(leagueId || ""),
    pricing: "trade_meter_t0",
    top_n: n,
    n_scored: scored.length,
    n_trades: (trades || []).length,
    rule: {
      metric: "Highest player value at time of trade (realized t0 flatten).",
      scope: "Players only — picks do not headline the board.",
      dedupe: "One row per player; keep the highest-value move.",
      order: "Biggest t0 value first.",
    },
    trades: rows,
  };
}
