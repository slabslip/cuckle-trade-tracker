#!/usr/bin/env node
/** Reprice today even bags (retired=0 + 40/60 KTC), then apply VA. Windows stay flatten. */
import { readdirSync, readFileSync } from "node:fs";
import { leagueUiDir, seasonLived, setLeagueId, writeUi } from "./lib.mjs";
import { applyToSide } from "./value-adjust.mjs";
import { makeTodayPrice, repriceTodayLegs } from "./price-today.mjs";

setLeagueId(process.argv[2] || process.env.LEAGUE_ID);
const UI = leagueUiDir();

const EVEN = 100;

function repriceEven(side, ctx, opts) {
  if (!side) return side;
  if (side.legs) side.legs = repriceTodayLegs(side.legs, ctx);
  if (side.sent) side.sent = repriceTodayLegs(side.sent, ctx);
  return applyToSide(side, opts);
}

function applyTrade(t, ctx) {
  // VA is a pairwise stud-for-quantity add. On a 3-team trade the bags do not mirror,
  // so per-seat adjustments never cancel — hold VA at 0 there to keep the trade zero-sum.
  const opts = { noVa: (t.others || []).length > 1 };
  if (t.even) repriceEven(t.even, ctx, opts);
  if (t.realized && t.realized !== t.even) repriceEven(t.realized, ctx, opts);
  for (const w of Object.values(t.windows || {})) applyToSide(w, opts);
  if (t.even && t.windows?.t0 && !t.windows.t0.incomplete && t.windows.t0.today_delta != null) {
    t.even.t0 = t.windows.t0.today;
    t.even.t0_delta = t.windows.t0.today_delta;
    t.even.t0_value_adjust = t.windows.t0.value_adjust;
  }
  for (const bag of t.other_bags || []) {
    if (bag.even) repriceEven(bag.even, ctx, opts);
    if (bag.realized && bag.realized !== bag.even) repriceEven(bag.realized, ctx, opts);
    for (const w of Object.values(bag.windows || {})) applyToSide(w, opts);
  }
  return t;
}

/**
 * Drop what the browser never reads. value_flat stays: in a checkout without the DP
 * curve it is the only record of the flatten price, and repricing is idempotent from it.
 */
function slimForShip(t) {
  if ((t.others || []).length <= 1) delete t.other_bags;
  delete t.realized;      // sideOf falls back past windows[lens] and even, and even always exists
  delete t.year_ends;     // tradeBags prefers even_year_ends, which is present on every trade
  for (const side of [t.even, ...Object.values(t.windows || {}), ...(t.other_bags || []).map((b) => b.even)]) {
    for (const l of [...(side?.legs || []), ...(side?.sent || [])]) delete l.drafted_by;
  }
  return t;
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** "2023 2nd (ARae) · became Zach Charbonnet" reads as "Zach Charbonnet" on a board row. */
function headlineOf(side) {
  const first = (side?.legs || []).find((l) => l.label);
  if (!first?.label) return "";
  const became = first.label.includes(" · became ") ? first.label.split(" · became ")[1] : first.label;
  return became.replace(/\s*\([^)]+\)$/, "");
}

function partnerGrade(per) {
  if (per == null) return "even";
  if (per >= EVEN) return "you_extract";
  if (per <= -EVEN) return "they_extract";
  return "even";
}

function check(name, cond) {
  if (!cond) throw new Error(`self-check failed: ${name}`);
}

const LENSES = ["t0", "y1", "y2", "y3", "all"];

function addYears(ymd, n) {
  const p = String(ymd || "").split("-").map(Number);
  if (p.length < 3) return ymd;
  const y = p[0] + n;
  const dim = new Date(y, p[1], 0).getDate();
  return `${y}-${String(p[1]).padStart(2, "0")}-${String(Math.min(p[2], dim)).padStart(2, "0")}`;
}

/** t0/all unfiltered; y1/y2/y3 need their season span finished. */
function chipLived(date, lens, today) {
  if (lens === "t0" || lens === "all") return true;
  if (lens === "y1") return seasonLived(date, 1, today);
  if (lens === "y2") return seasonLived(date, 2, today);
  if (lens === "y3") return seasonLived(date, 3, today);
  return true;
}

