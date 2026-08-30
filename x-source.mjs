#!/usr/bin/env node
/**
 * Read @AdamSchefter's timeline from X and hand it to the news pipeline in the shape the pipeline
 * already understands. **Nothing calls this yet, and without a token it does nothing.**
 *
 *   node x-source.mjs                # no token -> one log line, exit 0, zero cost
 *   node x-source.mjs --plan         # print the exact request it would make. No network.
 *   node x-source.mjs --report       # fetch (needs a token), print items and cost, write no file
 *   X_BEARER_TOKEN=… node x-source.mjs
 *
 * ## Endpoint shape: checked, not remembered
 *
 * Every field name below was read out of X's own OpenAPI document rather than recalled:
 * `https://api.x.com/2/openapi.json`, fetched from the build VM on 2026-08-30, `openapi: 3.0.0`,
 * `info.version: 2.168`, `servers: [{ url: "https://api.x.com" }]`. What it says:
 *
 * - **`GET /2/users/{id}/tweets`** — `operationId: getUsersPosts`, summary "Get Users Posts".
 *   `security` lists `BearerToken`, which `components.securitySchemes` defines as
 *   `{ type: http, scheme: bearer }` — i.e. `Authorization: Bearer …`, app-only, no OAuth dance.
 *   Query parameters: `max_results` (integer, **minimum 5, maximum 100**), `pagination_token`,
 *   `start_time`, `end_time`, `since_id`, `until_id`, and `exclude` (array, enum exactly
 *   `["replies","retweets"]`).
 * - **The field selector on this route is `post.fields`, not `tweet.fields`.** In 2.168
 *   `tweet.fields` survives only on the streaming routes (`/2/tweets/search/stream`,
 *   `/2/tweets/firehose/stream`, …); the timeline route resolves
 *   `$ref: PostFieldsParameter`, whose `name` is `post.fields`. Available values include
 *   `created_at`, `text`, `entities`, `lang`, `referenced_posts`, `public_metrics`. This rename is
 *   the single most likely thing to be wrong from memory, so it is the constant FIELDS_PARAM
 *   below and changing it back is one line.
 * - **`GET /2/users/by/username/{username}`** — `operationId: getUsersByUsername`. This is the
 *   only way to turn "AdamSchefter" into the numeric id the timeline route wants.
 *
 * ## Money
 *
 * X moved to pay-per-use in 2026: no free tier, prepaid credits, billed **per resource returned**.
 * Published rates (console.x.com/pricing, cross-checked 2026-08-30): a **post read is $0.005** and
 * a **user read is $0.010**, with pay-per-use capped at 3,000,000 post reads a monthly cycle.
 *
 * Three consequences, all implemented:
 *
 * 1. **The user id is resolved once and cached forever.** It costs twice what a post costs and it
 *    never changes. Paying $0.010 twice a day for a number already on disk would be silly.
 * 2. **`since_id` is persisted**, so a run is billed for new posts and not for the same fifty
 *    posts again. This is the difference between a few dollars a month and a few dollars a day.
 * 3. **A hard per-run read budget, defaulting to 50 posts** (MAX_READS_PER_RUN), and a hard
 *    per-month budget defaulting to **1,200 posts** (MAX_READS_PER_MONTH). The monthly one is the
 *    real guard: 1,200 × $0.005 = **$6.00**, a ceiling a third above the ~$4.50 estimate, so
 *    normal running is unaffected and a bug that loops cannot produce a surprise invoice. Once the
 *    month's budget is spent the module no-ops with a log line exactly as if the token were
 *    missing. Both are overridable by environment variable, and the estimate they defend is
 *    900 reads a month (~30 of his posts a day, two runs a day) at $0.005 = $4.50.
 *
 * Every run appends its actual spend to `data/x-state.json`, so the estimate can be checked
 * against reality instead of trusted.
 */
import fs from "node:fs";
import { DATA } from "./lib.mjs";

/** X's own server, from the spec's `servers` block. */
const API = "https://api.x.com";
/** Renamed from `tweet.fields` in the current spec. One line to change if it moves back. */
const FIELDS_PARAM = "post.fields";
const FIELDS = "created_at,text,lang,entities,referenced_posts,public_metrics";
const UA = "cuckle-trade-tracker/1.0 (league news feed; +https://github.com/slabslip/cuckle-trade-tracker)";

export const COST_PER_POST_READ = 0.005;
export const COST_PER_USER_READ = 0.010;
export const MAX_READS_PER_RUN = Number(process.env.X_MAX_READS_PER_RUN || 50);
export const MAX_READS_PER_MONTH = Number(process.env.X_MAX_READS_PER_MONTH || 1200);
/**
 * One page per run by default. He posts well under 100 originals a day and the run is twice a
 * day, so a second page means either a long outage or a bug — and paging on a bug is how a read
 * budget gets spent in a loop.
 */
