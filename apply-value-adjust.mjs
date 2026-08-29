#!/usr/bin/env node
/** Reprice today even bags (retired=0 + 40/60 KTC), then apply VA. Windows stay flatten. */
import { readdirSync, readFileSync } from "node:fs";
import { DATA, writeUi } from "./lib.mjs";
import { applyToSide } from "./value-adjust.mjs";
import { makeTodayPrice, repriceTodayLegs } from "./price-today.mjs";

const EVEN = 100;

function repriceEven(side, ctx) {
  if (!side) return side;
  if (side.legs) side.legs = repriceTodayLegs(side.legs, ctx);
  if (side.sent) side.sent = repriceTodayLegs(side.sent, ctx);
  return applyToSide(side);
}

function applyTrade(t, ctx) {
  if (t.even) repriceEven(t.even, ctx);
  if (t.realized && t.realized !== t.even) repriceEven(t.realized, ctx);
  for (const w of Object.values(t.windows || {})) applyToSide(w);
  if (t.even && t.windows?.t0 && !t.windows.t0.incomplete && t.windows.t0.today_delta != null) {
    t.even.t0 = t.windows.t0.today;
    t.even.t0_delta = t.windows.t0.today_delta;
    t.even.t0_value_adjust = t.windows.t0.value_adjust;
  }
  for (const bag of t.other_bags || []) {
    if (bag.even) repriceEven(bag.even, ctx);
    if (bag.realized && bag.realized !== bag.even) repriceEven(bag.realized, ctx);
    for (const w of Object.values(bag.windows || {})) applyToSide(w);
  }
  return t;
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
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

function main() {
  const league0 = JSON.parse(readFileSync(`${DATA}/ui/league.json`, "utf8"));
  const ctx = makeTodayPrice(league0.today || "2026-08-29");
  const dir = `${DATA}/ui/me`;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const seats = [];
  const players = new Map();
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
    for (const t of me.recent_trades || []) applyTrade(t, ctx);

    const complete = (me.trades || []).filter((t) => !t.incomplete && t.even?.today_delta != null);
    const evenDs = complete.map((t) => t.even.today_delta);
    if (me.hero) {
      me.hero.even_total = evenDs.reduce((a, b) => a + b, 0);
      me.hero.even_per_trade = mean(evenDs);
    }

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
      return {
        ...p,
        even_total: e.reduce((a, b) => a + b, 0),
        even_per_trade: mean(e),
        grade: partnerGrade(mean(e)),
      };
    }).sort((a, b) => (b.realized_per_trade ?? -1e9) - (a.realized_per_trade ?? -1e9));

    const graded = (me.partners || []).filter((p) => p.complete >= 2);
    const pool = graded.length ? graded : (me.partners || []).filter((p) => p.complete >= 1);
    const best = pool.slice().sort((a, b) => (b.even_per_trade ?? -1e9) - (a.even_per_trade ?? -1e9))[0];
    const worst = pool.slice().sort((a, b) => (a.even_per_trade ?? 1e9) - (b.even_per_trade ?? 1e9))[0];
    const most = (me.partners || []).slice().sort((a, b) => b.trades - a.trades)[0];
    const slim = (p) => p ? { name: p.name, per: p.even_per_trade, n: p.complete, trades: p.trades, grade: p.grade } : null;
    me.partner_headlines = {
      best: slim(best),
      worst: worst && best && worst.name !== best.name ? slim(worst) : slim(worst),
      most: most ? { name: most.name, trades: most.trades } : null,
    };

    writeUi(`me/${f}`, me);
    seats.push(me);
  }

  const league = JSON.parse(readFileSync(`${DATA}/ui/league.json`, "utf8"));
  const traders = new Map((league.traders || []).map((t) => [t.user_id, t]));
  for (const me of seats) {
    const row = traders.get(me.user_id);
    if (row && me.hero) {
      row.even_total = me.hero.even_total;
      row.even_per_trade = me.hero.even_per_trade;
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
      sides.push({
        transaction_id: t.transaction_id,
        date: t.date,
        user_id: me.user_id,
        name: me.name,
        other: t.others[0],
        today_delta: t.even.today_delta,
        t0_delta: t.even.t0_delta ?? t.windows?.t0?.today_delta ?? null,
        aged: (t.even.t0_delta ?? t.windows?.t0?.today_delta) != null
          ? t.even.today_delta - (t.even.t0_delta ?? t.windows.t0.today_delta)
          : null,
        headline: (t.even.legs || []).find((l) => l.label)?.label || "",
        windows: win,
      });
    }
  }
  const best = (list, key) => list.slice().sort((a, b) => (b[key] ?? -1e15) - (a[key] ?? -1e15)).slice(0, 10);
  const worst = (list, key) => list.slice().sort((a, b) => (a[key] ?? 1e15) - (b[key] ?? 1e15)).slice(0, 10);
  const aged = sides.filter((r) => r.aged != null);
  league.trade_boards = {
    sides,
    today: { best: best(sides, "today_delta"), worst: worst(sides, "today_delta") },
    aged: { best: best(aged, "aged"), worst: worst(aged, "aged") },
  };

  for (const t of league.review_trades || []) applyTrade(t, ctx);

  writeUi("league.json", league);

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
  check("hill today blended 1.6-2.0k", hill != null && hill.value >= 1600 && hill.value <= 2000);
  check("hill not 2892 and not 0", hill != null && hill.value !== 2892 && hill.value !== 0);

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
