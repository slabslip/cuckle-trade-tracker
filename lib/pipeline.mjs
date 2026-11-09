/**
 * Pipeline — credit managers who believed in a player:
 * found them early, started them in lineups, and held through.
 *
 * Stints from draft + trade legs + waiver/FA moves. Acquire value is
 * calculator flatten on/before the acquire date (trade-day market), not FAAB.
 * Use/belief comes from week-by-week starter tape (player_starts.json).
 * Bench stashes and short flips get dinged — finding without starting is weak.
 */

export const PIPELINE_BOOK_V = 3;
export const PIPELINE_SHORT_DAYS = 21;
/** Weights: belief leans on actual starts, discovery still matters. */
export const PIPELINE_W_DISCOVER = 0.25;
export const PIPELINE_W_USE = 0.50;
export const PIPELINE_W_TENURE = 0.25;
export const PIPELINE_POS = ["QB", "RB", "WR", "TE"];

const FLAT_SCALE = 10000;
const FLAT_EXP = 0.3;
const FLAT_TOP_MIX = 0.5;

export const PIPELINE_LOOKS = [
  ["pipeline", "Pipeline credit"],
  ["first", "First owned"],
  ["longest", "Longest hold"],
  ["paid", "Highest paid"],
];

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

export function pricePlayerAt(index, vmaxIdx, key, asOf) {
  const raw = rawAtOrBefore(index, key, asOf);
  if (!raw) return null;
  const flat = flatten(raw.value, vmaxAt(vmaxIdx, asOf));
  if (flat == null) return null;
  return { value: flat, raw: raw.value, as_of: raw.as_of };
}

function daysBetween(a, b) {
  if (!a || !b) return 0;
  const ms = Date.parse(b) - Date.parse(a);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / 86400000));
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : null;
}

function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function assetKeyOf(pid) {
  const id = String(pid || "").replace(/^player:/, "");
  return id ? `player:${id}` : "";
}

function pidOf(key) {
  return String(key || "").replace(/^player:/, "");
}

/** Index player_starts book without importing (keeps pipeline self-contained for tests). */
function indexStartsInline(book) {
  const out = new Map();
  const byPlayer = book && book.by_player;
  if (byPlayer && typeof byPlayer === "object") {
    for (const [key, row] of Object.entries(byPlayer)) {
      if (!key || !row) continue;
      const byUser = new Map();
      let max = 0;
      for (const [uid, n] of Object.entries(row.starts_by_user || {})) {
        const c = Number(n) || 0;
        if (c <= 0) continue;
        byUser.set(String(uid), c);
        if (c > max) max = c;
      }
      out.set(String(key), { byUser, first: row.first_start || null, max });
    }
    return out;
  }
  for (const r of (book && book.rows) || []) {
    if (!r || r.player_id == null || !r.user_id) continue;
    const key = assetKeyOf(r.player_id);
    if (!key) continue;
    if (!out.has(key)) out.set(key, { byUser: new Map(), first: null, max: 0 });
    const slot = out.get(key);
    const uid = String(r.user_id);
    const next = (slot.byUser.get(uid) || 0) + 1;
    slot.byUser.set(uid, next);
    if (next > slot.max) slot.max = next;
    const cand = {
      user_id: uid,
      season: String(r.season || ""),
      week: Number(r.week) || 0,
    };
    if (!slot.first) slot.first = cand;
    else {
      const a = `${slot.first.season}-${String(slot.first.week).padStart(2, "0")}`;
      const b = `${cand.season}-${String(cand.week).padStart(2, "0")}`;
      if (b < a) slot.first = cand;
    }
  }
  return out;
}

