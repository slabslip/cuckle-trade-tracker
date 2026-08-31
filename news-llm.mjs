#!/usr/bin/env node
/**
 * The LLM adapter behind `leagueLine()`. **Nothing calls a model yet, and without a key this file
 * makes no network request at all.**
 *
 *   node news-llm.mjs            # no key -> one line saying so, exit 0, zero cost
 *   node news-llm.mjs --plan     # print the exact request it would make, and the budget. No network.
 *   node news-llm.mjs --sample   # run the template path over the real tweets, for comparison
 *
 * ## Why this exists as a file rather than as a paragraph in the SDD
 *
 * The user asked for the tweet to be *summarised*. A genuine summary of arbitrary prose is a
 * language task, and `news-voice.mjs`'s templates do a bounded version of it: they classify, they
 * lift the salient span out of the tweet verbatim, and they attach the credit. That is honest and
 * it cannot state something the tweet did not say — but it cannot compress two sentences into one
 * either, and it cannot tell a story that matters from one that does not.
 *
 * Doing better needs a model, a model needs a key, and the key is the user's to buy. So the wiring
 * is here, complete and inert, and turning it on is setting one secret. The alternative — writing
 * it when the key arrives — is how a seam stops being a seam.
 *
 * ## What the user must supply
 *
 * 1. **`NEWS_LLM_KEY`** as a repository secret (Settings -> Secrets and variables -> Actions ->
 *    New repository secret), exposed to the step as
 *    `env: { NEWS_LLM_KEY: ${{ secrets.NEWS_LLM_KEY }} }`. It must **not** be committed. Unlike
 *    the Supabase `anon` key, which is browser-safe by design, this one spends money.
 * 2. **`NEWS_LLM_URL`** — the provider's chat-completions endpoint. Defaulted to nothing on
 *    purpose: this file will not pick a vendor on the user's behalf, and an endpoint hardcoded to
 *    one provider is a migration later. Any provider whose API takes
 *    `{ model, messages: [{role, content}] }` and answers `{ choices: [{ message: { content } }] }`
 *    works unchanged; that shape is the de-facto standard and is what every major hosted API
 *    speaks today. A provider with a different shape needs `parseReply()` changed and nothing else.
 * 3. **`NEWS_LLM_MODEL`** — the model name, as that provider spells it.
 * 4. Optionally **`NEWS_LLM_VOICE`** — a path to a text file of the user's own example lines, one
 *    per line, quoted into the prompt. This matters more than the model choice. 5-15 lines is
 *    plenty. Without it the prompt states the register in words, which is strictly worse.
 *
 * Plain `fetch`, which is a Node built-in since 18. **No npm package, no provider SDK.**
 *
 * ## Money, and the ceiling that makes it safe
 *
 * The workload is small: one short prompt per row, and only for rows that are new. The feed ships
 * at most MAX_ITEMS (60) rows and in steady state a handful of them are new per run, so a run
 * costs single-digit calls. `x-source.mjs` set this project's precedent — a **$6.00/month ceiling**
 * that no-ops when exhausted rather than warning — and the same shape is used here:
 *
 *   - **MAX_CALLS_PER_RUN (25)** bounds one bad loop.
 *   - **MAX_CALLS_PER_MONTH (2000)** is the real guard. At COST_PER_CALL_USD (0.003 — order of
 *     400 tokens in and 60 out on a small hosted model) that is **$6.00**, comfortably above the
 *     realistic 60-100 calls a month a twice-daily run of mostly-unchanged rows produces, so
 *     normal running is never affected and a runaway cannot produce a surprise invoice.
 *   - **Past the budget this module behaves exactly as if the key were missing**: `llmLine()`
 *     returns null, `leagueLineAsync()` ships the template, and the feed is a little less funny.
 *     It never fails a build and it never blocks a row.
 *
 * COST_PER_CALL_USD is an estimate and is *labelled* as one. Published per-token prices move
 * constantly, so it is overridable, and every run appends its real call count to
 * `data/news-llm-state.json` so the estimate can be checked against reality rather than trusted.
 *
 * ## The two rules a generated line cannot talk its way out of
 *
 * They are enforced in `news-voice.mjs`, on the caller's side of the seam, precisely so that
 * editing the prompt cannot loosen them:
 *
 *   - **No manager's name, and no second person**, on a shared tweet. The row may have been
 *     addressed by a *matcher*, and a summary that says "you" turns the sharer's jab into an
 *     accusation aimed at whoever rosters the player. `noteFreeOfAddress()` refuses it.
 *   - **Length.** Over MAX_LINE the template ships instead, because a paragraph in a 320px row
 *     is not a summary.
 *
 * A refused line costs variety, not the row. That is the same trade the whole seam is built on.
 */
