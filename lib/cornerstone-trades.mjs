/**
 * Cornerstone trades — top N highest-value players moved in a trade,
 * priced the day they traded.
 *
 * Pricing: DynastyProcess last quote on/before the trade date, then the same
 * calculator flatten as revalue / Trade Value. No 30-day lookback, no today
 * market blend, no first_snap after the trade (those inflate / invent history).
 *
 * Trade structure still comes from trade_meter (who got what). Values are
 * overwritten from the curve.
 */

export const CORNERSTONE_BOOK_V = 2;
export const CORNERSTONE_TOP_N = 10;

const FLAT_SCALE = 10000;
const FLAT_EXP = 0.3;
const FLAT_TOP_MIX = 0.5;

export function flatten(v, top) {
  if (v == null) return null;
  if (v <= 0) return 0;
  const t = v / top;
  const w = t ** FLAT_TOP_MIX;
  return Math.round(FLAT_SCALE * (w * t + (1 - w) * (t ** FLAT_EXP)));
}

export function indexCurve(curve) {
  const map = new Map();
  for (const r of curve || []) {
    if (!r?.asset_key) continue;
    if (!map.has(r.asset_key)) map.set(r.asset_key, []);
    map.get(r.asset_key).push(r);
  }
  for (const rows of map.values()) rows.sort((a, b) => a.as_of.localeCompare(b.as_of));
  return map;
}

export function indexVmax(curve) {
  const by = new Map();
  for (const r of curve || []) {
    if (r.value == null) continue;
    const prev = by.get(r.as_of) || 0;
    if (r.value > prev) by.set(r.as_of, r.value);
  }
  return { by, dates: [...by.keys()].sort() };
}

export function vmaxAt(idx, asOf) {
  let v = null;
  for (const d of idx.dates || []) {
    if (d <= asOf) v = idx.by.get(d);
  }
  if (v == null && idx.dates?.length) v = idx.by.get(idx.dates[0]);
  return v || FLAT_SCALE;
}

/**
 * Last positive curve quote on/before asOf. No first_snap after the date.
 * @returns {{ value, as_of } | null}
 */
export function rawAtOrBefore(index, key, asOf) {
  const rows = index.get(key);
  if (!rows?.length || !asOf) return null;
  let last = null;
  for (const row of rows) {
    if (row.as_of > asOf) break;
    if (row.value != null && row.value > 0) last = row;
  }
  return last ? { value: last.value, as_of: last.as_of } : null;
}

/** Calculator-scale flatten price on a date (players). */
export function pricePlayerAt(index, vmaxIdx, key, asOf) {
  const raw = rawAtOrBefore(index, key, asOf);
  if (!raw) return null;
  const flat = flatten(raw.value, vmaxAt(vmaxIdx, asOf));
  if (flat == null) return null;
  return { value: flat, raw: raw.value, as_of: raw.as_of };
}

/**
 * Mid-slot pick flatten on a date from pickval:YYYY:R:Mid (then Early/Late).
 * pick asset_key shape: pick:YYYY:round:roster
 */
export function pricePickAt(index, vmaxIdx, assetKey, asOf) {
  if (!assetKey || !asOf) return null;
  const parts = String(assetKey).split(":");
  if (parts[0] !== "pick" || parts.length < 3) return null;
  const year = parts[1];
  const round = parts[2];
  for (const tier of ["Mid", "Early", "Late"]) {
    const key = `pickval:${year}:${round}:${tier}`;
    const raw = rawAtOrBefore(index, key, asOf);
    if (!raw) continue;
    const flat = flatten(raw.value, vmaxAt(vmaxIdx, asOf));
    if (flat == null) continue;
    return { value: flat, raw: raw.value, as_of: raw.as_of, flag: `priced_as_${tier.toLowerCase()}` };
  }
  return null;
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : null;
}

function cleanLabel(label) {
  return String(label || "").replace(/\s+/g, " ").trim();
}

/**
 * Build per-side got packages from meter structure, values from the curve.
 */
export function tradeDayPackages(trade, curveIdx, vmaxIdx) {
  const realized = (trade && trade.lenses && trade.lenses.realized) || {};
  const sideMap = realized.sides || {};
  const date = String(trade?.date || "");
  const sides = [];
  const assets = [];
  for (const uid of Object.keys(sideMap)) {
    const s = sideMap[uid] || {};
    const got = [];
    for (const leg of s.t0_legs || []) {
      if (!leg) continue;
      const kind = String(leg.kind || "asset");
      const assetKey = leg.asset_key != null ? String(leg.asset_key) : null;
      let priced = null;
      if (kind === "player" && assetKey) {
        priced = pricePlayerAt(curveIdx, vmaxIdx, assetKey, date);
      } else if (kind === "pick" && assetKey) {
        priced = pricePickAt(curveIdx, vmaxIdx, assetKey, date);
      }
      if (!priced || priced.value == null) continue;
      const row = {
        label: cleanLabel(leg.label) || String(assetKey || ""),
        kind,
        asset_key: assetKey,
        value: money(priced.value),
        raw: money(priced.raw),
        priced_as: priced.as_of || null,
        flag: priced.flag || null,
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
    const sideTot = got.reduce((a, g) => a + (g.value || 0), 0);
    sides.push({
      user_id: String(uid),
      name: s.name != null ? String(s.name) : String(uid),
      t0: money(sideTot),
      got,
    });
  }
  sides.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { sides, assets };
}

/** @deprecated use tradeDayPackages — kept name for older tests calling structure only */
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

export function counterpartNames(sides, toUserId) {
  return (sides || [])
    .filter((s) => String(s.user_id) !== String(toUserId))
    .map((s) => s.name)
    .filter(Boolean);
}

/**
 * Score every player leg across the tape with day-of flatten; keep highest per player.
 */
export function scoreCornerstoneAssets(trades, curveIdx, vmaxIdx) {
  const bestByKey = new Map();
  for (const trade of trades || []) {
    if (!trade) continue;
    const tid = trade.transaction_id != null ? String(trade.transaction_id) : "";
    if (!tid) continue;
    const date = String(trade.date || "");
    if (!date) continue;
    const season = String(trade.season || date.slice(0, 4));
    const names = Array.isArray(trade.names)
      ? trade.names.map((n) => String(n)).filter(Boolean)
      : [];
    const pack = tradeDayPackages(trade, curveIdx, vmaxIdx);
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
        raw: asset.raw,
        priced_as: asset.priced_as,
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
  curve,
  topN = CORNERSTONE_TOP_N,
}) {
  const curveIdx = indexCurve(curve);
  const vmaxIdx = indexVmax(curve);
  const scored = scoreCornerstoneAssets(trades, curveIdx, vmaxIdx);
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
    raw: r.raw,
    priced_as: r.priced_as,
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
    pricing: "trade_day_flatten",
    top_n: n,
    n_scored: scored.length,
    n_trades: (trades || []).length,
    rule: {
      metric: "Highest player value the day they traded (DP quote on/before date → calculator flatten).",
      scope: "Players only — picks do not headline the board.",
      dedupe: "One row per player; keep the highest-value move.",
      order: "Biggest day-of value first.",
      no_lookback: "Does not use the 30-day post-trade lookback or today's market blend.",
      no_first_snap: "No curve quote on/before the trade date → player is skipped (not invented from a later snap).",
    },
    trades: rows,
  };
}
