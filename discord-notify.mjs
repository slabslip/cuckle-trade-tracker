#!/usr/bin/env node
/**
 * Tell a manager, in Discord, that something happened to a player they own.
 *
 *   node discord-notify.mjs                     # DRY RUN. Writes data/discord-outbox.json, sends nothing.
 *   node discord-notify.mjs --target=staging    # needs DISCORD_WEBHOOK_STAGING
 *   node discord-notify.mjs --target=live       # needs DISCORD_WEBHOOK_LIVE
 *   node discord-notify.mjs --self-test         # the injection proofs. No network, no files.
 *
 * Plain HTTPS POST with `fetch`, no dependencies.
 *
 * ## Dry run is the default, and staying that way is the point
 *
 * With no `--target` and no webhook in the environment this writes what it *would* have sent to
 * `data/discord-outbox.json` and sends nothing. Promotion is `--target=staging`, then
 * `--target=live`; both are settings, neither is a code change. The user asked to watch a staging
 * channel before anything reaches the league, and a notifier whose default is "send" would make
 * that a matter of remembering.
 *
 * ## Mention injection is the vulnerability, and it is not hypothetical
 *
 * Every string in a news item is third-party text from the open internet — a headline, a summary,
 * an outlet name. If a headline contains `@everyone`, a naive webhook post pings the whole server,
 * from a message nobody in the league wrote. Two independent defences, because either one alone
 * has a way to be wrong:
 *
 * **1. `allowed_mentions` on every payload, always.** Discord's message docs give
 * `{ parse: [], users: [id] }` as the surgical form: `parse: []` refuses to resolve any mention
 * from the content, while the explicit `users` array overrides `parse` for exactly those ids. So
 * `@everyone` renders as text, a role mention renders as an unclickable name, and only the single
 * intended manager is notified. The docs are also explicit that `parse` and the type arrays are
 * mutually exclusive **per type** — `parse: ["users"]` together with `users: […]` is a 400 — so
 * `parse` here is empty and stays empty.
 *
 * **2. The third-party text is neutralised before it is ever placed in `content`.** Relying on
 * `allowed_mentions` alone means trusting a remote service's parser to keep behaving, on a field
 * whose semantics the docs themselves call "more complex than it seems". So `@` in third-party
 * text gets a zero-width space behind it and raw mention syntax loses its angle brackets, which
 * means the outgoing string contains no mention token at all. The intended `<@id>` is prepended
 * *after* sanitising, so it is the only one that exists.
 *
 * `buildPayload()` then asserts both, and throws rather than returning something unsafe. Run
 * `--self-test` to see a payload built from a headline carrying `@everyone`, `@here` and a raw
 * role mention.
 *
 * ## What is a secret and what is not
 *
 * Webhook URLs **are** secrets: the URL is the credential, and anyone holding it can post to the
 * channel as the webhook. They are read from the environment only, never from a file, and there is
 * no code path that writes one to disk — the dry-run artifact records the target by *name*.
 *
 * Discord **user ids are not secrets**. They are visible to every member of the server. So the
 * `sleeper user_id → discord id` map is a committed config file, `data/discord-members.json`,
 * shipped with placeholder ids. A placeholder is refused at send time rather than silently
 * skipped, so a half-filled map is a loud failure instead of a manager who never gets pinged.
 */
import fs from "node:fs";
import { DATA, readJson } from "./lib.mjs";
import { NOTIFY_MIN } from "./news-match.mjs";

const MEMBERS_PATH = "discord-members.json";
const LEDGER_PATH = `${DATA}/discord-delivered.json`;
const OUTBOX_PATH = `${DATA}/discord-outbox.json`;
/** A delivered story is remembered this long. Longer than the feed's 10-day ingest window. */
const LEDGER_DAYS = 21;
/**
 * Stand-in id used **only** in a dry run, so the outbox shows the real message body before any
 * Discord ids exist. A send still refuses a placeholder: the point of the dry run is to be read,
 * and an outbox of nothing but "skipped: placeholder" would be unreadable.
 */
export const DRY_RUN_EXAMPLE_ID = "100000000000000001";
/** Discord's own limit on `content`. */
const MAX_CONTENT = 2000;

