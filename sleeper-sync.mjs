#!/usr/bin/env node
/** Official Sleeper GETs only. Trade tape + aliases. Does not overwrite aliases.overrides.json. */
import fs from "node:fs";
import { DATA, readJson, setLeagueId, sleeperGet, writeJson, ymd } from "./lib.mjs";

const LEAGUE_ID = setLeagueId(process.argv[2] || process.env.LEAGUE_ID);

function addAlias(map, userId, raw, kind, season) {
  if (!raw || typeof raw !== "string") return;
  const name = raw.trim();
  if (!name) return;
  if (!map.has(userId)) {
    map.set(userId, {
      user_id: userId,
      canonical_name: name,
      aliases: [],
    });
  }
  const row = map.get(userId);
  if (!row.aliases.some((a) => a.name === name && a.kind === kind)) {
    row.aliases.push({ name, kind, first_seen_season: season });
  }
}

async function walkLeagues(startId) {
  const leagues = [];
  let id = startId;
  const seen = new Set();
  while (id && id !== "0" && !seen.has(id)) {
    seen.add(id);
    const league = await sleeperGet(`/league/${id}`);
    if (!league) break;
    leagues.push(league);
    id = league.previous_league_id;
  }
  return leagues;
}

async function txsForWeek(leagueId, week, useCache) {
  const cachePath = `${DATA}/tx_cache/${leagueId}-${week}.json`;
  if (useCache && fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  }
  const txs = await sleeperGet(`/league/${leagueId}/transactions/${week}`);
  fs.mkdirSync(`${DATA}/tx_cache`, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(txs ?? []));
  return txs;
}

async function loadPlayers() {
  const cache = `${DATA}/players.nfl.json`;
  if (fs.existsSync(cache)) {
    const age = Date.now() - fs.statSync(cache).mtimeMs;
    if (age < 24 * 60 * 60 * 1000) {
      return JSON.parse(fs.readFileSync(cache, "utf8"));
    }
  }
  const players = await sleeperGet("/players/nfl");
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(players));
  return players;
}

function playerLabel(players, id) {
  const p = players[id];
  if (!p) return `player:${id}`;
  const name = p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
  return name || `player:${id}`;
}