export const MAX_PAGES_PER_RUN = Number(process.env.X_MAX_PAGES_PER_RUN || 1);
const STATE_PATH = `${DATA}/x-state.json`;
/** Keep the telemetry readable rather than complete. */
const KEEP_RUNS = 30;

export const DEFAULT_ACCOUNT = "AdamSchefter";

/* ---------------------------------------------------------------- state ---- */

export function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    return { v: 1, account: DEFAULT_ACCOUNT, user_id: null, since_id: null, month: null, month_reads: 0, runs: [] };
  }
  const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  return { v: 1, account: DEFAULT_ACCOUNT, user_id: null, since_id: null, month: null, month_reads: 0, runs: [], ...raw };
}

export function writeState(state) {
  const out = { ...state, runs: (state.runs || []).slice(-KEEP_RUNS) };
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(out, null, 2) + "\n");
  return STATE_PATH;
}

function monthKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 7);
}

/** Reads still affordable this run, after the month's ceiling is taken into account. */
export function budgetFor(state, now = Date.now()) {
  const month = monthKey(now);
  const spent = state.month === month ? Number(state.month_reads) || 0 : 0;
  const left = Math.max(0, MAX_READS_PER_MONTH - spent);
  return { month, month_reads: spent, month_remaining: left, run_budget: Math.min(MAX_READS_PER_RUN, left) };
}

/* --------------------------------------------------------------- request ---- */

/**
 * The timeline URL, built from the spec's parameter names and clamped to its stated bounds.
 *
 * `max_results` is clamped into 5..100 because the spec gives those as `minimum`/`maximum` and a
 * request outside them is a 400 — which would be billed as an invalid request rather than as
 * nothing, and would look like an outage.
 */
export function timelineUrl(userId, { sinceId = null, budget = MAX_READS_PER_RUN, paginationToken = null } = {}) {
  const url = new URL(`${API}/2/users/${encodeURIComponent(String(userId))}/tweets`);
  url.searchParams.set("max_results", String(Math.min(100, Math.max(5, Number(budget) || 5))));
  // Retweets are somebody else's words and replies are half a conversation; neither is a report,
  // and both would be billed at $0.005 apiece.
  url.searchParams.set("exclude", "retweets,replies");
  url.searchParams.set(FIELDS_PARAM, FIELDS);
  if (sinceId) url.searchParams.set("since_id", String(sinceId));
  if (paginationToken) url.searchParams.set("pagination_token", String(paginationToken));
  return url.toString();
}

export function userLookupUrl(username) {
  return `${API}/2/users/by/username/${encodeURIComponent(String(username))}`;
}

async function getJson(url, token, timeoutMs = 15000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, "user-agent": UA, accept: "application/json" },
      signal: ac.signal,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${body.slice(0, 300)}`);
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------- normalise ---- */

/**
 * One post, in the raw shape news-sources.mjs adapters already return.
 *
 * `title` carries the whole post text and `summary` is empty, and that is the honest mapping: a
 * post has no title/summary split, so pretending one exists would invite the RSS matcher's
 * title-only rule to be applied to text it was never designed for. news-match.mjs reads the whole
 * string; see its header for what replaces the title-only defence.
 */
export function normalisePost(post, username) {
  const text = String(post && post.text ? post.text : "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const published = post.created_at ? Date.parse(post.created_at) : null;
  return {
    source: `x:${String(username).toLowerCase()}`,
    source_label: `${username} (X)`,
    source_url: `https://x.com/${username}/status/${post.id}`,
    title: text,
    summary: "",
    // Never Date.now(): a missing timestamp must read as missing, not as "one second ago".
    published: Number.isFinite(published) ? published : null,
    player_id: null,
    x_id: String(post.id),
  };
}

/* ------------------------------------------------------------------ pull ---- */

/**
 * Pull whatever is new since the last run.
 *
 * Returns `{ ok, skipped, reason, items, cost }` and **never throws for a missing token**. The
 * whole point of this module today is that it is inert: the shipping pipeline must be exactly as
 * it was until the user provisions a token, so "no token" is a normal, successful, silent outcome
 * rather than an error the cron would surface as a red build.
 */