/** roster_id → owner_id for a season (fallback: any season). */
export function seatOwnerIndex(seats) {
  const bySeason = new Map();
  for (const s of seats || []) {
    if (s == null || s.roster_id == null || !s.owner_id) continue;
    const season = String(s.season || "");
    if (!bySeason.has(season)) bySeason.set(season, new Map());
    bySeason.get(season).set(Number(s.roster_id), String(s.owner_id));
  }
  return {
    owner(season, rosterId) {
      const rid = Number(rosterId);
      const m = bySeason.get(String(season || ""));
      if (m && m.has(rid)) return m.get(rid);
      for (const map of bySeason.values()) {
        if (map.has(rid)) return map.get(rid);
      }
      return null;
    },
  };
}

export function memberNameIndex(members) {
  const byId = new Map();
  for (const m of members || []) {
    if (!m || !m.user_id) continue;
    const name = cleanName(m.canonical_name || m.name || m.display_name || m.user_id);
    byId.set(String(m.user_id), name);
  }
  return byId;
}

/**
 * Collect ownership events for every player.
 * @returns {Map<string, Array>} asset_key → events sorted by date
 */
export function collectPlayerEvents({
  draftPicks,
  tradeLegs,
  trades,
  moves,
  seats,
  rostersNow,
  asOf,
}) {
  const seatIdx = seatOwnerIndex(seats);
  const tradeDate = new Map();
  for (const t of trades || []) {
    if (t?.transaction_id && t.date) tradeDate.set(String(t.transaction_id), String(t.date));
  }
  const byPlayer = new Map();
  const push = (key, ev) => {
    if (!key || !ev?.date || !ev.to && !ev.from) return;
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(ev);
  };
  const labels = new Map();

  for (const d of draftPicks || []) {
    const pid = d?.player_id != null ? String(d.player_id) : "";
    if (!pid) continue;
    const key = assetKeyOf(pid);
    const to = d.drafted_by_user_id != null ? String(d.drafted_by_user_id) : null;
    const date = String(d.as_of || d.date || (d.season ? `${d.season}-05-01` : "") || "");
    if (!to || !date) continue;
    if (d.label) labels.set(key, cleanName(d.label));
    push(key, {
      date,
      kind: "draft",
      to,
      from: null,
      transaction_id: d.draft_id != null ? String(d.draft_id) : null,
      ord: 1,
    });
  }

  // Pair trade in/out by transaction + asset
  const tradeBag = new Map();
  for (const leg of tradeLegs || []) {
    if (!leg || leg.kind !== "player" || !leg.asset_key) continue;
    const key = String(leg.asset_key);
    const tid = leg.transaction_id != null ? String(leg.transaction_id) : "";
    if (!tid) continue;
    const bagKey = `${tid}||${key}`;
    if (!tradeBag.has(bagKey)) tradeBag.set(bagKey, { tid, key, inn: null, out: null });
    const bag = tradeBag.get(bagKey);
    if (leg.direction === "in") {
      bag.inn = leg;
      if (leg.label) labels.set(key, cleanName(leg.label));
    } else if (leg.direction === "out") {
      bag.out = leg;
      if (leg.label) labels.set(key, cleanName(leg.label));
    }
  }
  for (const bag of tradeBag.values()) {
    const date = tradeDate.get(bag.tid);
    if (!date) continue;
    const to = bag.inn?.to_user_id != null ? String(bag.inn.to_user_id) : null;
    const from = bag.out?.from_user_id != null
      ? String(bag.out.from_user_id)
      : (bag.inn?.from_user_id != null ? String(bag.inn.from_user_id) : null);
    if (!to && !from) continue;
    push(bag.key, {
      date,
      kind: "trade",
      to,
      from,
      transaction_id: bag.tid,
      ord: 2,
    });
  }

  for (const m of moves || []) {
    if (!m || !m.date) continue;
    const date = String(m.date);
    const season = String(m.season || date.slice(0, 4));
    const type = String(m.type || "free_agent");
    const adds = m.adds || {};
    const drops = m.drops || {};
    for (const [pid, rid] of Object.entries(adds)) {
      const to = seatIdx.owner(season, rid);
      if (!to) continue;
      push(assetKeyOf(pid), {
        date,
        kind: type === "waiver" ? "waiver" : (type === "commissioner" ? "commissioner" : "fa"),
        to: String(to),
        from: null,
        transaction_id: m.transaction_id != null ? String(m.transaction_id) : null,
        ord: 3,
      });
    }
    for (const [pid, rid] of Object.entries(drops)) {
      const from = seatIdx.owner(season, rid);
      if (!from) continue;
      push(assetKeyOf(pid), {
        date,
        kind: "drop",
        to: null,
        from: String(from),
        transaction_id: m.transaction_id != null ? String(m.transaction_id) : null,
        ord: 0, // drops before same-day adds
      });
    }
  }

  // Ensure currently rostered players have an open stint even if history is thin
  for (const r of rostersNow || []) {
    const owner = r?.owner_id != null ? String(r.owner_id) : null;
    if (!owner) continue;
    for (const pid of r.players || []) {
      const key = assetKeyOf(pid);
      if (!key) continue;
      if (!byPlayer.has(key)) byPlayer.set(key, []);
    }
  }

  for (const [key, evs] of byPlayer) {
    evs.sort((a, b) => String(a.date).localeCompare(String(b.date))
      || (a.ord - b.ord)
      || String(a.kind).localeCompare(String(b.kind)));
  }

  return { byPlayer, labels, asOf: asOf || new Date().toISOString().slice(0, 10) };
}

