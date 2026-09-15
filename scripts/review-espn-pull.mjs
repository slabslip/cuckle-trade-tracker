#!/usr/bin/env node
/**
 * Review whether GM ESPN 2020–2024 is on the book, and whether the public
 * API will give it without cookies. Does not print secret values.
 */
import fs from "node:fs";
import { ESPN_READS, espnCookieHeader } from "../lib.mjs";

const LID = "1389723418827460608";
const ESPN = "35763180";
const YEARS = [2024, 2023, 2022, 2021, 2020];
const statusPath = `data/leagues/${LID}/raw/espn_status.json`;
const finishesPath = `data/leagues/${LID}/ui/finishes.json`;

const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const finishes = fs.existsSync(finishesPath)
  ? JSON.parse(fs.readFileSync(finishesPath, "utf8"))
  : {};
const cookieEnv = !!espnCookieHeader();

async function probe(year) {
  const url = `${ESPN_READS}/seasons/${year}/segments/0/leagues/${ESPN}?view=mTeam`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  let reason = "";
  try {
    const body = await res.json();
    reason = (body && body.details && body.details[0] && body.details[0].type)
      || (body && body.messages && body.messages[0])
      || "";
  } catch {
    reason = "";
  }
  return { year, http: res.status, reason };
}

const public_api = [];
for (const year of YEARS) public_api.push(await probe(year));

const seasons = status.seasons || [];
const have = YEARS.filter((y) => seasons.includes(String(y)));
const out = {
  espn_league_id: ESPN,
  book_cookie_flag: !!status.cookie,
  book_authorized: !!status.authorized,
  book_reason: status.reason || null,
  book_seasons: seasons,
  finishes_seasons: finishes.seasons || [],
  years_2020_2024_on_book: have,
  process_has_espn_cookie_env: cookieEnv,
  public_api,
  can_read_2020_2024_now: have.length === YEARS.length && !!status.authorized,
  next: status.authorized
    ? "Book already has ESPN seasons."
    : (cookieEnv
      ? "This shell has cookies. Run node build.mjs 1389723418827460608 --skip-snapshot."
      : "Public API is still 401. Rebuild dashboard in Cuckle after ESPN_S2/ESPN_SWID are on league-sync. Not the ESPN app."),
};

console.log(JSON.stringify(out, null, 2));
