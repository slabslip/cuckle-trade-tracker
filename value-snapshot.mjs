#!/usr/bin/env node
/** DynastyProcess Superflex values. Latest always; monthly git history when asked. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { DATA, parseCsv, pickTier, writeJson } from "./lib.mjs";

const DP_VALUES = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv";
const DP_IDS = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";
const REPO = `${DATA}/.dp-repo`;
const WANT_HISTORY = process.argv.includes("--history") || !process.argv.includes("--latest-only");

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function idMap(idsText) {
  const byFp = new Map();
  const byName = new Map();
  for (const r of parseCsv(idsText)) {
    const sid = String(r.sleeper_id || "").trim();
    if (!sid || sid === "NA") continue;
    const fp = String(r.fantasypros_id || "").trim();
    if (fp && fp !== "NA") byFp.set(fp, sid);
    const name = String(r.name || r.merge_name || "").trim().toLowerCase();
    if (name) byName.set(name, sid);
  }
  return { byFp, byName };
}

function sleeperId(row, ids) {
  const direct = String(row.sleeper_id || "").trim();
  if (direct && direct !== "NA") return direct;
  const fp = String(row.fp_id || row.fantasypros_id || "").trim();
  if (fp && ids.byFp.has(fp)) return ids.byFp.get(fp);
  const name = String(row.player || "").trim().toLowerCase();
  return ids.byName.get(name) || null;
}

function curveFromValues(asOf, valuesText, ids) {
  const rows = [];
  for (const r of parseCsv(valuesText)) {
    const value = num(r.value_2qb);
    if (value == null) continue;
    const pos = String(r.pos || "").toUpperCase();
    const name = String(r.player || "").trim();
    if (pos === "PICK" || /^(\d{4})\s/.test(name)) {
      const parsed = parsePickName(name);
      if (!parsed) continue;
      rows.push({
        provider: "dynastyprocess",
        format_key: "2qb",
        as_of: asOf,
        asset_key: parsed.key,
        value,
        label: name,
      });
      continue;
    }
    const sid = sleeperId(r, ids);
    if (!sid) continue;
    rows.push({
      provider: "dynastyprocess",
      format_key: "2qb",
      as_of: asOf,
      asset_key: `player:${sid}`,
      value,
    });
  }
  return rows;
}

/** "2026 Pick 1.01" / "2027 Mid 1st" / "2025 1.03" */
function parsePickName(name) {
  const labeled = name.match(/^(\d{4})\s+Pick\s+(\d+)\.(\d{2})$/i);
  if (labeled) {
    const year = labeled[1];
    const round = Number(labeled[2]);
    const slot = Number(labeled[3]);
    return { key: `pickval:${year}:${round}:${slot}`, year, round, slot, tier: pickTier(slot) };
  }
  const exact = name.match(/^(\d{4})\s+(\d+)\.(\d{2})$/);
  if (exact) {
    const year = exact[1];
    const round = Number(exact[2]);
    const slot = Number(exact[3]);
    return { key: `pickval:${year}:${round}:${slot}`, year, round, slot, tier: pickTier(slot) };
  }
  const named = name.match(/^(\d{4})\s+(Early|Mid|Late)\s+(\d+)(st|nd|rd|th)$/i);
  if (named) {
    const year = named[1];
    const tier = named[2][0].toUpperCase() + named[2].slice(1).toLowerCase();
    const round = Number(named[3]);
    return { key: `pickval:${year}:${round}:${tier}`, year, round, tier };
  }
  const generic = name.match(/^(\d{4})\s+(\d+)(st|nd|rd|th)$/i);
  if (generic) {
    const year = generic[1];
    const round = Number(generic[2]);
    return { key: `pickval:${year}:${round}:Mid`, year, round, tier: "Mid" };
  }
  return null;
}

function git(args, cwd = REPO) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function ensureRepo() {
  if (!fs.existsSync(`${REPO}/.git`)) {
    fs.mkdirSync(DATA, { recursive: true });
    const clone = spawnSync(
      "git",
      ["clone", "--filter=blob:none", "https://github.com/dynastyprocess/data.git", REPO],
      { encoding: "utf8" },
    );
    if (clone.status !== 0) {
      throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);
    }
  }
}

function monthlyShas() {
  const files = ["files/values.csv", "files/values-players.csv"];
  const merged = [];
  for (const file of files) {
    let log = git(["log", "--format=%H %ci", "origin/master", "--", file]);
    if (log.status !== 0) log = git(["log", "--format=%H %ci", "--", file]);
    if (log.status !== 0) continue;
    merged.push(log.stdout);
  }
  if (!merged.length) throw new Error("no git log for DP value files");
  return pickMonthly(merged.join("\n"));
}

function pickMonthly(stdout) {
  const seen = new Set();
  const out = [];
  for (const line of stdout.trim().split("\n")) {
    const [sha, date] = line.split(" ");
    if (!sha || !date) continue;
    const month = date.slice(0, 7);
    if (seen.has(month)) continue;
    seen.add(month);
    out.push({ sha, as_of: date, month });
  }
  return out;
}

function showFile(sha, rel) {
  const r = git(["show", `${sha}:${rel}`]);
  if (r.status !== 0) return null;
  return r.stdout;
}

async function main() {
  fs.mkdirSync(`${DATA}/dp/latest`, { recursive: true });
  const valuesText = await download(DP_VALUES);
  const idsText = await download(DP_IDS);
  const asOf = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(`${DATA}/dp/latest/values.csv`, valuesText);
  fs.writeFileSync(`${DATA}/dp/latest/db_playerids.csv`, idsText);
  fs.writeFileSync(`${DATA}/dp/latest/as_of.txt`, asOf);
  const ids = idMap(idsText);

  let curve = curveFromValues(asOf, valuesText, ids);
  const snapshots = [{ as_of: asOf, source: "latest", players: curve.filter((r) => r.asset_key.startsWith("player:")).length, picks: curve.filter((r) => r.asset_key.startsWith("pickval:")).length }];

  if (WANT_HISTORY) {
    ensureRepo();
    const months = monthlyShas();
    for (const m of months) {
      const vText = showFile(m.sha, "files/values.csv") || showFile(m.sha, "files/values-players.csv");
      if (!vText) continue;
      const rows = curveFromValues(m.as_of, vText, ids);
      if (!rows.length) continue;
      curve = curve.concat(rows);
      snapshots.push({
        as_of: m.as_of,
        source: m.sha.slice(0, 7),
        players: rows.filter((r) => r.asset_key.startsWith("player:")).length,
        picks: rows.filter((r) => r.asset_key.startsWith("pickval:")).length,
      });
    }
  }

  writeJson("value_curve.json", curve);
  writeJson("value_snapshots.json", snapshots);
  console.log(
    JSON.stringify(
      {
        latest_as_of: asOf,
        curve_rows: curve.length,
        snapshots: snapshots.length,
        history: WANT_HISTORY,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
