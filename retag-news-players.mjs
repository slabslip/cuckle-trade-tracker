#!/usr/bin/env node
/**
 * Retag existing news.json rows with players[] from the current matcher.
 * Does not hit the network — reuses tweet_text already on disk.
 *
 *   node retag-news-players.mjs
 */
import fs from "fs";
import { loadIndex, matchText } from "./news-match.mjs";

const ROOT = new URL("./", import.meta.url);
const path = new URL("data/ui/news.json", ROOT);
const book = JSON.parse(fs.readFileSync(path, "utf8"));
const index = loadIndex();
let updated = 0;
let multi = 0;

for (const it of book.items || []) {
  if (it.category !== "tweet" || !it.tweet_text) continue;
  const res = matchText(it.tweet_text, index);
  const publishable = (res.subjects || []).filter((s) => s.publish);
  const players = publishable.map((s) => ({
    player_id: s.player_id,
    player: s.player,
    player_team: s.player_team || null,
    player_position: s.player_position || null,
    user_id: s.user_id || "",
    manager: s.manager || "",
    confidence: s.confidence,
  }));
  const managers = [];
  const seen = new Set();
  for (const s of publishable) {
    if (!s.manager || seen.has(s.user_id)) continue;
    seen.add(s.user_id);
    managers.push(s.manager);
  }
  // Keep an explicit target/primary manager first when already present.
  if (it.manager && !managers.includes(it.manager)) managers.unshift(it.manager);
  it.players = players;
  if (players.length && !it.player && players[0]) {
    it.player = players[0].player;
    it.player_id = players[0].player_id;
    it.player_team = players[0].player_team;
    it.player_position = players[0].player_position;
  }
  if (managers.length) {
    it.managers = managers;
    if (managers.length > 1 && (it.match === "player_auto" || it.match === "player")) {
      it.match = "player_auto_multi";
      // Multi-tag summaries stay impersonal.
      if (it.manager && managers[0] !== it.manager) {
        /* keep primary manager for back-compat single-id readers */
      }
    }
  }
  updated++;
  if (players.length > 1) multi++;
}

fs.writeFileSync(path, JSON.stringify(book, null, 2) + "\n");
console.log(JSON.stringify({ updated, multi, items: (book.items || []).length }, null, 2));