/**
 * Walk events → stints for one player.
 */
export function stintsFromEvents(events, asOf, nameById) {
  const stints = [];
  let cur = null;
  let start = null;
  let acquire = null;
  let acquireTid = null;

  const close = (end, exit, exitTid) => {
    if (!cur || !start) return;
    const days = daysBetween(start, end);
    stints.push({
      user_id: cur,
      name: nameById.get(cur) || cur,
      start,
      end,
      days,
      acquire,
      acquire_tid: acquireTid,
      exit,
      exit_tid: exitTid || null,
      short: days < PIPELINE_SHORT_DAYS,
    });
    cur = null;
    start = null;
    acquire = null;
    acquireTid = null;
  };

  for (const ev of events || []) {
    if (ev.kind === "drop") {
      if (cur && (!ev.from || ev.from === cur)) {
        close(ev.date, "drop", ev.transaction_id);
      }
      continue;
    }
    if (!ev.to) continue;
    if (cur && cur !== ev.to) {
      close(ev.date, ev.kind === "trade" ? "trade" : "move", ev.transaction_id);
    }
    if (!cur) {
      cur = ev.to;
      start = ev.date;
      acquire = ev.kind;
      acquireTid = ev.transaction_id;
    }
  }
  if (cur && start) close(asOf, "held", null);
  return stints;
}

/**
 * Aggregate seat rows + pipeline score for one player's stints.
 * @param {object} [startInfo] { byUser: Map|object, first: {user_id}|null, max: number }
 */
