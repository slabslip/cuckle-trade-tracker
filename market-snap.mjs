/** Shared helpers for daily market snapshots. Offline files → price-today. No live page scrape. */
import fs from "node:fs";
import { DATA, pickTier, readJson, writeJson } from "./lib.mjs";

export const MARKET_UA =
  "CuckleChunckle-tracker/1.0 (+https://github.com/slabslip/cuckle-trade-tracker; personal daily Superflex snapshot; not a live in-app scrape)";

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function capTier(s) {
  const t = String(s || "").toLowerCase();
  if (t === "early") return "Early";
  if (t === "late") return "Late";
  return "Mid";
}

/** Map a market pick name / synthetic id onto pickval:Y:R:Early|Mid|Late. */
export function marketPickKey(name, sleeperId) {
  const n = String(name || "").trim();
  let m = n.match(/^(\d{4})\s+(\d+)(?:st|nd|rd|th)(?:\s*\((Early|Mid|Late)\))?$/i);
  if (m) return `pickval:${m[1]}:${Number(m[2])}:${m[3] ? capTier(m[3]) : "Mid"}`;
  m = n.match(/^(\d{4})\s+(Early|Mid|Late)\s+(\d+)(?:st|nd|rd|th)$/i);
  if (m) return `pickval:${m[1]}:${Number(m[3])}:${capTier(m[2])}`;
  m = n.match(/^(\d{4})\s+Round\s+(\d+)\s+(Early|Mid|Late)$/i);
  if (m) return `pickval:${m[1]}:${Number(m[2])}:${capTier(m[3])}`;
  m = n.match(/^(\d{4})\s+Pick\s+(\d+)\.(\d+)$/i);
  if (m) return `pickval:${m[1]}:${Number(m[2])}:${pickTier(Number(m[3]), 10)}`;
  const sid = String(sleeperId || "");
  m = sid.match(/^pick_(\d{4})_(\d+)_(early|mid|late)$/i);
  if (m) return `pickval:${m[1]}:${Number(m[2])}:${capTier(m[3])}`;
  m = sid.match(/^pick_(\d{4})_(\d+)_slot_(\d+)$/i);
  if (m) return `pickval:${m[1]}:${Number(m[2])}:${pickTier(Number(m[3]), 10)}`;
  m = sid.match(/^FP_(\d{4})_(early|mid|late)_(\d+)$/i);
  if (m) return `pickval:${m[1]}:${Number(m[3]) + 1}:${capTier(m[2])}`;
  m = sid.match(/^FP_(\d{4})_(\d+)$/i);
  if (m) return `pickval:${m[1]}:${Number(m[2])}:Mid`;
  return null;
}

export function realSleeperId(id) {
  const s = String(id || "").trim();
  return /^\d+$/.test(s) ? s : null;
}

export function boardStats(values) {
  const xs = (values || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return { n: 0, max: null, p50: null, min: null };
  return { n: xs.length, max: xs[xs.length - 1], p50: xs[Math.floor(xs.length / 2)], min: xs[0] };
}

export function writeDatedSnap(dir, snap) {
  const asOf = snap.as_of || todayStamp();
  fs.mkdirSync(`${DATA}/${dir}`, { recursive: true });
  writeJson(`${dir}/${asOf}.json`, snap);
  writeJson(`${dir}/latest.json`, snap);
  return snap;
}

/** Copy yesterday's latest onto today when a live pull fails. */
export function reuseLatestSnap(dir, asOf, reason) {
  const latest = readJson(`${dir}/latest.json`, null);
  if (!latest || !Array.isArray(latest.players) || !latest.players.length) return null;
  const copy = {
    ...latest,
    as_of: asOf,
    fetched_at: new Date().toISOString(),
    reused_from: latest.as_of || latest.reused_from || null,
    reuse_reason: reason,
  };
  writeDatedSnap(dir, copy);
  console.error(`${dir}: reused ${copy.reused_from} (${reason})`);
  return copy;
}

export function listSnapDates(dir) {
  const path = `${DATA}/${dir}`;
  if (!fs.existsSync(path)) return [];
  return fs.readdirSync(path)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

export function loadSnapAsOf(dir, day) {
  const dates = listSnapDates(dir).filter((d) => d <= day);
  if (dates.length) return readJson(`${dir}/${dates[dates.length - 1]}.json`);
  const latest = readJson(`${dir}/latest.json`, null);
  if (latest?.as_of && latest.as_of <= day) return latest;
  return null;
}
