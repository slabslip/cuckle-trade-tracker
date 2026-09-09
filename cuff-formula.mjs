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
  console.log("cuff-formula checks ok");
}
