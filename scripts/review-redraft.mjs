#!/usr/bin/env node
import { detectLeagueFormat, leagueRawDir, leagueUiDir, REDRAFT_REVIEW_LEAGUE_ID, setLeagueId } from "../lib.mjs";
import fs from "node:fs";

const id = setLeagueId(process.argv[2] || REDRAFT_REVIEW_LEAGUE_ID);
const raw = leagueRawDir(id);
const ui = leagueUiDir(id);
function load(dir, name, fb) {
  const p = `${dir}/${name}`;
  if (!fs.existsSync(p)) return fb;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const leagues = load(raw, "leagues.json", []);
const format = detectLeagueFormat(leagues);
const members = load(ui, "members.json", []);
const titles = load(ui, "titles.json", { titles: [] });
const league = load(ui, "league.json", {});
const espn = load(raw, "espn_status.json", {});
const bridge = load(raw, "provider_bridge.json", {});
const tape = load(raw, "trade_tape.json", []);

const out = {
  sleeper_league_id: id,
  name: (leagues[0] && leagues[0].name) || null,
  seasons: leagues.map((l) => l.season),
  format,
  members: members.length,
  titles: (titles.titles || []).map((t) => ({ season: t.season, name: t.name, provider: t.provider || "sleeper" })),
  trades_on_tape: tape.length,
  espn,
  mapped: bridge.mapped || 0,
  review: `design-redraft-home.html → index.html?design=league-home&league=${id}`,
};
console.log(JSON.stringify(out, null, 2));
if (format.kind !== "redraft") {
  console.error("FAIL expected redraft");
  process.exit(1);
}
if (format.book !== "1qb") {
  console.error("FAIL expected 1qb book");
  process.exit(1);
}
