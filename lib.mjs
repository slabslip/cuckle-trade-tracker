import fs from "node:fs";

export const ROOT = new URL(".", import.meta.url).pathname;
export const DATA = `${ROOT}data`;
export const SLEEPER = "https://api.sleeper.app/v1";

export function readJson(name, fallback = null) {
  const path = `${DATA}/${name}`;
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function writeJson(name, value) {
  const path = `${DATA}/${name}`;
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function writeUi(name, value) {
  const path = `${DATA}/ui/${name}`;
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(path, JSON.stringify(value) + "\n");
}

export async function sleeperGet(path) {
  const res = await fetch(`${SLEEPER}${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] ?? "";
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function roundName(round) {
  const n = Number(round);
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export function pickTier(slot, teams = 10) {
  const s = Number(slot);
  if (!s) return "Mid";
  const third = teams / 3;
  if (s <= Math.ceil(third)) return "Early";
  if (s <= Math.ceil(third * 2)) return "Mid";
  return "Late";
}
