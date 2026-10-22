#!/usr/bin/env node
/** Smoke: Sleeper username fuzzy scoring matches close spellings to the right seat. */
function normHandle(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}
function scoreHandleMatch(typedRaw, candidates) {
  const typed = normHandle(typedRaw);
  if (!typed || typed.length < 2) return 0;
  let best = 0;
  for (const cand of candidates) {
    const n = normHandle(cand);
    if (!n) continue;
    if (n === typed) {
      best = Math.max(best, 95);
      continue;
    }
    if (n.startsWith(typed) || typed.startsWith(n)) {
      const ratio = Math.min(n.length, typed.length) / Math.max(n.length, typed.length);
      const prefixBoost = (n.startsWith(typed) && typed.length >= 5) ? 14 : 0;
      best = Math.max(best, Math.min(94, Math.round(82 * ratio) + prefixBoost));
      continue;
    }
    if (n.includes(typed) || typed.includes(n)) {
      const ratio = Math.min(n.length, typed.length) / Math.max(n.length, typed.length);
      best = Math.max(best, Math.round(74 * ratio));
      continue;
    }
    const dist = editDistance(typed, n);
    const maxLen = Math.max(typed.length, n.length);
    const similarity = 1 - dist / maxLen;
    const maxDist = typed.length <= 6 ? 1 : typed.length <= 12 ? 2 : 3;
    if (dist <= maxDist && similarity >= 0.72) {
      best = Math.max(best, Math.round(60 + 30 * similarity));
    }
  }
  return best;
}

const seats = [
  { id: "t", display_name: "TrumanCooper", team_name: "PRONOUNS-SHE/DEUR" },
  { id: "j", display_name: "TaylorJohnson16", team_name: "9Wings" },
  { id: "k", display_name: "kotula69", team_name: "Troy_Stallsworth" },
];

function bestSeat(typed) {
  let best = null;
  for (const s of seats) {
    const score = scoreHandleMatch(typed, [s.display_name, s.team_name]);
    const handle = scoreHandleMatch(typed, [s.display_name]);
    const adj = handle > 0 ? handle : Math.min(score, 68);
    if (!best || adj > best.score) best = { id: s.id, score: adj, name: s.display_name };
  }
  return best;
}

const cases = [
  ["TrumanCooper", "t"],
  ["trumancooper", "t"],
  ["truman_cooper", "t"],
  ["Truman Cooper", "t"],
  ["trumancoopr", "t"], // 1 typo
  ["kotula69", "k"],
  ["TaylorJohnson16", "j"],
  ["taylorjohnson", "j"],
];
for (const [typed, expect] of cases) {
  const hit = bestSeat(typed);
  if (!hit || hit.id !== expect || hit.score < 72) {
    throw new Error("expected " + typed + " → " + expect + ", got " + JSON.stringify(hit));
  }
}
// Fantasy team name alone should not confidently steal a different handle.
const troy = bestSeat("Troy_Stallsworth");
if (troy && troy.id === "k" && troy.score >= 80) {
  throw new Error("team_name-only match should stay weak, got " + troy.score);
}

console.log("match-seat fuzzy ok");
