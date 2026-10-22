#!/usr/bin/env node
/**
 * Offline sim of clear-space package gates (mirrors tradeHelperPackages ratios/rel).
 * Confirms multi-piece + pick toppers pass where old book-even gates failed.
 */
import fs from "node:fs";
import path from "node:path";

const LEAGUE = "1315431339301806080";
const book = JSON.parse(
  fs.readFileSync(path.join("data/leagues", LEAGUE, "ui/calculator.json"), "utf8"),
);
const players = book.players || [];

function isPick(a) {
  return !a || a.kind === "pick" || String(a.pos || "").toUpperCase() === "PICK";
}
function val(a) {
  return Math.max(0, Number(a && a.value) || 0);
}

const byOwner = new Map();
for (const a of players) {
  const uid = String(a.owner_id || "");
  if (!uid) continue;
  if (!byOwner.has(uid)) byOwner.set(uid, []);
  byOwner.get(uid).push(a);
}

const STUD = 5500;
const START = 2200;
function foundational(a, bag) {
  if (isPick(a)) return false;
  const v = val(a);
  if (v >= STUD * 0.92) return true;
  if (v < STUD * 0.85) return false;
  const pos = String(a.pos || "").toUpperCase();
  let best = -1;
  let second = -1;
  for (const o of bag) {
    if (isPick(o) || String(o.pos || "").toUpperCase() !== pos) continue;
    const ov = val(o);
    if (ov > best) { second = best; best = ov; }
    else if (ov > second) second = ov;
  }
  return Math.abs(best - v) < 1 && (second < 0 || v >= second * 1.12);
}
function canSend(a, bag) {
  return !isPick(a) ? (val(a) >= 500 && !foundational(a, bag)) : val(a) >= 500;
}

function packClear(myBag, target) {
  const tv = val(target);
  if (tv <= 0) return { old: [], neu: [] };
  const pool = myBag.filter((a) => canSend(a, myBag) || (isPick(a) && val(a) >= 500)).slice(0, 16);
  const playersP = pool.filter((a) => !isPick(a));
  const picks = pool.filter(isPick);
  const old = [];
  const neu = [];
  const tryOne = (legs, kind, bucket, lo, hi, relMax, gapMax) => {
    const send = legs.reduce((s, x) => s + val(x), 0);
    if (send < 700) return;
    const ratio = send / tv;
    if (ratio < lo || ratio > hi) return;
    const gap = Math.abs(send - tv);
    const rel = gap / Math.max(send, tv, 1);
    if (rel > relMax && gap > gapMax) return;
    bucket.push({ kind, send, tv, ratio: +ratio.toFixed(3), gap, rel: +rel.toFixed(3),
      names: legs.map((x) => x.name || x.id).join(" + ") });
  };
  // Old even gates
  for (let i = 0; i < playersP.length; i++) {
    for (let j = i + 1; j < playersP.length; j++) {
      tryOne([playersP[i], playersP[j]], "2for1", old, 0.85, 1.32, 0.22, 900);
    }
  }
  for (let i = 0; i < Math.min(playersP.length, 8); i++) {
    for (let j = i + 1; j < Math.min(playersP.length, 8); j++) {
      for (let p = 0; p < Math.min(picks.length, 4); p++) {
        tryOne([playersP[i], playersP[j], picks[p]], "2plusPick", old, 0.88, 1.35, 0.22, 900);
      }
    }
  }
  // New clear gates
  for (let i = 0; i < playersP.length; i++) {
    for (let j = i + 1; j < playersP.length; j++) {
      tryOne([playersP[i], playersP[j]], "2for1", neu, 0.52, 1.55, 0.55, 3200);
    }
  }
  for (let i = 0; i < Math.min(playersP.length, 10); i++) {
    for (let j = i + 1; j < Math.min(playersP.length, 10); j++) {
      for (let p = 0; p < Math.min(picks.length, 6); p++) {
        tryOne([playersP[i], playersP[j], picks[p]], "2plusPick", neu, 0.52, 1.72, 0.55, 3200);
      }
    }
  }
  for (let i = 0; i < Math.min(playersP.length, 7); i++) {
    for (let j = i + 1; j < Math.min(playersP.length, 7); j++) {
      for (let k = j + 1; k < Math.min(playersP.length, 7); k++) {
        for (let p = 0; p < Math.min(picks.length, 4); p++) {
          tryOne([playersP[i], playersP[j], playersP[k], picks[p]], "3plusPick", neu, 0.52, 1.72, 0.55, 3200);
        }
      }
    }
  }
  return { old, neu };
}

// Pick a few high-value targets and a deep seat as buyer
const seats = [...byOwner.entries()].map(([uid, bag]) => {
  const depth = bag.filter((a) => !isPick(a) && val(a) >= 500).length;
  return { uid, bag, depth, name: (bag[0] && bag[0].owner) || uid };
}).sort((a, b) => b.depth - a.depth);

const buyer = seats[0];
const targets = players
  .filter((a) => !isPick(a) && String(a.owner_id) !== buyer.uid && val(a) >= 3500)
  .sort((a, b) => val(b) - val(a))
  .slice(0, 8);

const rows = targets.map((t) => {
  const r = packClear(buyer.bag, t);
  return {
    target: t.name,
    owner: t.owner,
    tv: val(t),
    oldCount: r.old.length,
    newCount: r.neu.length,
    sample: r.neu.slice(0, 3).map((x) => ({
      kind: x.kind, ratio: x.ratio, names: x.names,
    })),
  };
});

const improved = rows.filter((r) => r.newCount > r.oldCount).length;
const anyNew = rows.some((r) => r.newCount > 0);
const out = {
  buyer: buyer.name,
  buyerDepth: buyer.depth,
  targets: rows,
  improved,
  anyNew,
  ok: anyNew && improved >= 2,
};

const artDir = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join("tmp");
fs.mkdirSync(artDir, { recursive: true });
const outPath = path.join(artDir, "sim-clear-space.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (!out.ok) {
  console.error("sim failed: expected clear-space packages on multiple targets");
  process.exit(1);
}