export async function pull({
  token = process.env.X_BEARER_TOKEN || "",
  account = process.env.X_ACCOUNT || DEFAULT_ACCOUNT,
  persist = true,
  now = Date.now(),
} = {}) {
  const cost = { user_reads: 0, post_reads: 0, usd: 0, budget_run: 0, budget_month_remaining: 0 };
  if (!token) {
    return { ok: true, skipped: true, reason: "no X_BEARER_TOKEN — X ingest is off, 0 reads, $0.00", items: [], cost };
  }
  if (!/^[A-Za-z0-9_]{1,15}$/.test(account)) {
    return { ok: false, skipped: true, reason: `X_ACCOUNT ${JSON.stringify(account)} is not a valid handle`, items: [], cost };
  }

  const state = readState();
  if (state.account !== account) {
    // A different handle invalidates both the cached id and the since_id watermark.
    state.account = account;
    state.user_id = null;
    state.since_id = null;
  }
  const budget = budgetFor(state, now);
  cost.budget_run = budget.run_budget;
  cost.budget_month_remaining = budget.month_remaining;
  if (budget.run_budget < 5) {
    return {
      ok: true,
      skipped: true,
      reason: `monthly read budget spent (${budget.month_reads}/${MAX_READS_PER_MONTH} posts this cycle) — X ingest is off until ${monthKey(now)} rolls over`,
      items: [],
      cost,
    };
  }

  if (!state.user_id) {
    const who = await getJson(userLookupUrl(account), token);
    const id = who && who.data && who.data.id;
    if (!id) throw new Error(`could not resolve @${account} to a user id`);
    state.user_id = String(id);
    cost.user_reads = 1;
  }

  const items = [];
  let pageToken = null;
  let readsLeft = budget.run_budget;
  let newestId = state.since_id;
  for (let page = 0; page < MAX_PAGES_PER_RUN && readsLeft >= 5; page++) {
    const url = timelineUrl(state.user_id, { sinceId: state.since_id, budget: readsLeft, paginationToken: pageToken });
    const body = await getJson(url, token);
    const posts = (body && body.data) || [];
    cost.post_reads += posts.length;
    readsLeft -= posts.length;
    for (const post of posts) {
      const row = normalisePost(post, account);
      if (!row) continue;
      items.push(row);
      // Post ids are ascending snowflakes; compare as BigInt because they exceed 2^53.
      if (!newestId || BigInt(row.x_id) > BigInt(newestId)) newestId = row.x_id;
    }
    pageToken = body && body.meta ? body.meta.next_token || null : null;
    if (!pageToken) break;
  }

  cost.usd = Number((cost.post_reads * COST_PER_POST_READ + cost.user_reads * COST_PER_USER_READ).toFixed(4));

  if (persist) {
    const month = monthKey(now);
    state.month = month;
    state.month_reads = (state.month === budget.month ? budget.month_reads : 0) + cost.post_reads;
    state.since_id = newestId || state.since_id;
    state.runs = [...(state.runs || []), {
      at: new Date(now).toISOString(),
      post_reads: cost.post_reads,
      user_reads: cost.user_reads,
      usd: cost.usd,
      items: items.length,
      since_id: state.since_id,
    }];
    writeState(state);
  }

  return { ok: true, skipped: false, reason: null, items, cost, user_id: state.user_id, since_id: state.since_id };
}

/** What a run would ask for, with no token and no network. The reviewable form of this module. */
export function plan({ account = process.env.X_ACCOUNT || DEFAULT_ACCOUNT, now = Date.now() } = {}) {
  const state = readState();
  const budget = budgetFor(state, now);
  return {
    spec: "https://api.x.com/2/openapi.json (openapi 3.0.0, info.version 2.168, read 2026-08-30)",
    token_present: !!process.env.X_BEARER_TOKEN,
    account,
    cached_user_id: state.user_id,
    since_id: state.since_id,
    user_lookup: state.user_id ? "cached — not requested" : userLookupUrl(account),
    timeline: timelineUrl(state.user_id || "{user_id}", { sinceId: state.since_id, budget: budget.run_budget }),
    budget: {
      per_run_posts: MAX_READS_PER_RUN,
      per_month_posts: MAX_READS_PER_MONTH,
      pages_per_run: MAX_PAGES_PER_RUN,
      this_run_posts: budget.run_budget,
      month: budget.month,
      month_reads_so_far: budget.month_reads,
      worst_case_month_usd: Number((MAX_READS_PER_MONTH * COST_PER_POST_READ).toFixed(2)),
    },
    unit_costs_usd: { post_read: COST_PER_POST_READ, user_read: COST_PER_USER_READ },
  };
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
  const args = new Set(process.argv.slice(2));
  if (args.has("--plan")) {
    console.log(JSON.stringify(plan(), null, 2));
  } else {
    pull({ persist: !args.has("--report") })
      .then((r) => {
        if (r.skipped) {
          console.log(`x-source: ${r.reason}`);
          return;
        }
        console.log(JSON.stringify({
          items: r.items.length,
          cost: r.cost,
          since_id: r.since_id,
          sample: r.items.slice(0, 3).map((i) => ({ url: i.source_url, text: i.title.slice(0, 140) })),
        }, null, 2));
      })
      .catch((err) => {
        console.error(`x-source: ${err.message}`);
        process.exit(1);
      });
  }
}
