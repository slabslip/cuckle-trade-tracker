#!/usr/bin/env node
/**
 * Coaching corpus for the smack / summary agent.
 *
 * Optional Shortcut field `agent_tip` (not the public `note`) is appended here on ingest
 * so the register can learn from Truman's notes over time. See docs/SMACK_AGENT.md.
 *
 *   data/smack-tips.json  — committed append-only log
 *   news-llm.mjs          — recent tips are quoted into the LLM prompt when enabled
 *   news-voice.mjs        — templates stay hand-promoted from this log + SMACK_AGENT §5
 */
import fs from "node:fs";
import { DATA } from "./lib.mjs";

export const SMACK_TIPS_PATH = `${DATA}/smack-tips.json`;
export const MAX_TIP = 500;
/** How many recent tips the LLM prompt may quote. */
export const LLM_TIP_LIMIT = 24;

export function trimAgentTip(s) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= MAX_TIP ? t : t.slice(0, MAX_TIP - 1).replace(/\s+\S*$/, "") + "…";
}

export function readSmackTips() {
  try {
    const raw = JSON.parse(fs.readFileSync(SMACK_TIPS_PATH, "utf8"));
    if (!raw || typeof raw !== "object") return { v: 1, updated: null, tips: [] };
    const tips = Array.isArray(raw.tips) ? raw.tips : [];
    return { v: 1, updated: raw.updated || null, tips };
  } catch {
    return { v: 1, updated: null, tips: [] };
  }
}

/**
 * Append one coaching tip. Dedupes on (submission_id + tip text) so a re-sync
 * does not double-count. Returns the tip row or null if empty / duplicate.
 */
export function appendSmackTip(entry) {
  const tip = trimAgentTip(entry && entry.tip);
  if (!tip) return null;
  const store = readSmackTips();
  const submissionId = entry.submission_id != null ? Number(entry.submission_id) : null;
  const dup = store.tips.some(
    (t) => t.submission_id === submissionId && String(t.tip || "") === tip,
  );
  if (dup) return null;
  const row = {
    id: `tip:${submissionId != null ? submissionId : "x"}:${Date.now()}`,
    submission_id: submissionId,
    tweet_url: String(entry.tweet_url || "").slice(0, 300),
    submitted_by: String(entry.submitted_by || "").slice(0, 64),
    created_at: entry.created_at || new Date().toISOString(),
    tip,
    player: String(entry.player || "").slice(0, 80),
    managers: Array.isArray(entry.managers) ? entry.managers.map(String).slice(0, 12) : [],
    poke_kind: String(entry.poke_kind || "").slice(0, 24),
    league_line: String(entry.league_line || "").slice(0, 280),
  };
  store.tips.push(row);
  // Cap the on-disk log so a decade of shares stays readable; oldest drop first.
  if (store.tips.length > 500) store.tips = store.tips.slice(-500);
  store.updated = new Date().toISOString();
  fs.writeFileSync(SMACK_TIPS_PATH, JSON.stringify(store, null, 2) + "\n");
  return row;
}

/** Newest-first tip texts for the LLM voice brief. */
export function recentSmackTipLines(limit = LLM_TIP_LIMIT) {
  const store = readSmackTips();
  return store.tips
    .slice(-Math.max(1, limit))
    .reverse()
    .map((t) => {
      const who = t.submitted_by ? `${t.submitted_by}: ` : "";
      const about = t.player ? ` (${t.player}${t.poke_kind ? ` · ${t.poke_kind}` : ""})` : "";
      return `${who}${t.tip}${about}`;
    });
}