export function scorePipelineSeats(stints, priceAt, startInfo) {
  const bySeat = new Map();
  let first = null;
  for (const s of stints || []) {
    if (!first || s.start < first.start) first = s;
    if (!bySeat.has(s.user_id)) {
      bySeat.set(s.user_id, {
        user_id: s.user_id,
        name: s.name,
        days: 0,
        stint_n: 0,
        short_n: 0,
        acquires: [],
        max_acquire_value: null,
        max_acquire_date: null,
        first_start: s.start,
        still_holds: false,
      });
    }
    const row = bySeat.get(s.user_id);
    row.days += s.days || 0;
    row.stint_n += 1;
    if (s.short) row.short_n += 1;
    if (s.start < row.first_start) row.first_start = s.start;
    if (s.exit === "held") row.still_holds = true;
    const priced = typeof priceAt === "function" ? priceAt(s) : null;
    const val = priced && priced.value != null ? money(priced.value) : null;
    s.acquire_value = val;
    if (val != null) {
      row.acquires.push(val);
      if (row.max_acquire_value == null || val > row.max_acquire_value) {
        row.max_acquire_value = val;
        row.max_acquire_date = s.start;
      }
    }
  }

  const startByUser = (() => {
    if (!startInfo) return new Map();
    if (startInfo.byUser instanceof Map) return startInfo.byUser;
    const m = new Map();
    for (const [uid, n] of Object.entries(startInfo.byUser || startInfo.starts_by_user || {})) {
      m.set(String(uid), Number(n) || 0);
    }
    return m;
  })();
  const maxStarts = Math.max(
    0,
    Number(startInfo && startInfo.max) || 0,
    ...[...startByUser.values()],
  );
  const firstStarterId = startInfo && startInfo.first && startInfo.first.user_id != null
    ? String(startInfo.first.user_id)
    : null;

  const maxDays = Math.max(1, ...[...bySeat.values()].map((r) => r.days || 0), 1);
  const seats = [];
  for (const row of bySeat.values()) {
    const isFirst = first && row.user_id === first.user_id;
    const firstAcquire = first && isFirst ? first.acquire : null;
    let discover = 0.05;
    if (isFirst) {
      discover = (firstAcquire === "draft" || firstAcquire === "waiver" || firstAcquire === "fa"
        || firstAcquire === "commissioner")
        ? 1.0
        : 0.35; // first via trade
    }
    const tenure = (row.days || 0) / maxDays;
    const starts = startByUser.get(String(row.user_id)) || 0;
    const isFirstStarter = !!firstStarterId && firstStarterId === String(row.user_id);
    // Belief: relative start share + first-to-start bonus.
    const startShare = maxStarts > 0 ? starts / maxStarts : 0;
    const use = maxStarts > 0
      ? (0.75 * startShare + 0.25 * (isFirstStarter ? 1 : 0))
      : 0;
    const flipPen = 1 / (1 + (row.short_n || 0));
    // Bench stash: held long, never started, while someone else did → not a believer.
    let benchPen = 1;
    if (starts === 0 && maxStarts > 0 && (row.days || 0) >= PIPELINE_SHORT_DAYS) {
      benchPen = maxStarts >= 3 ? 0.35 : 0.55;
    }
    const heldReal = (row.days || 0) >= PIPELINE_SHORT_DAYS;
    const scoreRaw = (
      PIPELINE_W_DISCOVER * discover
      + PIPELINE_W_USE * use
      + PIPELINE_W_TENURE * tenure
    ) * flipPen * benchPen;
    // Short flippers with no starts score 0 unless they were first owner.
    const eligible = heldReal || isFirst || starts > 0;
    const score = eligible ? Math.round(scoreRaw * 1000) / 1000 : 0;
    const becauseBits = [];
    if (isFirst) {
      becauseBits.push(firstAcquire === "draft" ? "Drafted"
        : (firstAcquire === "waiver" || firstAcquire === "fa") ? "Waiver/FA find"
          : "First owned");
    }
    if (starts > 0) {
      becauseBits.push(`started ${starts}×`);
      if (isFirstStarter) becauseBits.push("first start");
    } else if (maxStarts > 0) {
      becauseBits.push("never started");
    }
    becauseBits.push(`held ${row.days} day${row.days === 1 ? "" : "s"}`);
    if (row.short_n) becauseBits.push(`${row.short_n} short flip${row.short_n === 1 ? "" : "s"}`);
    if (row.still_holds) becauseBits.push("still holds");
    seats.push({
      user_id: row.user_id,
      name: row.name,
      days: row.days,
      stint_n: row.stint_n,
      short_n: row.short_n,
      starts,
      discover,
      use: Math.round(use * 1000) / 1000,
      tenure: Math.round(tenure * 1000) / 1000,
      flip_pen: Math.round(flipPen * 1000) / 1000,
      bench_pen: Math.round(benchPen * 1000) / 1000,
      score,
      max_acquire_value: row.max_acquire_value,
      max_acquire_date: row.max_acquire_date,
      first_start: row.first_start,
      still_holds: row.still_holds,
      is_first: !!isFirst,
      is_first_starter: isFirstStarter,
      because: becauseBits.join(" · "),
    });
  }
  seats.sort((a, b) => (b.score - a.score)
    || ((b.starts || 0) - (a.starts || 0))
    || (b.days - a.days)
    || String(a.name).localeCompare(String(b.name)));
  return { seats, first };
}