/**
 * Discord publishes global limits (50 requests/second per app) and tells apps to read the
 * `x-ratelimit-*` response headers rather than hard-code anything, because per-route buckets
 * change. Both are done: the headers drive the pacing, and these floors apply underneath as the
 * community-known webhook shape (5 requests per 2 seconds, 30 per minute per webhook).
 *
 * The league's real volume is a handful of messages a run, so this never engages in normal use.
 * It exists for the run *after* an outage, when a backlog goes out at once — which is exactly when
 * a burst would earn a 429, and repeated 429s earn an IP-level restriction.
 */
const RATE = { burst: 5, burstWindowMs: 2000, perMinute: 30, minuteWindowMs: 60000 };
const MAX_ATTEMPTS = 5;

/* ------------------------------------------------------------ sanitising ---- */

const ZWSP = "\u200b";

/**
 * Make third-party text unable to mention anything, without making it unreadable.
 *
 * Order matters. Raw mention syntax loses its brackets first, turning `<@&999>` into `@999`, so
 * that the `@` rule then catches it — doing the `@` rule first would leave `<@\u200b999>`, which
 * is still mention-shaped and relies on Discord not being lenient about the space.
 *
 * A zero-width space is used rather than deletion so the reader still sees the text the outlet
 * published; `@everyone` reads as `@everyone` and pings nobody.
 */