/** Best window up to the target lens — younger trades fall back to t0/y1/… instead of dropping. */
function effectiveLens(date, targetLens, today) {
  if (targetLens === "t0") return "t0";
  if (targetLens === "all") return "all";
  const order = ["t0", "y1", "y2", "y3"];
  const idx = order.indexOf(targetLens);
  if (idx < 0) return targetLens;
  for (let i = idx; i >= 0; i--) {
    const l = order[i];
    if (l === "t0" || chipLived(date, l, today)) return l;
  }
  return "t0";
}

/** Same rule as the browser's displayDelta: round each bag, then subtract. */
function tradeDelta(t, lens) {
  if (!t || t.incomplete) return null;
  const s = (t.windows || {})[lens] || t.even;
  if (!s || s.incomplete || s.today == null || s.sent_today == null) return null;
  return Math.round(s.today) - Math.round(s.sent_today);
}

function tradeDeltaAtTarget(t, targetLens, today) {
  if (!t || t.incomplete) return null;
  return tradeDelta(t, effectiveLens(t.date, targetLens, today));
}

function partnerDeltas(seat, name, lens, today) {
  return (seat.trades || [])
    .filter((t) => (t.others || []).length === 1 && t.others[0] === name
      && !t.incomplete && chipLived(t.date, lens, today))
    .map((t) => tradeDelta(t, lens))
    .filter((d) => d != null);
}

/**
 * Everything the six home tiles and the league chart need, per seat and per clock.
 * The browser used to fetch all ten seat files (~7.4 MB) to draw one bar chart, and
 * computed the same numbers a second way for its own tiles.
 */
function buildMarks(seats, today) {
  const out = {};
  for (const seat of seats) {
    const st = seat.style || {};
    const aged = [];
    for (const t of seat.trades || []) {
      if ((t.others || []).length !== 1) continue;
      const now = tradeDelta(t, "all");
      const t0 = tradeDelta(t, "t0");
      if (now == null || t0 == null) continue;
      aged.push(now - t0);
    }
    const rookie = ((seat.drafts && seat.drafts.rookie) || []).filter((p) => p.surplus != null);
    const byLens = {};
    for (const lens of LENSES) {
      const ds = (seat.trades || [])
        .map((t) => tradeDeltaAtTarget(t, lens, today))
        .filter((d) => d != null);
      let extract = 0, farmed = 0, evenN = 0;
      for (const p of seat.partners || []) {
        if (!(p.complete >= 1)) continue;
        const pd = partnerDeltas(seat, p.name, lens, today);
        const per = pd.length ? pd.reduce((a, b) => a + b, 0) / pd.length : null;
        const g = partnerGrade(per);
        if (g === "you_extract") extract += 1;
        else if (g === "they_extract") farmed += 1;
        else evenN += 1;
      }
      byLens[lens] = {
        n: ds.length,
        total: ds.length ? ds.reduce((a, b) => a + b, 0) : null,
        per: mean(ds),
        extract, farmed, even: evenN,
      };
    }
    out[seat.user_id] = {
      name: seat.name,
      two_way: (seat.hero && seat.hero.two_way) || 0,
      sold_picks: st.sold_picks_for_players || 0,
      sold_players: st.sold_players_for_picks || 0,
      aging: { mean: mean(aged), n: aged.length },
      draft: { mean: mean(rookie.map((p) => p.surplus)), n: rookie.length },
      lens: byLens,
    };
  }
  return { as_of: today, seats: out };
}

