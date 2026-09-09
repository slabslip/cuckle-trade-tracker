/**
 * Handcuff value move — locked from 2024–2025 DP Superflex snaps.
 *
 * Research: scripts/cuff-history.py → data/research/cuff-history.json
 * This is not extras VA. Do not fold into value-adjust.mjs.
 *
 * Cheap cuff (cuff/starter < 5%): Mason / Hunt / Vidal — % of cuff is junk,
 * so the move is a slice of the starter.
 * Priced cuff (Charbonnet / White-class): min(3% of starter, 50% of cuff).
 * Then pos × early/late × how long they are out.
 */

export const CUFF_POS_W = { QB: 0.5, RB: 1, TE: 0.25, WR: 0 };
export const CUFF_SEASON_W = { early: 1, late: 0.6 };
export const CUFF_P_OUT = { QB: 0.18, RB: 0.32, TE: 0.16, WR: 0 };
export const CUFF_CHEAP_RATIO = 0.05;
export const CUFF_SHARE_CHEAP = 0.05;
export const CUFF_SHARE_PRICED = 0.03;
export const CUFF_LIFT_PRICED = 0.5;
export const CUFF_MOVE_CAP = 650;
export const CUFF_INSURANCE_CAP = 350;
export const CUFF_HOLD_HAD_STARTER = 1;
export const CUFF_HOLD_GOT_BOTH = 0.5;

export function cuffSeasonTiming(week) {
  return Number(week) <= 8 ? "early" : "late";
}

export function cuffWeeksWeight(weeksOut) {
  const n = Number(weeksOut) || 0;
  if (n <= 3) return 0.4;
  if (n <= 7) return 0.75;
  return 1;
}

function posW(pos) {
  return CUFF_POS_W[String(pos || "").toUpperCase()] ?? 0;
}

/**
 * Expected dynasty add on the cuff after the starter is already out.
 * `week` is the first missed game (1–18). `weeksOut` is how long they miss.
 */
export function cuffMove(opts) {
  const pos = posW(opts && opts.pos);
  const cuff = Number(opts && opts.cuff);
  const starter = Number(opts && opts.starter);
  if (!pos || !(cuff > 0) || !(starter > 0)) return 0;
  const cheap = cuff / starter < CUFF_CHEAP_RATIO;
  const raw = cheap
    ? starter * CUFF_SHARE_CHEAP
    : Math.min(starter * CUFF_SHARE_PRICED, cuff * CUFF_LIFT_PRICED);
  const season = CUFF_SEASON_W[cuffSeasonTiming(opts.week)] ?? 1;
  const weeks = cuffWeeksWeight(opts.weeksOut);
  return Math.min(CUFF_MOVE_CAP, Math.round(raw * pos * season * weeks));
}

/**
 * Healthy pairing add: injury move at early / season-long * p(out) * hold.
 * holdW = 1 if they already had the starter; 0.5 if both arrive in this deal.
 */
export function cuffIsInjured(status) {
  const s = String(status || "").toUpperCase();
  if (!s) return { injured: false, weeksOut: 8 };
  if (
    s === "IR"
    || s === "OUT"
    || s === "PUP"
    || s === "NFI"
    || s.indexOf("INJURED") >= 0
  ) {
    return { injured: true, weeksOut: 8 };
  }
  if (s === "DOUBTFUL") return { injured: true, weeksOut: 3 };
  return { injured: false, weeksOut: 8 };
}

/**
 * Sum Handcuff adds for one receive pile. Each listed NFL cuff in `recv`
 * (id → today) that the seat still holds the starter for after the swap.
 * hadStarter[id] true → hold_w 1; else they got both in this deal (0.5).
 */