/**
 * How the pipeline winner's ownership ended for this player.
 * held = still owns · trade = traded away · drop = dropped (or other exit).
 */
export function pipelineOwnerStatus(stints, seat) {
  if (seat && seat.still_holds) return "held";
  const uid = seat && seat.user_id != null ? String(seat.user_id) : "";
  const mine = (stints || []).filter((s) => uid && String(s.user_id) === uid);
  const last = mine.length ? mine[mine.length - 1] : null;
  const exit = last && last.exit ? String(last.exit) : "";
  if (exit === "held") return "held";
  if (exit === "trade") return "trade";
  if (exit === "drop") return "drop";
  if (seat && seat.still_holds === false && exit) {
    return exit === "trade" ? "trade" : "drop";
  }
  return "";
}

export function pipelineFacts(stints, seats) {
  const firstStint = (stints || []).slice().sort((a, b) => String(a.start).localeCompare(String(b.start)))[0] || null;
  const longest = (seats || []).slice().sort((a, b) => (b.days - a.days)
    || String(a.name).localeCompare(String(b.name)))[0] || null;
  const paid = (seats || []).filter((s) => s.max_acquire_value != null)
    .sort((a, b) => (b.max_acquire_value - a.max_acquire_value)
      || String(a.name).localeCompare(String(b.name)))[0] || null;
  const mostStarted = (seats || []).filter((s) => (s.starts || 0) > 0)
    .sort((a, b) => ((b.starts || 0) - (a.starts || 0))
      || (b.days - a.days)
      || String(a.name).localeCompare(String(b.name)))[0] || null;
  const firstStarter = (seats || []).find((s) => s.is_first_starter) || null;
  const pipeline = (seats || []).filter((s) => s.score > 0)
    .sort((a, b) => (b.score - a.score)
      || ((b.starts || 0) - (a.starts || 0))
      || (b.days - a.days))[0] || null;
  const ownerStatus = pipeline ? pipelineOwnerStatus(stints, pipeline) : "";
  return {
    first_owned: firstStint ? {
      user_id: firstStint.user_id,
      name: firstStint.name,
      date: firstStint.start,
      acquire: firstStint.acquire,
    } : null,
    longest: longest ? {
      user_id: longest.user_id,
      name: longest.name,
      days: longest.days,
    } : null,
    highest_paid: paid ? {
      user_id: paid.user_id,
      name: paid.name,
      value: paid.max_acquire_value,
      date: paid.max_acquire_date,
    } : null,
    most_started: mostStarted ? {
      user_id: mostStarted.user_id,
      name: mostStarted.name,
      starts: mostStarted.starts,
    } : null,
    first_started: firstStarter ? {
      user_id: firstStarter.user_id,
      name: firstStarter.name,
      starts: firstStarter.starts,
    } : null,
    pipeline: pipeline ? {
      user_id: pipeline.user_id,
      name: pipeline.name,
      score: pipeline.score,
      because: pipeline.because,
      starts: pipeline.starts || 0,
      still_owns: ownerStatus === "held",
      owner_status: ownerStatus || null,
    } : null,
  };
}

export function creditForLook(facts, look) {
  const key = String(look || "pipeline");
  if (key === "first") return facts?.first_owned || null;
  if (key === "longest") return facts?.longest || null;
  if (key === "paid") return facts?.highest_paid || null;
  return facts?.pipeline || null;
}

/**
 * Build the searchable Pipeline book.
 */