import fs from "node:fs";
import { DATA } from "./lib.mjs";
import { recentSmackTipLines } from "./smack-tips.mjs";

export const KEY_ENV = "NEWS_LLM_KEY";
export const URL_ENV = "NEWS_LLM_URL";
export const MODEL_ENV = "NEWS_LLM_MODEL";
export const VOICE_ENV = "NEWS_LLM_VOICE";

/** An estimate, and overridable. Read the provider's current price page, not this number. */
export const COST_PER_CALL_USD = Number(process.env.NEWS_LLM_COST_PER_CALL || 0.003);
export const MAX_CALLS_PER_RUN = Number(process.env.NEWS_LLM_MAX_CALLS_PER_RUN || 25);
export const MAX_CALLS_PER_MONTH = Number(process.env.NEWS_LLM_MAX_CALLS_PER_MONTH || 2000);
/** The ceiling the monthly cap defends, stated in the unit that matters. */
export const MONTHLY_CEILING_USD = Number((MAX_CALLS_PER_MONTH * COST_PER_CALL_USD).toFixed(2));

const STATE_PATH = `${DATA}/news-llm-state.json`;
/** Keep the telemetry readable rather than complete. */
const KEEP_RUNS = 30;
const TIMEOUT_MS = 12000;

/** Calls made in this process, so MAX_CALLS_PER_RUN is a real ceiling and not a hope. */
let callsThisRun = 0;

/**
 * The voice rules, as hard constraints rather than as a description.
 *
 * docs/NEWS_SDD.md §7 names the editorial risk this addresses: a model told to be funny about
 * ten friends will eventually write a line about a *person*. The template pass cannot do that
 * because every line was written by hand; a model can, so the rules are stated as prohibitions
 * and the two that matter are additionally checked in code after the answer comes back.
 */
export const SYSTEM_PROMPT = [
  "You summarise one tweet for a ten-person fantasy football league's news feed.",
  "Write ONE sentence, at most 200 characters, plain text, no markdown, no emoji, no hashtags.",
  "State only what the tweet says. Never add a fact, a number, a date or an outcome it does not state.",
  "If the tweet credits a reporter, end with 'Via @handle.'",
  "Never address anybody. Do not use 'you' or 'your'. Do not name a league member.",
  "Do not describe the act of sharing. Summarise the content.",
  "Nothing about appearance, family, money, health beyond what the tweet reports, or anything a person would not laugh at.",
].join(" ");

/* ---------------------------------------------------------------- state ---- */

export function readState() {
  const empty = { v: 1, month: null, month_calls: 0, runs: [] };
  if (!fs.existsSync(STATE_PATH)) return empty;
  try {
    return { ...empty, ...JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) };
  } catch {
    // A corrupt state file must not be read as "no spend so far" and must not take a build down.
    // Refusing to spend is the safe direction, so it reports the budget as exhausted.
    return { ...empty, month: monthKey(), month_calls: MAX_CALLS_PER_MONTH };
  }
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

function writeState(state) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify({ ...state, runs: (state.runs || []).slice(-KEEP_RUNS) }, null, 1) + "\n");
}

/**
 * How many calls are left this month.
 *
 * The month rolls by comparing the stored key with today's, so a new month resets the spend
 * without a cron and without anybody remembering to.
 */
export function budget() {
  const state = readState();
  const month = monthKey();
  const spent = state.month === month ? Number(state.month_calls || 0) : 0;
  const monthLeft = Math.max(0, MAX_CALLS_PER_MONTH - spent);
  const runLeft = Math.max(0, MAX_CALLS_PER_RUN - callsThisRun);
  return {
    month,
    spent_this_month: spent,
    calls_left_this_month: monthLeft,
    calls_left_this_run: runLeft,
    left: Math.min(monthLeft, runLeft),
    estimated_spend_usd: Number((spent * COST_PER_CALL_USD).toFixed(3)),
    ceiling_usd: MONTHLY_CEILING_USD,
  };
}

function chargeOne() {
  callsThisRun++;
  const state = readState();
  const month = monthKey();
  const spent = state.month === month ? Number(state.month_calls || 0) : 0;
  writeState({
    ...state,
    month,
    month_calls: spent + 1,
    runs: [...(state.runs || []), { at: new Date().toISOString(), calls: 1 }],
  });
}

/* ------------------------------------------------------------- the call ---- */

/**
 * Is the adapter configured at all?
 *
 * All three of key, endpoint and model, because two of the three is a build that fails on the
 * first row rather than one that quietly stays on templates. Absence is the normal state.
 */
