#!/usr/bin/env node
/**
 * Write data/value_curve_1qb.json from DynastyProcess latest without touching
 * the Superflex history book in value_curve.json.
 */
import fs from "node:fs";
import { DATA, parseCsv, writeJson } from "./lib.mjs";

const DP_VALUES = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv";
const DP_IDS = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

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

function parsePickName(name) {
  const labeled = name.match(/^(\d{4})\s+Pick\s+(\d+)\.(\d{2})$/i);
  if (labeled) {
    const year = labeled[1];
    const round = Number(labeled[2]);
    const slot = Number(labeled[3]);
    return { key: `pickval:${year}:${round}:${slot}` };
  }
  const exact = name.match(/^(\d{4})\s+(\d+)\.(\d{2})$/);
  if (exact) {
    return { key: `pickval:${exact[1]}:${Number(exact[2])}:${Number(exact[3])}` };
  }
  const named = name.match(/^(\d{4})\s+(Early|Mid|Late)\s+(\d+)(st|nd|rd|th)$/i);
  if (named) {
    const tier = named[2][0].toUpperCase() + named[2].slice(1).toLowerCase();
    return { key: `pickval:${named[1]}:${Number(named[3])}:${tier}` };
  }
  const generic = name.match(/^(\d{4})\s+(\d+)(st|nd|rd|th)$/i);
  if (generic) return { key: `pickval:${generic[1]}:${Number(generic[2])}:Mid` };
  return null;
}

function curveFromValues(asOf, valuesText, ids) {
  const rows = [];
  for (const r of parseCsv(valuesText)) {
    const value = num(r.value_1qb != null && r.value_1qb !== "" ? r.value_1qb : r.value_2qb);
    if (value == null) continue;
    const pos = String(r.pos || "").toUpperCase();
    const name = String(r.player || "").trim();
    if (pos === "PICK" || /^(\d{4})\s/.test(name)) {
      const parsed = parsePickName(name);
      if (!parsed) continue;
      rows.push({
        provider: "dynastyprocess",
        format_key: "1qb",
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
      format_key: "1qb",
      as_of: asOf,
      asset_key: `player:${sid}`,
      value,
    });
  }
  return rows;
}

async function main() {
  const localValues = `${DATA}/dp/latest/values.csv`;
  const localIds = `${DATA}/dp/latest/db_playerids.csv`;
  const localAsOf = `${DATA}/dp/latest/as_of.txt`;
  const valuesText = fs.existsSync(localValues)
    ? fs.readFileSync(localValues, "utf8")
    : await download(DP_VALUES);
  const idsText = fs.existsSync(localIds)
    ? fs.readFileSync(localIds, "utf8")
    : await download(DP_IDS);
  const asOf = fs.existsSync(localAsOf)
    ? fs.readFileSync(localAsOf, "utf8").trim()
    : new Date().toISOString().slice(0, 10);
  const curve = curveFromValues(asOf, valuesText, idMap(idsText));
  if (!curve.length) throw new Error("1QB curve is empty");
  writeJson("value_curve_1qb.json", curve);
  console.log(JSON.stringify({ as_of: asOf, rows: curve.length, source: fs.existsSync(localValues) ? "dp/latest" : "download" }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