function pickLabel(p) {
  return `${p.season} R${p.round} (orig roster ${p.roster_id})`;
}

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  const overrides = readJson("aliases.overrides.json", {}) || {};

  const leagues = await walkLeagues(LEAGUE_ID);
  const members = new Map();
  const observations = [];
  const seats = [];
  const trades = [];
  const seenTx = new Set();
  const legs = [];

  const players = await loadPlayers();
  const currentRosters = [];

  for (const league of leagues) {
    const season = String(league.season);
    const users = (await sleeperGet(`/league/${league.league_id}/users`)) || [];
    const rosters = (await sleeperGet(`/league/${league.league_id}/rosters`)) || [];
    const rosterOwner = new Map(rosters.map((r) => [r.roster_id, r.owner_id]));

    for (const u of users) {
      addAlias(members, u.user_id, u.display_name, "display_name", season);
      addAlias(members, u.user_id, u.username, "username", season);
      addAlias(members, u.user_id, u.metadata?.team_name, "team_name", season);
      observations.push({
        user_id: u.user_id,
        season,
        league_id: league.league_id,
        display_name: u.display_name || null,
        username: u.username || null,
        team_name: u.metadata?.team_name || null,
      });
    }

    for (const r of rosters) {
      seats.push({
        league_id: league.league_id,
        season,
        roster_id: r.roster_id,
        owner_id: r.owner_id,
      });
      if (league.league_id === leagues[0].league_id) {
        currentRosters.push({
          season,
          roster_id: r.roster_id,
          owner_id: r.owner_id,
          players: r.players || [],
          starters: r.starters || [],
          reserve: r.reserve || [],
          taxi: r.taxi || [],
        });
      }
    }

    const useCache = Number(season) < new Date().getUTCFullYear();
    for (let week = 0; week <= 25; week++) {
      const txs = await txsForWeek(league.league_id, week, useCache);
      if (!Array.isArray(txs)) continue;
      for (const tx of txs) {
        if (tx.type !== "trade" || tx.status !== "complete") continue;
        if (seenTx.has(tx.transaction_id)) continue;
        seenTx.add(tx.transaction_id);

        const toUser = (rosterId) => rosterOwner.get(rosterId) || null;
        trades.push({
          transaction_id: tx.transaction_id,
          league_id: league.league_id,
          season,
          week,
          created: tx.created,
          date: ymd(tx.created),
          roster_ids: tx.roster_ids || [],
          user_ids: (tx.roster_ids || []).map(toUser),
        });

        for (const [playerId, rosterId] of Object.entries(tx.adds || {})) {
          legs.push({
            transaction_id: tx.transaction_id,
            direction: "in",
            to_user_id: toUser(rosterId),
            to_roster_id: rosterId,
            kind: "player",
            asset_key: `player:${playerId}`,
            label: playerLabel(players, playerId),
          });
        }
        for (const [playerId, rosterId] of Object.entries(tx.drops || {})) {
          legs.push({
            transaction_id: tx.transaction_id,
            direction: "out",
            from_user_id: toUser(rosterId),
            from_roster_id: rosterId,
            kind: "player",
            asset_key: `player:${playerId}`,
            label: playerLabel(players, playerId),
          });
        }
        for (const p of tx.draft_picks || []) {
          const pick = {
            season: String(p.season),
            round: p.round,
            roster_id: p.roster_id,
            previous_owner_id: p.previous_owner_id,
            owner_id: p.owner_id,
          };
          const key = `pick:${p.season}:${p.round}:${p.roster_id}`;
          const label = pickLabel(p);
          legs.push({
            transaction_id: tx.transaction_id,
            direction: "in",
            to_user_id: toUser(p.owner_id),
            to_roster_id: p.owner_id,
            from_user_id: toUser(p.previous_owner_id),
            from_roster_id: p.previous_owner_id,
            origin_roster_id: p.roster_id,
            kind: "pick",
            asset_key: key,
            label,
            pick,
          });
          legs.push({
            transaction_id: tx.transaction_id,
            direction: "out",
            from_user_id: toUser(p.previous_owner_id),
            from_roster_id: p.previous_owner_id,
            to_user_id: toUser(p.owner_id),
            to_roster_id: p.owner_id,
            origin_roster_id: p.roster_id,
            kind: "pick",
            asset_key: key,
            label,
            pick,
          });
        }
        // FAAB is ignored: no leg, no value, no tape line.
      }
    }
  }

  for (const m of members.values()) {
    const pin = overrides[m.user_id];
    if (pin) {
      m.canonical_name = pin;
      continue;
    }
    const displays = m.aliases.filter((a) => a.kind === "display_name");
    const latest = displays.reduce((best, a) => {
      if (!best) return a;
      return Number(a.first_seen_season) >= Number(best.first_seen_season) ? a : best;
    }, null);
    if (latest) m.canonical_name = latest.name;
  }

  const memberList = [...members.values()].sort((a, b) =>
    a.canonical_name.localeCompare(b.canonical_name),
  );
  const nameById = Object.fromEntries(
    memberList.map((m) => [m.user_id, m.canonical_name]),
  );

  const tape = trades
    .map((t) => {
      const bags = {};
      for (const uid of t.user_ids.filter(Boolean)) {
        const mine = legs.filter((l) => l.transaction_id === t.transaction_id);
        bags[nameById[uid] || uid] = {
          in: mine.filter((l) => l.direction !== "out" && l.to_user_id === uid).map((l) => l.label),
          out: mine.filter((l) => l.direction === "out" && l.from_user_id === uid).map((l) => l.label),
        };
      }
      return {
        date: t.date,
        season: t.season,
        week: t.week,
        transaction_id: t.transaction_id,
        sides: bags,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const aliasesSeed = {};
  for (const m of memberList) {
    aliasesSeed[m.canonical_name] = [...new Set(m.aliases.map((a) => a.name))];
  }

  writeJson(
    "leagues.json",
    leagues.map((l) => ({
      league_id: l.league_id,
      season: l.season,
      name: l.name,
      previous_league_id: l.previous_league_id,
      num_teams: l.settings?.num_teams,
      playoff_teams: l.settings?.playoff_teams,
      superflex: (l.roster_positions || []).filter((p) => p === "QB").length >= 2,
    })),
  );
  writeJson("members.json", memberList);
  writeJson("name_observations.json", observations);
  writeJson("seats.json", seats);
  writeJson("rosters_now.json", currentRosters);
  writeJson("trades.json", trades);
  writeJson("trade_legs.json", legs);
  writeJson("trade_tape.json", tape);
  writeJson("aliases.json", aliasesSeed);

  if (!legs.some((l) => l.direction === "out")) {
    throw new Error("self-check failed: no sent legs");
  }

  console.log(
    JSON.stringify(
      {
        seasons: leagues.map((l) => l.season),
        members: memberList.length,
        trades: trades.length,
        legs: legs.length,
        overrides: Object.keys(overrides).length,
        out: DATA,
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
