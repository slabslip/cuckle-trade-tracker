/** Trade Value Adjustment. Names stay flatten; this is the bag-level add. */
export const VA_RATE = 0.15;
export const VA_CAP = 3;

function priced(legs) {
  return (legs || []).filter((l) => l.value != null && Number.isFinite(l.value));
}

function sum(legs) {
  return priced(legs).reduce((a, l) => a + l.value, 0);
}

function maxValue(legs) {
  const xs = priced(legs);
  return xs.length ? Math.max(...xs.map((l) => l.value)) : 0;
}

/** A 4th counts as half an extra. Became-player legs stay 1. */
export function pieceWeight(leg) {
  if (!leg || leg.became) return 1;
  return /^pick:\d{4}:4:/.test(String(leg.asset_key || "")) ? 0.5 : 1;
}

function weight(legs) {
  return priced(legs).reduce((a, l) => a + pieceWeight(l), 0);
}

/** VA for one side vs the other. 0.15 × min(3, extras) × stud × damp. Late 4th = 0.5 extra. */
export function sideAdjust(mine, other) {
  const a = priced(mine);
  const b = priced(other);
  if (!a.length || !b.length) return 0;
  if (a.length === b.length) return 0;
  const myMax = maxValue(a);
  const theirMax = maxValue(b);
  const mineCount = weight(a);
  const spots = Math.max(0, weight(b) - mineCount);
  const lesser = b.filter((l) => l.value < myMax).reduce((n, l) => n + pieceWeight(l), 0);
  const n = Math.min(VA_CAP, Math.max(spots, Math.max(0, lesser - mineCount)));
  const damp = theirMax > 0 ? myMax / Math.max(myMax, theirMax) : 1;
  return VA_RATE * n * myMax * damp;
}

export function valueAdjustment(gotLegs, sentLegs) {
  return {
    got: sideAdjust(gotLegs, sentLegs),
    sent: sideAdjust(sentLegs, gotLegs),
  };
}

/**
 * Fold VA into today / sent_today / today_delta. Idempotent: always from legs.
 * `opts.noVa` zeroes the adjustment but still refreshes the totals — used for N-way
 * trades, where a seat's sent bag mirrors no single counterparty so VA cannot cancel.
 */
export function applyToSide(side, opts) {
  if (!side) return side;
  const noVa = !!(opts && opts.noVa) || !!side.incomplete;
  const va = noVa ? { got: 0, sent: 0 } : valueAdjustment(side.legs, side.sent);
  side.value_adjust = va.got;
  side.value_adjust_sent = va.sent;
  if (priced(side.legs).length || priced(side.sent).length) {
    side.today = sum(side.legs) + va.got;
    side.sent_today = sum(side.sent) + va.sent;
    side.today_delta = side.today - side.sent_today;
  }
  return side;
}