function main() {
  const league0 = JSON.parse(readFileSync(`${UI}/league.json`, "utf8"));
  const ctx = makeTodayPrice(league0.today || "2026-08-29");
  const dir = `${UI}/me`;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const seats = [];
  const players = new Map();
  const evenBy = new Map();
  let tradesN = 0;
  let vaN = 0;
  let unpricedN = 0;

  for (const f of files) {
    const me = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    for (const t of me.trades || []) {
      applyTrade(t, ctx);
      tradesN += 1;
      const s = t.even;
      if (s?.value_adjust) vaN += 1;
      for (const l of [...(s?.legs || []), ...(s?.sent || [])]) {
        if (l.value == null) { unpricedN += 1; continue; }
        if (l.kind !== "player") continue;
        const key = l.asset_key || l.label;
        const prev = players.get(key);
        if (!prev || (l.value || 0) > prev.value) {
          players.set(key, { name: l.became || l.label, value: l.value, key });
        }
      }
    }
    const complete = (me.trades || []).filter((t) => !t.incomplete && t.even?.today_delta != null);
    const evenDs = complete.map((t) => t.even.today_delta);
    evenBy.set(me.user_id, { total: evenDs.reduce((a, b) => a + b, 0), per: mean(evenDs) });

    const by = {};
    for (const t of me.trades || []) {
      if ((t.others || []).length !== 1) continue;
      const name = t.others[0];
      if (!by[name]) by[name] = { name, n: 0, even: [] };
      by[name].n += 1;
      if (!t.incomplete && t.even?.today_delta != null) by[name].even.push(t.even.today_delta);
    }
    me.partners = (me.partners || []).map((p) => {
      const row = by[p.name];
      const e = row?.even || [];
      // realized_* described a book that is no longer in this file and nothing reads it.
      // grade is gone too: it froze one clock, so the home tile and the Partners tab
      // disagreed on 18 of 82 pairs. marks.json now grades every clock.
      const { realized_total, realized_per_trade, grade, ...keep } = p;
      return {
        ...keep,
        even_total: e.reduce((a, b) => a + b, 0),
        even_per_trade: mean(e),
      };
    }).sort((a, b) => (b.even_per_trade ?? -1e9) - (a.even_per_trade ?? -1e9));

    delete me.partner_headlines;
    delete me.recent_trades;
    me.hero = me.hero ? { two_way: me.hero.two_way } : me.hero;
    for (const t of me.trades || []) slimForShip(t);

    writeUi(`me/${f}`, me);
    seats.push(me);
  }

  const league = JSON.parse(readFileSync(`${UI}/league.json`, "utf8"));
  const traders = new Map((league.traders || []).map((t) => [t.user_id, t]));
  for (const me of seats) {
    const row = traders.get(me.user_id);
    const e = evenBy.get(me.user_id);
    if (row && e) {
      row.even_total = e.total;
      row.even_per_trade = e.per;
      delete row.realized_total;
      delete row.realized_per_trade;
    }
  }
  league.traders = [...traders.values()].sort((a, b) =>
    (b.even_per_trade ?? -Infinity) - (a.even_per_trade ?? -Infinity));

  const seen = new Set();
  const sides = [];
  for (const me of seats) {
    for (const t of me.trades || []) {
      const id = `${t.transaction_id}:${me.user_id}`;
      if (seen.has(id) || (t.others || []).length !== 1 || t.incomplete) continue;
      if (t.even?.today_delta == null) continue;
      seen.add(id);
      const win = {};
      for (const [k, w] of Object.entries(t.windows || {})) {
        win[k] = {
          delta: w?.today_delta ?? null,
          got: w?.today ?? null,
          sent: w?.sent_today ?? null,
          snaps: w?.snaps ?? 0,
          incomplete: !!w?.incomplete,
          value_adjust: w?.value_adjust ?? 0,
          value_adjust_sent: w?.value_adjust_sent ?? 0,
        };
      }
      // aged measures elapsed time, so both terms come from the flatten windows.
      // even.today_delta is the 40/60 KTC blend; subtracting a flatten t0 from it
      // would measure the pricing model as much as the passage of time.
      const allW = t.windows?.all;
      const t0W = t.windows?.t0;
      const aged = allW && t0W && !allW.incomplete && !t0W.incomplete
        && allW.today_delta != null && t0W.today_delta != null
        ? allW.today_delta - t0W.today_delta
        : null;
      sides.push({
        transaction_id: t.transaction_id,
        date: t.date,
        user_id: me.user_id,
        name: me.name,
        other: t.others[0],
        today_delta: t.even.today_delta,
        // The board rounds each bag before subtracting, like every other margin in the UI.
        today_got: t.even.today ?? null,
        today_sent: t.even.sent_today ?? null,
        t0_delta: t.even.t0_delta ?? t0W?.today_delta ?? null,
        aged,
        headline: headlineOf(t.even),
        windows: win,
      });
    }
  }
  // The page reads six fields off a side plus got/sent/incomplete per window. Everything
  // else here exists for the self-checks below, so it stays local instead of shipping.
  const shipSide = (r) => ({
    transaction_id: r.transaction_id,
    date: r.date,
    user_id: r.user_id,
    name: r.name,
    other: r.other,
    headline: r.headline,
    windows: Object.fromEntries(Object.entries(r.windows).map(([k, w]) =>
      [k, { got: w.got, sent: w.sent, incomplete: w.incomplete }])),
  });

  const best = (list, key) => list.slice().sort((a, b) => (b[key] ?? -1e15) - (a[key] ?? -1e15)).slice(0, 10);
  const worst = (list, key) => list.slice().sort((a, b) => (a[key] ?? 1e15) - (b[key] ?? 1e15)).slice(0, 10);
  const agedRows = sides.filter((r) => r.aged != null);
  const boards = {
    today: { best: best(sides, "today_delta"), worst: worst(sides, "today_delta") },
    aged: { best: best(agedRows, "aged"), worst: worst(agedRows, "aged") },
  };
  league.trade_boards = { sides: sides.map(shipSide) };
  delete league.review_trades;
  delete league.drafters_startup;

  writeUi("league.json", league);
  const marks = buildMarks(seats, league.today);
  writeUi("marks.json", marks);

  const ceedee = seats.flatMap((m) => m.trades || []).find((t) =>
    t.transaction_id === "1269369347395026944"
    || (t.date === "2025-09-04" && (t.even?.legs || []).some((l) => (l.label || "").includes("CeeDee"))));
  const ceedeeVa = ceedee?.even?.value_adjust;
  check("ceedee trade found", !!ceedee);
  check("ceedee va ~3322 (cap 3 after today blend; not 5500-6000)", ceedeeVa != null && ceedeeVa >= 3200 && ceedeeVa <= 3450);

  const chief = seats.flatMap((m) => m.trades || []).find((t) => t.transaction_id === "460470201385742336");
  const zeke = [...(chief?.even?.legs || []), ...(chief?.even?.sent || [])]
    .find((l) => (l.became || l.label || "").includes("Ezekiel Elliott"));
  const hill = [...(chief?.even?.legs || []), ...(chief?.even?.sent || [])]
    .find((l) => (l.became || l.label || "").includes("Tyreek Hill"));
  check("chief-arae found", !!chief);
  check("zeke today retired 0", zeke != null && zeke.value === 0);
  // DP/KTC blend moves with the book; keep a band that rejects raw DP (~2.8k) and retiree 0.
  check("hill today blended 1.2-2.0k", hill != null && hill.value >= 1200 && hill.value <= 2000);
  check("hill not raw DP and not 0", hill != null && hill.value !== 2892 && hill.value !== 0);

  const baker = seats.flatMap((m) => m.trades || []).flatMap((t) =>
    [...(t.even?.legs || []), ...(t.even?.sent || [])]
      .filter((l) => (l.label || "") === "Baker Mayfield"));
  check("baker still mid-4k", baker.length && baker.every((l) => l.value >= 4200 && l.value <= 5200));

  let zeroBreaks = 0;
  const pair = new Map();
  for (const r of sides) {
    const k = r.transaction_id;
    if (!pair.has(k)) pair.set(k, []);
    pair.get(k).push(r.today_delta);
  }
  for (const ds of pair.values()) {
    if (ds.length === 2 && Math.abs(ds[0] + ds[1]) >= 1) zeroBreaks += 1;
  }
  check("zero-sum 2-team", zeroBreaks === 0);

  const oneForOne = seats.flatMap((m) => m.trades || []).filter((t) =>
    (t.even?.legs || []).filter((l) => l.value != null).length === 1
    && (t.even?.sent || []).filter((l) => l.value != null).length === 1);
  check("1-for-1 no va", oneForOne.every((t) => Math.round(t.even.value_adjust || 0) === 0));

  const winZeke = (chief?.windows?.all?.legs || []).find((l) => (l.became || "").includes("Ezekiel"));
  check("windows stay flatten (zeke all != 0)", !winZeke || (winZeke.value != null && winZeke.value > 0));

  // This file is the only builder of trade_boards, so the board checks live here now.
  const sideCounts = {};
  for (const r of sides) sideCounts[r.transaction_id] = (sideCounts[r.transaction_id] || 0) + 1;
  check("sides are 2-team pairs", Object.values(sideCounts).every((n) => n === 2));
  check("sides complete", sides.every((r) => r.today_delta != null && r.date && r.headline != null));
  check("sides carry got and sent", sides.every((r) => r.today_got != null && r.today_sent != null
    && Math.abs(r.today_got - r.today_sent - r.today_delta) < 0.01));
  check("sides have all five windows", sides.every((r) =>
    r.windows && ["t0", "y1", "y2", "y3", "all"].every((k) => r.windows[k])));
  check("today best 10", boards.today.best.length === 10);
  check("today best sorted", boards.today.best[0].today_delta >= boards.today.best[9].today_delta);
  check("today worst sorted", boards.today.worst[0].today_delta <= boards.today.worst[9].today_delta);
  check("aged rows have aged", boards.aged.best.every((r) => r.aged != null) && boards.aged.worst.every((r) => r.aged != null));
  check("aged best sorted", boards.aged.best[0].aged >= boards.aged.best[9].aged);
  check("aged is one book", sides.every((r) =>
    r.aged == null
    || Math.abs(r.aged - ((r.windows.all.delta ?? 0) - (r.windows.t0.delta ?? 0))) < 1e-6));
  const sameDay = sides.filter((r) => r.date === league.today);
  check("no aged on a same-day trade", sameDay.every((r) => r.aged == null || Math.abs(r.aged) < 1e-6));
  check("realized_* gone", !sides.some((r) => "realized_per_trade" in r)
    && league.traders.every((t) => !("realized_per_trade" in t) && !("realized_total" in t)));
  // Its last reader went with renderLeague(). Kept only so the payload cut stays deliberate:
  // revalue.mjs still emits it, so dropping it belongs to a payload pass, not to a delete here.
  check("drafters_rookie still present", (league.drafters_rookie || []).length > 0);
  check("marks cover every seat and clock", Object.keys(marks.seats).length === seats.length
    && Object.values(marks.seats).every((m) => LENSES.every((k) => m.lens[k])));
  check("marks partner counts add up", Object.values(marks.seats).every((m) => {
    const seat = seats.find((s) => s.name === m.name);
    const graded = (seat.partners || []).filter((p) => p.complete >= 1).length;
    return LENSES.every((k) => m.lens[k].extract + m.lens[k].farmed + m.lens[k].even === graded);
  }));
  // "all" is the flatten windows.all delta, not the today blend in `even` — see AUDIT §8c.
  check("marks 'all' total matches the windows.all deltas", Object.values(marks.seats).every((m) => {
    const seat = seats.find((s) => s.name === m.name);
    const ds = (seat.trades || []).map((t) => tradeDeltaAtTarget(t, "all", league.today)).filter((d) => d != null);
    const want = ds.length ? ds.reduce((a, b) => a + b, 0) : null;
    return (want == null && m.lens.all.total == null) || Math.abs(want - m.lens.all.total) < 1e-6;
  }));
  check("marks 'y2' uses best available window per trade", Object.values(marks.seats).every((m) => {
    const seat = seats.find((s) => s.name === m.name);
    const ds = (seat.trades || []).map((t) => tradeDeltaAtTarget(t, "y2", league.today)).filter((d) => d != null);
    const want = ds.length ? ds.reduce((a, b) => a + b, 0) : null;
    return (want == null && m.lens.y2.total == null) || Math.abs(want - m.lens.y2.total) < 1e-6;
  }));
  check("dead league keys gone", !("review_trades" in league) && !("drafters_startup" in league)
    && !("today" in league.trade_boards) && !("aged" in league.trade_boards));

  console.log(JSON.stringify({
    seats: seats.length,
    trades: tradesN,
    with_va: vaN,
    unique_players: players.size,
    unpriced_legs: unpricedN,
    ktc_as_of: ctx.ktc.as_of,
    ceedee_va: Math.round(ceedeeVa),
    ceedee_delta: Math.round(ceedee.even.today_delta),
    zeke_today: zeke?.value,
    hill_today: hill?.value,
    baker_today: baker[0]?.value,
    book: "even-today 40/60 ktc + va cap 3",
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