export function cuffPairAdds(opts) {
  const rows = (opts && opts.rows) || [];
  const recv = (opts && opts.recv) || {};
  const have = (opts && opts.haveAfter) || {};
  const had = (opts && opts.hadStarter) || {};
  const catalog = (opts && opts.catalog) || {};
  const week = Number(opts && opts.week) || 1;
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const pos = String(r.pos || "").toUpperCase();
    const cuffId = String(r.cuff_id || "");
    const starterId = String(r.starter_id || "");
    if (!cuffId || !starterId || recv[cuffId] == null) continue;
    if (!have[starterId]) continue;
    const cuffVal = Number(recv[cuffId]);
    const starterVal = Number(
      catalog[starterId] != null ? catalog[starterId] : r.starter_value,
    );
    if (!(cuffVal > 0) || !(starterVal > 0)) continue;
    const holdW = had[starterId] ? CUFF_HOLD_HAD_STARTER : CUFF_HOLD_GOT_BOTH;
    const inj = cuffIsInjured(r.starter_injury);
    total += cuffInsurance({
      pos,
      cuff: cuffVal,
      starter: starterVal,
      holdW,
      injured: inj.injured,
      week,
      weeksOut: inj.weeksOut,
    });
  }
  return total;
}

/**
 * Same add, but pair from the receiving roster: a received player is the cuff
 * when that seat still holds a same NFL team + position teammate who is priced
 * higher. Does not use fantasy slot-1 rows — Javonte / Malik fires even when
 * Javonte is not that seat's KTC RB1.
 * meta[id] = { value, pos, team }. injury[id] = starter status.
 */
export function cuffTeammateAdds(opts) {
  const recv = (opts && opts.recv) || {};
  const have = (opts && opts.haveAfter) || {};
  const had = (opts && opts.hadStarter) || {};
  const meta = (opts && opts.meta) || {};
  const injury = (opts && opts.injury) || {};
  const week = Number(opts && opts.week) || 1;
  let total = 0;
  const ids = Object.keys(recv);
  for (let i = 0; i < ids.length; i++) {
    const cuffId = ids[i];
    const m = meta[cuffId] || {};
    const pos = String(m.pos || "").toUpperCase();
    const team = String(m.team || "").toUpperCase();
    const cuffVal = Number(recv[cuffId]);
    if (!pos || !team || !(cuffVal > 0)) continue;
    let starterId = "";
    let starterVal = 0;
    const held = Object.keys(have);
    for (let j = 0; j < held.length; j++) {
      const id = held[j];
      if (id === cuffId) continue;
      const o = meta[id] || {};
      if (String(o.team || "").toUpperCase() !== team) continue;
      if (String(o.pos || "").toUpperCase() !== pos) continue;
      const v = Number(o.value);
      if (v > starterVal) {
        starterVal = v;
        starterId = id;
      }
    }
    if (!starterId || !(starterVal > 0) || cuffVal >= starterVal) continue;
    const holdW = had[starterId] ? CUFF_HOLD_HAD_STARTER : CUFF_HOLD_GOT_BOTH;
    const inj = cuffIsInjured(injury[starterId]);
    total += cuffInsurance({
      pos,
      cuff: cuffVal,
      starter: starterVal,
      holdW,
      injured: inj.injured,
      week,
      weeksOut: inj.weeksOut,
    });
  }
  return total;
}

export function cuffInsurance(opts) {
  const pos = String((opts && opts.pos) || "").toUpperCase();
  if (opts && opts.injured) {
    return Math.min(
      CUFF_MOVE_CAP,
      cuffMove({
        pos,
        cuff: opts.cuff,
        starter: opts.starter,
        week: opts.week || 1,
        weeksOut: opts.weeksOut || 8,
      }),
    );
  }
  const full = cuffMove({
    pos,
    cuff: opts && opts.cuff,
    starter: opts && opts.starter,
    week: 1,
    weeksOut: 8,
  });
  const hold = opts && opts.holdW != null ? Number(opts.holdW) : CUFF_HOLD_HAD_STARTER;
  return Math.min(
    CUFF_INSURANCE_CAP,
    Math.round(full * (CUFF_P_OUT[pos] || 0) * hold),
  );
}

function check(name, got, want) {
  if (got !== want) {
    throw new Error(`${name}: got ${got}, want ${want}`);
  }
}