export function buildPipelineBook({
  leagueId,
  asOf,
  members,
  draftPicks,
  tradeLegs,
  trades,
  moves,
  seats,
  rostersNow,
  curve,
  nameHints,
  playerStarts,
  seasonStats,
  nflPlayers,
  season,
}) {
  const nameById = memberNameIndex(members);
  const curveIdx = indexCurve(curve);
  const vmaxIdx = indexVmax(curve);
  // Lazy import shape: pass pre-indexed Map or raw book.
  let startsIndex = null;
  if (playerStarts instanceof Map) {
    startsIndex = playerStarts;
  } else if (playerStarts) {
    // Inline index to avoid circular imports at call sites that already indexed.
    startsIndex = indexStartsInline(playerStarts);
  }
  const { byPlayer, labels } = collectPlayerEvents({
    draftPicks, tradeLegs, trades, moves, seats, rostersNow, asOf,
  });
  // Seed labels from calculator / hints
  for (const h of nameHints || []) {
    if (!h) continue;
    const key = h.asset_key || (h.sleeper_id != null ? assetKeyOf(h.sleeper_id) : "")
      || (h.id != null && String(h.id).startsWith("player:") ? String(h.id) : "");
    if (key && h.name) labels.set(key, cleanName(h.name));
  }

  // Current roster owners fill gaps when history missed an open stint
  const nowOwner = new Map();
  for (const r of rostersNow || []) {
    const owner = r?.owner_id != null ? String(r.owner_id) : null;
    if (!owner) continue;
    for (const pid of r.players || []) nowOwner.set(assetKeyOf(pid), owner);
  }

  const players = [];
  for (const [key, events] of byPlayer) {
    let stints = stintsFromEvents(events, asOf, nameById);
    // Currently rostered with no open held stint → open a held row from asOf
    // (covers thin history; days may be 0 until the next rebuild after a move).
    const ownerNow = nowOwner.get(key);
    if (ownerNow) {
      const last = stints[stints.length - 1];
      if (!last || last.exit !== "held" || last.user_id !== ownerNow) {
        stints.push({
          user_id: ownerNow,
          name: nameById.get(ownerNow) || ownerNow,
          start: asOf,
          end: asOf,
          days: 0,
          acquire: last ? "held" : "held",
          acquire_tid: null,
          exit: "held",
          exit_tid: null,
          short: true,
        });
      }
    }
    if (!stints.length) continue;
    const priceAt = (s) => pricePlayerAt(curveIdx, vmaxIdx, key, s.start);
    const startSlot = startsIndex ? startsIndex.get(key) : null;
    const { seats: seatRows } = scorePipelineSeats(stints, priceAt, startSlot || undefined);
    const facts = pipelineFacts(stints, seatRows);
    const name = cleanName(labels.get(key) || "");
    // Skip orphan move-only ids with no resolved name — search needs a real label.
    if (!name || /^\d+$/.test(name)) continue;
    players.push({
      asset_key: key,
      name,
      sleeper_id: pidOf(key),
      stints: stints.map((s) => ({
        user_id: s.user_id,
        name: s.name,
        start: s.start,
        end: s.end,
        days: s.days,
        acquire: s.acquire,
        acquire_value: s.acquire_value != null ? s.acquire_value : null,
        exit: s.exit,
        short: !!s.short,
      })),
      seats: seatRows,
      facts,
    });
  }

  players.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
  const seasonMeta = attachPosSeasonRanks(players, {
    stats: seasonStats,
    nfl: nflPlayers,
    season,
  });

  return {
    v: PIPELINE_BOOK_V,
    as_of: asOf || new Date().toISOString().slice(0, 10),
    league_id: String(leagueId || ""),
    pricing: "trade_day_flatten",
    short_days: PIPELINE_SHORT_DAYS,
    n_players: players.length,
    season: seasonMeta.season,
    positions: seasonMeta.positions,
    rule: {
      metric: "Pipeline credit = 0.25 discover + 0.50 starts/use + 0.25 tenure − short flips − bench stash.",
      discover: "First draft/waiver/FA = 1.0; first via trade = 0.35; else 0.05.",
      use: "Belief: 0.75 × (your starts / most starts on this player) + 0.25 if you started them first.",
      tenure: "Seat days / longest seat days on that player.",
      flip: "Penalty 1/(1+short stints); short = under 21 days. Pure short-only seats with no starts score 0 unless first owner.",
      bench: "Held 21d+ with 0 starts while someone else started them → ×0.35 (or ×0.55 if <3 starts exist).",
      paid: "Highest acquire flatten on/before stint start — fact only, does not crown Pipeline.",
      start: "Week-by-week Sleeper starters tape (player_starts.json).",
      pos_rank: "Within-position rank by current-season Sleeper PPR points (QB/RB/WR/TE).",
      owner_status: "Pipeline winner still owns (held), traded away (trade), or dropped (drop).",
    },
    looks: PIPELINE_LOOKS.map(([id, lab]) => ({ id, lab })),
    players,
  };
}