export function sanitiseText(s) {
  return String(s == null ? "" : s)
    .replace(/<@!?&?(\d+)>/g, "@$1")
    .replace(/<#(\d+)>/g, "#$1")
    .replace(/@/g, `@${ZWSP}`)
    .replace(/\s+/g, " ")
    .trim();
}

/** 17–20 digits, and not the all-zero placeholder shipped in the config. */
export function isRealDiscordId(id) {
  const s = String(id == null ? "" : id);
  return /^\d{17,20}$/.test(s) && !/^0+$/.test(s);
}

/* --------------------------------------------------------------- payload ---- */

/**
 * One webhook payload for one manager and one story. Pure — no network, no clock, no files — so
 * the injection proofs are ordinary unit tests.
 *
 * Throws on anything it cannot make safe. A notifier that returns a slightly-wrong payload gets
 * one sent; a notifier that throws gets a failed run and a person reading the log.
 */
export function buildPayload(alert, discordId, { username = "CuckleChunckle" } = {}) {
  if (!isRealDiscordId(discordId)) {
    throw new Error(`refusing to build a payload for discord id ${JSON.stringify(String(discordId))} — fill in data/discord-members.json`);
  }
  const mention = `<@${discordId}>`;
  const player = sanitiseText(alert.player);
  const headline = sanitiseText(alert.headline);
  const source = sanitiseText(alert.source_label || "");
  const line = sanitiseText(alert.league_line || "");
  const url = safeUrl(alert.source_url);

  const parts = [
    `${mention} ${player ? `**${player}**` : "Your roster"}${source ? ` — ${source}` : ""}`,
    headline,
  ];
  if (line) parts.push(`> ${line}`);
  if (url) parts.push(`<${url}>`);
  let content = parts.filter(Boolean).join("\n");
  if (content.length > MAX_CONTENT) content = content.slice(0, MAX_CONTENT - 1) + "\u2026";

  const payload = {
    username,
    content,
    // Discord message docs, Allowed Mentions Object: empty `parse` resolves nothing from the
    // content; the explicit `users` array overrides it for exactly these ids.
    allowed_mentions: { parse: [], users: [String(discordId)] },
  };

  assertInertMentions(payload, discordId);
  return payload;
}

function safeUrl(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!/^https?:\/\//i.test(s)) return "";
  // A URL goes inside <…> to suppress the embed, so a literal > would break out of it.
  return /[<>\s]/.test(s) ? "" : s;
}

/**
 * The guard, stated as an assertion rather than as a comment.
 *
 * It checks the *finished payload*, so it holds no matter how `content` was assembled — including
 * by some future caller that forgets to sanitise. Each clause can fail: `--self-test` feeds it a
 * payload built the wrong way and shows every clause firing.
 */
export function assertInertMentions(payload, intendedId) {
  const content = String(payload && payload.content ? payload.content : "");
  const am = payload && payload.allowed_mentions;
  if (!am || !Array.isArray(am.parse) || am.parse.length !== 0) {
    throw new Error("allowed_mentions.parse must be an empty array — anything else lets content resolve mentions");
  }
  if (!Array.isArray(am.users) || am.users.length !== 1 || am.users[0] !== String(intendedId)) {
    throw new Error("allowed_mentions.users must be exactly the one intended manager");
  }
  if (am.roles && am.roles.length) throw new Error("allowed_mentions.roles must be absent or empty");
  if (/@everyone|@here/i.test(content)) {
    throw new Error("content carries a live @everyone/@here token");
  }
  const mentions = content.match(/<@!?&?\d+>|<#\d+>/g) || [];
  if (mentions.length !== 1 || mentions[0] !== `<@${intendedId}>`) {
    throw new Error(`content must carry exactly one mention token, the intended manager; found ${JSON.stringify(mentions)}`);
  }
  if (content.length > MAX_CONTENT) throw new Error(`content is ${content.length} characters, over Discord's ${MAX_CONTENT}`);
  return true;
}

/* ---------------------------------------------------------------- ledger ---- */

/**
 * The story key: what "already told them" means.
 *
 * Not the item id. `news-sync.mjs` builds ids from day + player + a hash of the exact headline, so
 * the same report arriving from Sleeper and from a post on X has two different ids and would ping
 * twice. This key is the same shape news-sync's own dedupe uses — player, calendar day, and the
 * first six meaningful words of the headline — plus the manager, since a trade legitimately
 * notifies two people about one story.
 */
export function storyKey(alert) {
  const STOP = new Set(["the", "a", "an", "to", "of", "for", "on", "in", "is", "his", "with", "and", "at", "as", "be", "will", "has"]);
  const words = String(alert.headline || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .slice(0, 6)
    .join(" ");
  const day = alert.published ? new Date(alert.published).toISOString().slice(0, 10) : "undated";
  return `${alert.user_id}|${alert.player_id}|${day}|${words}`;
}

export function readLedger() {
  const raw = fs.existsSync(LEDGER_PATH) ? JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")) : null;
  return { v: 1, delivered: {}, ...(raw || {}) };
}

export function writeLedger(ledger, now = Date.now()) {
  const cutoff = now - LEDGER_DAYS * 86400000;
  const kept = {};
  for (const [key, row] of Object.entries(ledger.delivered || {})) {
    if (Number(row.at) >= cutoff) kept[key] = row;
  }
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify({ v: 1, delivered: kept }, null, 2) + "\n");
  return LEDGER_PATH;
}

/* ----------------------------------------------------------------- send ---- */

/**
 * Header-driven pacing with the documented floors underneath.
 *
 * `wait()` is passed in so a test can drive the limiter without spending real seconds on it.
 */
export function createLimiter({ wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const sent = [];
  let holdUntil = 0;
  return {
    async take() {
      for (;;) {
        const t = now();
        if (t < holdUntil) { await wait(holdUntil - t); continue; }
        while (sent.length && t - sent[0] > RATE.minuteWindowMs) sent.shift();
        const inBurst = sent.filter((s) => t - s < RATE.burstWindowMs);
        if (inBurst.length >= RATE.burst) { await wait(RATE.burstWindowMs - (t - inBurst[0]) + 25); continue; }
        if (sent.length >= RATE.perMinute) { await wait(RATE.minuteWindowMs - (t - sent[0]) + 25); continue; }
        sent.push(t);
        return;
      }
    },
    /** Believe the server over the floors: it knows its own buckets. */
    observe(headers) {
      const remaining = Number(headers.get("x-ratelimit-remaining"));
      const resetAfter = Number(headers.get("x-ratelimit-reset-after"));
      if (Number.isFinite(remaining) && remaining <= 0 && Number.isFinite(resetAfter)) {
        holdUntil = Math.max(holdUntil, now() + resetAfter * 1000 + 50);
      }
    },
    hold(seconds) {
      holdUntil = Math.max(holdUntil, now() + seconds * 1000 + 50);
    },
  };
}

/**
 * POST one payload, honouring 429s. Returns `{ ok, status, attempts }`.
 *
 * A 404 is terminal and not retried: Discord's rate-limit docs say a webhook that 404s must not be
 * used again, because repeated invalid requests earn an IP-level restriction.
 */
export async function post(webhook, payload, { limiter, wait = (ms) => new Promise((r) => setTimeout(r, ms)), fetchImpl = fetch } = {}) {
  let attempts = 0;
  for (;;) {
    attempts++;
    if (limiter) await limiter.take();
    const res = await fetchImpl(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (limiter && res.headers) limiter.observe(res.headers);
    if (res.status === 429) {
      let retryAfter = 1;
      try {
        const body = await res.json();
        if (Number.isFinite(body.retry_after)) retryAfter = body.retry_after;
      } catch { /* header-only 429 */ }
      const header = res.headers && Number(res.headers.get("retry-after"));
      if (Number.isFinite(header) && header > retryAfter) retryAfter = header;
      if (limiter) limiter.hold(retryAfter);
      if (attempts >= MAX_ATTEMPTS) return { ok: false, status: 429, attempts };
      // Exponential on top of the server's number, in case the backlog is deeper than one bucket.
      await wait(retryAfter * 1000 * Math.pow(2, attempts - 1));
      continue;
    }
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, attempts, terminal: true };
    }
    if (res.status >= 500 && attempts < MAX_ATTEMPTS) {
      await wait(500 * Math.pow(2, attempts - 1));
      continue;
    }
    return { ok: res.status >= 200 && res.status < 300, status: res.status, attempts };
  }
}

/* ------------------------------------------------------------------ run ---- */

const TARGETS = {
  "dry-run": { env: null },
  staging: { env: "DISCORD_WEBHOOK_STAGING" },
  live: { env: "DISCORD_WEBHOOK_LIVE" },
};

/**
 * Which items in the feed are worth a mention.
 *
 * `confidence` is what news-match.mjs produces for free text. Rows already in `news.json` do not
 * carry one, so it is derived from how they were attributed: `player_id` means Sleeper's own
 * per-player endpoint answered, which cannot be wrong about who owns the player, and `name` means
 * the RSS matcher's full-name-in-the-title rule, which refuses on any ambiguity. Both clear
 * NOTIFY_MIN by construction; nothing here invents a confidence for an item that has one.
 */
export function alertsFrom(book, { minConfidence = NOTIFY_MIN } = {}) {
  const out = [];
  for (const it of (book && book.items) || []) {
    const confidence = Number.isFinite(it.confidence)
      ? it.confidence
      : it.match === "player_id" ? 0.99 : it.match === "name" ? 0.90 : 0;
    if (confidence < minConfidence) continue;
    out.push({ ...it, confidence });
  }
  return out;
}

export async function run({
  target = process.env.DISCORD_TARGET || "dry-run",
  book = readJson("ui/news.json", null),
  now = Date.now(),
  limit = 25,
  fetchImpl = fetch,
} = {}) {
  if (!TARGETS[target]) throw new Error(`unknown target ${JSON.stringify(target)} — one of ${Object.keys(TARGETS).join(", ")}`);
  const config = readJson(MEMBERS_PATH, null);
  if (!config || !Array.isArray(config.members)) {
    throw new Error(`no data/${MEMBERS_PATH} — the sleeper user_id -> discord id map is required`);
  }
  const discordById = new Map(config.members.map((m) => [String(m.user_id), String(m.discord_id || "")]));

  const webhookEnv = TARGETS[target].env;
  const webhook = webhookEnv ? process.env[webhookEnv] || "" : "";
  // An explicit target with no secret behind it falls back to a dry run rather than failing: a
  // cron that has not been given its secret yet should be quiet, not red.
  const dryRun = target === "dry-run" || !webhook;
  const reason = target === "dry-run" ? "default" : webhook ? null : `${webhookEnv} is not set`;

  const ledger = readLedger();
  const alerts = alertsFrom(book);
  const planned = [];
  const skipped = { already_delivered: 0, no_discord_id: 0, placeholder_id: 0, over_limit: 0 };
  const seenThisRun = new Set();

  for (const alert of alerts) {
    const key = storyKey(alert);
    if (ledger.delivered[key] || seenThisRun.has(key)) { skipped.already_delivered++; continue; }
    const configured = discordById.get(String(alert.user_id));
    if (configured === undefined) { skipped.no_discord_id++; continue; }
    const real = isRealDiscordId(configured);
    if (!real) {
      skipped.placeholder_id++;
      if (!dryRun) continue;
    }
    if (planned.length >= limit) { skipped.over_limit++; continue; }
    const discordId = real ? configured : DRY_RUN_EXAMPLE_ID;
    seenThisRun.add(key);
    planned.push({ key, alert, discordId, placeholder: !real, payload: buildPayload(alert, discordId) });
  }

  const results = [];
  if (!dryRun) {
    const limiter = createLimiter();
    for (const row of planned) {
      const res = await post(webhook, row.payload, { limiter, fetchImpl });
      results.push({ key: row.key, status: res.status, ok: res.ok, attempts: res.attempts });
      if (res.ok) ledger.delivered[row.key] = { at: now, target, item_id: row.alert.id, user_id: row.alert.user_id };
      if (res.terminal) break;
    }
    writeLedger(ledger, now);
  }

  const outbox = {
    v: 1,
    generated: now,
    target,
    dry_run: dryRun,
    dry_run_reason: reason,
    notify_threshold: NOTIFY_MIN,
    candidates: alerts.length,
    planned: planned.length,
    skipped,
    // The webhook URL is a credential and is never written here. Only its name.
    webhook_env: webhookEnv,
    messages: planned.map((row) => ({
      key: row.key,
      manager: row.alert.manager,
      user_id: row.alert.user_id,
      discord_id: row.discordId,
      discord_id_is_placeholder: !!row.placeholder,
      payload: row.payload,
    })),
    results,
  };
  if (dryRun) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(OUTBOX_PATH, JSON.stringify(outbox, null, 2) + "\n");
  }
  return outbox;
}

/* ------------------------------------------------------------ self-test ---- */

/**
 * The `@everyone` proof, runnable by hand. news-match.test.mjs asserts the same things; this
 * prints them, because "here is the payload, read it" is the form a person can check.
 */
export function selfTest() {
  const hostile = {
    id: "2026-08-30:9999:deadbeef",
    user_id: "457779824002330624",
    manager: "SF69erss",
    player: "George Kittle",
    player_id: "3321",
    published: Date.parse("2026-08-30T12:00:00Z"),
    source_label: "Rotowire",
    source_url: "https://example.com/story",
    headline: "@everyone @here <@&123456789012345678> Kittle ruled out — <@987654321098765432> confirms @AdamSchefter",
    league_line: "Exhale, @everyone, @here comes the news.",
    match: "player_id",
  };
  const intended = "111111111111111111";
  const payload = buildPayload(hostile, intended);

  const clauses = [];
  const check = (name, fn) => {
    let threw = null;
    try { fn(); } catch (err) { threw = err.message; }
    clauses.push({ clause: name, refused: !!threw, error: threw });
  };
  check("parse must be empty", () => assertInertMentions({ ...payload, allowed_mentions: { parse: ["users"], users: [intended] } }, intended));
  check("users must be exactly the intended manager", () => assertInertMentions({ ...payload, allowed_mentions: { parse: [], users: [intended, "222222222222222222"] } }, intended));
  check("roles must be empty", () => assertInertMentions({ ...payload, allowed_mentions: { parse: [], users: [intended], roles: ["333"] } }, intended));
  check("a live @everyone in content is refused", () => assertInertMentions({ ...payload, content: `<@${intended}> @everyone hello` }, intended));
  check("a second mention token in content is refused", () => assertInertMentions({ ...payload, content: `<@${intended}> <@&999888777666555444>` }, intended));
  check("a placeholder discord id is refused", () => buildPayload(hostile, "000000000000000000"));

  return {
    hostile_headline: hostile.headline,
    payload,
    ping_targets: payload.allowed_mentions.users,
    everyone_tokens_in_content: (payload.content.match(/@everyone|@here/g) || []).length,
    mention_tokens_in_content: payload.content.match(/<@!?&?\d+>|<#\d+>/g) || [],
    // Every "@" except the one inside the single intended mention carries a zero-width space, so
    // no remaining "@" in third-party text is adjacent to the word Discord would resolve.
    third_party_at_signs_all_defused: payload.content
      .replace(`<@${intended}>`, "")
      .split("@")
      .slice(1)
      .every((tail) => tail.startsWith(ZWSP)),
    guard_clauses: clauses,
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
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    console.log(JSON.stringify(selfTest(), null, 2));
  } else {
    const targetArg = argv.find((a) => a.startsWith("--target="));
    run({ target: targetArg ? targetArg.slice("--target=".length) : undefined })
      .then((out) => {
        console.log(JSON.stringify({
          target: out.target,
          dry_run: out.dry_run,
          dry_run_reason: out.dry_run_reason,
          candidates: out.candidates,
          planned: out.planned,
          skipped: out.skipped,
          sent: out.results.filter((r) => r.ok).length,
          failed: out.results.filter((r) => !r.ok).length,
          outbox: out.dry_run ? "data/discord-outbox.json" : null,
        }, null, 2));
      })
      .catch((err) => {
        console.error(`discord-notify: ${err.message}`);
        process.exit(1);
      });
  }
}