if (String(process.argv[1] || "").endsWith("cuff-formula.mjs")) {
  // Mason 2024 W1–8 (actual peak +629). Cheap, early, long.
  check("mason", cuffMove({ pos: "RB", cuff: 49, starter: 6002, week: 1, weeksOut: 8 }), 300);
  // Hunt 2024 W3–12 (actual peak +75). Cheap, early, long.
  check("hunt", cuffMove({ pos: "RB", cuff: 22, starter: 3579, week: 3, weeksOut: 10 }), 179);
  // White 2025 W5–12 (actual peak +216). Cheap ratio 3.3%, early, long.
  check("white", cuffMove({ pos: "RB", cuff: 142, starter: 4340, week: 5, weeksOut: 8 }), 217);
  // Charbonnet 2024 W2–3 (actual +25). Priced, early, short.
  check("charb-short", cuffMove({ pos: "RB", cuff: 458, starter: 2987, week: 2, weeksOut: 2 }), 36);
  // Guerendo 2024 W14–18 (actual +81). Cheap ratio 2.8%; late, mid.
  check("guerendo", cuffMove({ pos: "RB", cuff: 119, starter: 4289, week: 14, weeksOut: 5 }), 97);
  // Flacco 2025 W3–12 (actual +107). QB half-weight.
  check("flacco", cuffMove({ pos: "QB", cuff: 199, starter: 8762, week: 3, weeksOut: 10 }), 219);
  // TE / WR
  check("mayer-scale", cuffMove({ pos: "TE", cuff: 83, starter: 4701, week: 5, weeksOut: 3 }), 24);
  check("wr-off", cuffMove({ pos: "WR", cuff: 250, starter: 4000, week: 2, weeksOut: 8 }), 0);
  // Insurance on a healthy priced RB cuff (~today Bijan / B-Rob class).
  check("insure-brob", cuffInsurance({ pos: "RB", cuff: 2029, starter: 9505, holdW: 1 }), 91);
  check("pair-brob", cuffPairAdds({
    rows: [{ pos: "RB", cuff_id: "8154", starter_id: "9509", starter_value: 9505 }],
    recv: { "8154": 2029 },
    haveAfter: { "9509": true, "8154": true },
    hadStarter: { "9509": true },
    catalog: { "9509": 9505 },
    week: 1,
  }), 91);
  check("pair-both", cuffPairAdds({
    rows: [{ pos: "RB", cuff_id: "8154", starter_id: "9509", starter_value: 9505 }],
    recv: { "8154": 2029, "9509": 9505 },
    haveAfter: { "9509": true, "8154": true },
    hadStarter: {},
    catalog: { "9509": 9505 },
    week: 1,
  }), 46);
  check("pair-wr-off", cuffPairAdds({
    rows: [{ pos: "WR", cuff_id: "1", starter_id: "2", starter_value: 8000 }],
    recv: { "1": 2000 },
    haveAfter: { "2": true },
    hadStarter: { "2": true },
    catalog: { "2": 8000 },
    week: 1,
  }), 0);
  check("team-brob", cuffTeammateAdds({
    recv: { "8154": 2029 },
    haveAfter: { "9509": true, "8154": true },
    hadStarter: { "9509": true },
    meta: {
      "8154": { value: 2029, pos: "RB", team: "ATL" },
      "9509": { value: 9505, pos: "RB", team: "ATL" },
    },
    week: 1,
  }), 91);
  check("team-malik", cuffTeammateAdds({
    recv: { "8800": 1517 },
    haveAfter: { "7588": true, "8800": true },
    hadStarter: { "7588": true },
    meta: {
      "8800": { value: 1517, pos: "RB", team: "DAL" },
      "7588": { value: 4405, pos: "RB", team: "DAL" },
    },
    week: 1,
  }), 42);
  check("team-send-starter", cuffTeammateAdds({
    recv: { "8800": 1517 },
    haveAfter: { "8800": true },
    hadStarter: {},
    meta: {
      "8800": { value: 1517, pos: "RB", team: "DAL" },
      "7588": { value: 4405, pos: "RB", team: "DAL" },
    },
    week: 1,
  }), 0);
  console.log("cuff-formula checks ok");
}