export function llmEnabled() {
  return !!(process.env[KEY_ENV] && process.env[URL_ENV] && process.env[MODEL_ENV]);
}

/** The user's own lines, if they left a file of them. The prompt should quote them, not describe them. */
export function voiceExamples() {
  const path = process.env[VOICE_ENV];
  const fromFile = path && fs.existsSync(path)
    ? fs.readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 15)
    : [];
  // Shortcut agent_tips accumulated in data/smack-tips.json — see docs/SMACK_AGENT.md.
  const fromTips = recentSmackTipLines(12);
  const seen = new Set();
  const out = [];
  for (const line of [...fromFile, ...fromTips]) {
    const k = line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
    if (out.length >= 20) break;
  }
  return out;
}

/** Everything the model is told about one row. Facts only: no manager, ever. */
export function userPrompt(item) {
  const lines = [];
  if (item && item.player) {
    lines.push(`Player: ${item.player}${item.team ? ` (${item.team}${item.position ? ` ${item.position}` : ""})` : ""}`);
  }
  if (item && item.tweet_handle) lines.push(`Posted by: @${String(item.tweet_handle).replace(/^@/, "")}`);
  lines.push(`Tweet: ${String((item && item.title) || "")}`);
  const examples = voiceExamples();
  if (examples.length) lines.push(`Match the register of these lines:\n${examples.map((l) => `- ${l}`).join("\n")}`);
  return lines.join("\n");
}

/**
 * The request, built but not sent, so `--plan` can print it and a reader can check it without a
 * key. The body is the shape every major hosted API takes; see the header note on URL_ENV.
 */
export function plan(item) {
  return {
    enabled: llmEnabled(),
    url: process.env[URL_ENV] || `(unset — set ${URL_ENV})`,
    model: process.env[MODEL_ENV] || `(unset — set ${MODEL_ENV})`,
    key: process.env[KEY_ENV] ? "(set)" : `(unset — set ${KEY_ENV})`,
    voice_examples: voiceExamples().length,
    headers: { "content-type": "application/json", authorization: `Bearer <${KEY_ENV}>` },
    body: {
      model: process.env[MODEL_ENV] || "<model>",
      max_tokens: 120,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(item || {}) },
      ],
    },
    budget: budget(),
  };
}

/** The one provider-specific line. A different response shape changes this and nothing else. */
export function parseReply(json) {
  const choice = json && json.choices && json.choices[0];
  const content = choice && choice.message && choice.message.content;
  return typeof content === "string" ? content.trim() : "";
}

/**
 * One line from the model, or null.
 *
 * Null for every reason: no key, no endpoint, no model, budget spent, a non-200, a timeout, a
 * body that does not parse. The caller ships the template on null, so there is no failure here
 * that costs a row — which is the only reason it is safe to put a network call in a copy step.
 */
export async function llmLine(item, ctx) {
  if (!llmEnabled()) return null;
  if (budget().left <= 0) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Charged before the call, not after. A request that times out or is aborted may still have
    // been billed, and a budget that only counts successes is not a budget.
    chargeOne();
    const res = await fetch(process.env[URL_ENV], {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env[KEY_ENV]}`,
      },
      body: JSON.stringify(plan(item).body),
    });
    if (!res.ok) return null;
    return parseReply(await res.json()) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- main ---- */

async function main() {
  const args = new Set(process.argv.slice(2));
  const { TWEET_SAMPLES, summariseTweet } = await import("./news-voice.mjs");
  const sample = TWEET_SAMPLES[0];
  const item = {
    id: "sample",
    player: sample.player,
    team: sample.team,
    position: sample.position,
    title: sample.text,
    tweet_handle: sample.tweet_handle,
  };
  if (args.has("--plan")) {
    console.log(JSON.stringify(plan(item), null, 2));
    return;
  }
  if (args.has("--sample")) {
    console.log(JSON.stringify({
      note: "The template path, which is what ships today. The model is not called.",
      lines: TWEET_SAMPLES.map((s) => summariseTweet({
        id: `sample:${s.tweet_handle}`,
        player: s.player, team: s.team, position: s.position,
        title: s.text, tweet_handle: s.tweet_handle,
      })),
    }, null, 2));
    return;
  }
  if (!llmEnabled()) {
    console.log(`news-llm: inert — set ${KEY_ENV}, ${URL_ENV} and ${MODEL_ENV} to enable. No request made, no cost.`);
    return;
  }
  console.log(JSON.stringify({ line: await llmLine(item, {}), budget: budget() }, null, 2));
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fs.realpathSync(new URL(import.meta.url).pathname);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