/**
 * Attach position + current-season fantasy pts / positional rank.
 * Rank = 1..N within QB/RB/WR/TE by season PPR points (desc).
 */
export function attachPosSeasonRanks(players, { stats, nfl, season } = {}) {
  const skill = new Set(PIPELINE_POS);
  const list = Array.isArray(players) ? players : [];
  for (const p of list) {
    if (!p) continue;
    const id = String(p.sleeper_id || pidOf(p.asset_key) || "");
    const meta = (nfl && id && nfl[id]) || null;
    let pos = String((meta && meta.position) || p.pos || "").toUpperCase();
    if (!skill.has(pos)) pos = "";
    p.pos = pos || null;
    const st = (stats && id && stats[id]) || null;
    const pts = st ? Number(st.pts_ppr) : NaN;
    const gp = st ? Number(st.gp) : NaN;
    if (Number.isFinite(pts) && pts > 0) {
      p.season_pts = Math.round(pts * 10) / 10;
      p.season_gp = Number.isFinite(gp) && gp > 0 ? gp : null;
      p.season_ffpg = p.season_gp
        ? Math.round((p.season_pts / p.season_gp) * 10) / 10
        : null;
    } else {
      p.season_pts = null;
      p.season_gp = null;
      p.season_ffpg = null;
    }
    p.pos_rank = null;
  }
  for (const pos of PIPELINE_POS) {
    const here = list
      .filter((p) => p && p.pos === pos && p.season_pts != null)
      .sort((a, b) => (b.season_pts - a.season_pts)
        || String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
    here.forEach((p, i) => { p.pos_rank = i + 1; });
  }
  return { season: season != null ? Number(season) || season : null, positions: PIPELINE_POS.slice() };
}

/** Client/search helper: filter players by name needle (optional pos). */
export function pipelineSearchHits(book, q, limit = 12, pos = "") {
  const needle = String(q || "").trim().toLowerCase();
  if (!needle || !book?.players) return [];
  const wantPos = String(pos || "").toUpperCase();
  const out = [];
  for (const p of book.players) {
    if (wantPos && String(p.pos || "").toUpperCase() !== wantPos) continue;
    const name = String(p.name || "").toLowerCase();
    if (!name.includes(needle)) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Positional board: season fantasy rank order (unranked at end). */
export function pipelinePosList(book, pos, limit = 80) {
  const want = String(pos || "").toUpperCase();
  if (!PIPELINE_POS.includes(want) || !book?.players) return [];
  const ranked = [];
  const rest = [];
  for (const p of book.players) {
    if (!p || String(p.pos || "").toUpperCase() !== want) continue;
    if (p.pos_rank != null) ranked.push(p);
    else rest.push(p);
  }
  ranked.sort((a, b) => (a.pos_rank - b.pos_rank)
    || String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
  rest.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
  const out = ranked.concat(rest);
  return out.slice(0, Math.max(1, Number(limit) || 80));
}
