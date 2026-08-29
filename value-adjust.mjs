/** Trade Value Adjustment. Names stay flatten; this is the bag-level add. */
export const VA_RATE = 0.15;

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

/** VA for one side vs the other. 0.15 × extras × stud × damp. CeeDee 1-for-6 ≈ 5752. */
export function sideAdjust(mine, other) {
  const a = priced(mine);
  const b = priced(other);
  if (!a.length || !b.length) return 0;
  const myMax = maxValue(a);
  const theirMax = maxValue(b);
  const spots = Math.max(0, b.length - a.length);
  const lesser = b.filter((l) => l.value < myMax).length;
  const n = Math.max(spots, Math.max(0, lesser - a.length));
  const damp = theirMax > 0 ? myMax / Math.max(myMax, theirMax) : 1;
  return VA_RATE * n * myMax * damp;
}

export function valueAdjustment(gotLegs, sentLegs) {
  return {
    got: sideAdjust(gotLegs, sentLegs),
    sent: sideAdjust(sentLegs, gotLegs),
  };
}

/** Fold VA into today / sent_today / today_delta. Idempotent: always from legs. */
export function applyToSide(side) {
  if (!side) return side;
  const bag = sum(side.legs);
  const sentBag = sum(side.sent);
  const va = valueAdjustment(side.legs, side.sent);
  const gotVa = side.incomplete ? 0 : va.got;
  const sentVa = side.incomplete ? 0 : va.sent;
  side.value_adjust = gotVa;
  side.value_adjust_sent = sentVa;
  if (!side.incomplete) {
    const pricedGot = priced(side.legs).length;
    const pricedSent = priced(side.sent).length;
    if (pricedGot && pricedSent) {
      side.today = bag + gotVa;
      side.sent_today = sentBag + sentVa;
      side.today_delta = side.today - side.sent_today;
    }
  }
  return side;
}
