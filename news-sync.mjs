#!/usr/bin/env node
/**
 * Build data/ui/news.json: NFL news, filtered to players this league actually rosters, addressed
 * to the manager who owns them, in the league's voice.
 *
 * Read-only against every source. Writes exactly one file. It does not touch the value book, the
 * Value Adjustment, the lens windows, `today_delta`, partner grades or any ranking — news is a
 * separate payload with a separate loader, on purpose.
 *
 *   node news-sync.mjs                 # fetch live, write data/ui/news.json
 *   node news-sync.mjs --report        # fetch live, print the match report, write nothing
 *   node news-sync.mjs --voice         # print every voice variant, fetch nothing
 *   node news-sync.mjs --empty         # write a valid empty file (no network)
 *
 * ## Rosters and the mapping
 *
 * `data/rosters_now.json` and `data/ui/members.json` already exist: sleeper-sync.mjs writes the
 * first from `/v1/league/<id>/rosters` and the second from `/users`. Nothing here re-syncs them.
 * If they are missing, run `node sleeper-sync.mjs` — this script is a consumer, not a second sync.
 *
 * ## The two source paths, and why one is much safer than the other
 *
 * **Path A — Sleeper's GraphQL `get_player_news`, keyed by player_id.** We ask about a specific
 * rostered player and get that player's news back. The owner is known before the text is read,
 * so attribution cannot be wrong. This is the primary path.
 *
 * **Path B — RSS.** A headline is prose; which player it is about has to be inferred from the
 * words. That inference is the most dangerous thing in this feature, because a wrong match tells
 * the wrong manager their running back tore an ACL. matchPlayer() below is therefore built to
 * *refuse* rather than to guess, and every refusal is counted in the report.
 */
import fs from "node:fs";
import { DATA, readJson } from "./lib.mjs";
import { CATEGORIES, classify, leagueLine, voiceSamples } from "./news-voice.mjs";
import {
  RSS_FEEDS,
  fetchRss,
  fetchSleeperPlayerNews,
  fetchSubmissions,
  fetchTrending,
  fetchTweet,
  markSubmissionProcessed,
  parseTweetUrl,
} from "./news-sources.mjs";
import { SKILL_POS, nameCandidateScore } from "./price-today.mjs";

/** Bump when the shape of news.json changes. The UI refuses a version it does not know. */
const SCHEMA_VERSION = 1;
/** Rows kept in the shipped file. The feed is a scroll box, not an archive. */
const MAX_ITEMS = 60;
/** Nothing older than this is news. */
const MAX_AGE_DAYS = 10;
/**
 * Summaries are trimmed to this before they ship. RotoBaller's `analysis` runs to full
 * paragraphs, and the feed row shows two lines of it, so the untrimmed field was most of a
 * 70KB payload for text no one would read on a phone.
 */
const MAX_SUMMARY = 240;

/** Trim to a word boundary and mark it, so a cut sentence does not read as a source's own. */
function clip(s, n = MAX_SUMMARY) {
  const text = String(s == null ? "" : s).trim();
  if (text.length <= n) return text;
  const cut = text.slice(0, n);
  const space = cut.lastIndexOf(" ");
  return (space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "") + "\u2026";
}

const args = new Set(process.argv.slice(2));

/* ------------------------------------------------------------- rosters ---- */

/**
 * player_id -> { user_id, manager } for every player on a current roster, plus the reverse
 * index the RSS matcher needs.
 *
 * A player on two rosters is impossible in Sleeper, so a collision here means the roster file
 * is stale rather than that a choice has to be made. It is counted and the first owner wins.
 */
function buildOwnership() {
  const rosters = readJson("rosters_now.json", []) || [];
  const members = readJson("ui/members.json", []) || [];
  const nameById = new Map(members.map((m) => [m.user_id, m.name]));
  const owner = new Map();
  let dupes = 0;
  for (const r of rosters) {
    const uid = r.owner_id;
    if (!uid) continue;
    for (const pid of r.players || []) {
      if (owner.has(String(pid))) { dupes++; continue; }
      owner.set(String(pid), {
        user_id: uid,
        manager: nameById.get(uid) || uid,
        roster_id: r.roster_id,
      });
    }
  }
  return { owner, dupes, rosters: rosters.length, managers: nameById.size };
}

/** Normalise a name for comparison: lower case, no punctuation, no suffix, single spaces. */
function normName(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The rostered players, with the names and aliases the RSS matcher will look for.
 *
 * Only rostered players are indexed. That is not an optimisation — it is what makes the matcher
 * tolerable at all. There are 12,225 players in Sleeper's dictionary and roughly 330 in this
 * league, so restricting the search space removes almost every name collision before it can
 * happen. The famous one is real: "Josh Allen" is both the Bills quarterback and an inactive
 * offensive guard, and the dictionary has both.
 */
function buildPlayerIndex(owner, players) {
  const byName = new Map();
  const rows = [];
  for (const pid of owner.keys()) {
    const p = players[pid];
    if (!p) continue;
    const full = p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
    if (!full) continue;
    const row = {
      player_id: pid,
      name: full,
      team: p.team || null,
      position: p.position || (p.fantasy_positions || [])[0] || null,
      // The dictionary entry itself, for nameCandidateScore() in matchTweetPlayer(): it reads
      // `active` and the raw `team`, which the flattened fields above do not carry.
      raw: p,
      keys: new Set([normName(full)]),
    };
    // Sleeper's own search key, which already drops punctuation and suffixes.
    if (p.search_full_name) row.keys.add(normName(p.search_full_name));
    rows.push(row);
    for (const k of row.keys) {
      if (!k || k.split(" ").length < 2) continue; // never index a bare surname
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(row);
    }
  }
  return { byName, rows };
}

/**
 * Which rostered player, if any, this headline is about. Returns null far more often than not,
 * and that is the design.
 *
 * Two rules, both learned from wrong answers this matcher actually gave:
 *
 * **1. A full name, never a surname.** "First Last" with suffixes and punctuation removed, on
 * word boundaries. "Jones", "Smith" and "Williams" appear in dozens of unrelated NFL headlines a
 * day. It costs real matches — ESPN's "Colts WR Allen arrested on drunk driving charges" names
 * the player by surname only and is therefore dropped — and that is the right trade.
 *
 * **2. The title only. Never the summary.** The first version searched title *and* summary and
 * attributed Rotowire's "Jalon Daniels: Wins backup QB job" to **Baker Mayfield**, because the
 * summary mentions Mayfield as the starter Daniels is backing up. That is precisely the failure
 * that matters — a manager told a story about a player who is not the subject. A news item's
 * subject is named in its title; a summary names teammates, coaches and the reporter who broke
 * it. So attribution reads the title, and the summary is used only to *classify* an item whose
 * player is already known.
 *
 * **Two rostered players in one title means the item is dropped, not resolved.** There is no
 * tie-break better than silence: "Raiders expected to name Kirk Cousins Week 1 starter over No. 1
 * pick Fernando Mendoza" is genuinely about two owned players, and picking one would be a guess.
 */
function matchPlayer(title, index) {
  const hay = ` ${normName(title)} `;
  const hits = new Map();
  for (const [key, rows] of index.byName) {
    if (!hay.includes(` ${key} `)) continue;
    for (const row of rows) hits.set(row.player_id, row);
  }
  if (hits.size === 0) return { row: null, reason: "no_player" };
  if (hits.size > 1) return { row: null, reason: "ambiguous", candidates: [...hits.values()] };
  return { row: [...hits.values()][0], reason: "matched" };
}

/* --------------------------------------------------- shared tweets (X) ---- */

/**
 * A manager display name, as typed into an iOS Shortcut, to a Sleeper `user_id`.
 *
 * `target_name` carries a NAME rather than a `user_id` — the inversion of the rule the rest of
 * this repo follows, argued in db/schema.sql section 5 — because the writer is a phone share
 * sheet and nobody is picking an 18-digit snowflake out of a list on a phone. The cost of that
 * choice is paid here, and it is paid loudly: a name that matches nothing resolves to null and
 * the item publishes addressed to nobody, rather than being quietly handed to the nearest match.
 *
 * Matching is deliberately forgiving about case and punctuation only. It will not accept a
 * prefix or a nickname, because "Bubba" matching `BubbaCuckShremp` today is "Josh" matching the
 * wrong Allen tomorrow, and the whole point of a curated submission is that its attribution is
 * certain.
 */
function resolveTarget(targetName, members) {
  const want = normName(targetName);
  if (!want) return null;
  const hit = (members || []).find((m) => normName(m.name) === want);
  return hit ? { user_id: hit.user_id, manager: hit.name } : null;
}

/**
 * Which rostered player a shared tweet is about, when the sharer did not say.
 *
 * Runs the **existing** matcher over the tweet's text. That is a change of input for
 * matchPlayer(), which is documented as reading a title and never a summary, so it is worth
 * saying why it is sound here: the reason summaries are banned is that a summary names
 * teammates, coaches and the reporter alongside its actual subject, so a match inside one is
 * probably not the story's subject. A tweet is not a summary — it is one short post, usually one
 * or two sentences, and a rostered player named in it is overwhelmingly what it is about. The
 * refusal rules still apply unchanged: full names only, never a surname, and two different
 * rostered players means no match rather than a guess.
 *
 * The one case this resolves that matchPlayer() will not is a **namesake collision**: two
 * genuinely different rostered players whose names normalise to the same string. `normName()`
 * strips suffixes, so "Michael Carter" and "Michael Carter II" collapse together, and the
 * matcher sees two candidates for what is textually one name and refuses. Refusing there is
 * over-cautious — the text named one name, not two people — so the collision-aware scoring from
 * price-today.mjs breaks that specific tie the same way the value book does: prefer the skill
 * position, then a live NFL team, then an active player. This is the P1-13 lesson applied to
 * attribution rather than to pricing.
 *
 * Two candidates with *different* names are still refused, because that is a tweet about two
 * people and there is no non-guess available.
 */
function matchTweetPlayer(text, index) {
  const hit = matchPlayer(text, index);
  if (hit.row || hit.reason !== "ambiguous") return hit;
  const names = new Set((hit.candidates || []).map((c) => normName(c.name)));
  if (names.size !== 1) return hit;
  const ranked = [...hit.candidates].sort((a, b) => {
    const d = nameCandidateScore(b.raw) - nameCandidateScore(a.raw);
    if (d) return d;
    return Number(b.player_id) - Number(a.player_id);
  });
  // Only when the scoring actually separates them. A tie means the helpers had no opinion, and
  // an arbitrary pick is exactly the guess this file refuses to make.
  const top = nameCandidateScore(ranked[0].raw);
  if (ranked.length > 1 && nameCandidateScore(ranked[1].raw) === top) return hit;
  return { row: ranked[0], reason: "matched_collision" };
}

/**
 * The submission queue, turned into feed rows.
 *
 * One row per submission that resolves. Every failure is recorded rather than thrown: a tweet
 * that has been deleted, a Supabase that is asleep and a URL somebody hand-edited must each cost
 * their own row and leave the 60 automated items untouched.
 *
 * A submission is stamped `processed_at` **only after** its row has been built, and a row is
 * built for every outcome that is not "we could not read the tweet". The distinction matters:
 * a deleted tweet is stamped, because retrying it forever would mean fetching a 404 on every
 * build until the heat death of the league; a network failure is *not* stamped, because that is
 * a transient we want to retry on the next run.
 */
async function ingestSubmissions(ownership, index, members, { stampRows = true } = {}) {
  const report = {
    queue_ok: false, queue_error: null, seen: 0, published: 0,
    targeted: 0, matched: 0, unaddressed: 0, failed: 0, stamped: 0, stamp_errors: 0,
    failures: [],
  };
  const queue = await fetchSubmissions();
  report.queue_ok = queue.ok;
  report.queue_error = queue.error;
  if (!queue.ok) return { rows: [], report };
  report.seen = queue.rows.length;

  const rows = [];
  for (const sub of queue.rows) {
    // Re-validated here even though the table constrains it, because the table is write-open to
    // anyone holding the anon key and a check that runs in only one place is a check that can be
    // walked around. `parseTweetUrl` also canonicalises, so what gets fetched and what gets
    // rendered is rebuilt from the captured handle and id rather than passed through.
    const parsed = parseTweetUrl(sub.url);
    if (!parsed) {
      report.failed++;
      report.failures.push({ id: sub.id, reason: "bad_url" });
      // Stamped: a URL this shape can never become valid, so retrying it is pure waste.
      await stamp(sub.id, report, stampRows);
      continue;
    }
    const tweet = await fetchTweet(parsed.canonical);
    if (!tweet.ok) {
      report.failed++;
      report.failures.push({ id: sub.id, reason: tweet.reason, status: tweet.status });
      // A deleted or protected tweet is permanent; a timeout or a network blip is not.
      if (tweet.reason === "not_found" || tweet.reason === "no_tweet_text" || tweet.reason === "bad_url") {
        await stamp(sub.id, report, stampRows);
      }
      continue;
    }

    // Attribution, in priority order. A named target is authoritative and ends the question —
    // that is the entire point of a person curating the item instead of a matcher inferring it.
    let own = null;
    let player = null;
    const target = resolveTarget(sub.target_name, members);
    if (target) {
      own = target;
      report.targeted++;
      // A player name in the text is still worth having for the row's metadata and for dedupe,
      // but it cannot override the human's choice of who this is aimed at.
      const hit = matchTweetPlayer(tweet.text, index);
      if (hit.row) player = hit.row;
    } else {
      const hit = matchTweetPlayer(tweet.text, index);
      if (hit.row) {
        const owner = ownership.owner.get(hit.row.player_id);
        if (owner) {
          own = owner;
          player = hit.row;
          report.matched++;
        }
      }
    }
    if (!own) report.unaddressed++;

    rows.push(toTweetRow(sub, tweet, own, player));
    report.published++;
    await stamp(sub.id, report, stampRows);
  }
  return { rows, report };
}

/**
 * Mark one submission published.
 *
 * `--report` documents itself as writing nothing, and stamping a row is a write — a loud one,
 * because a stamped submission is never ingested again. Running `--report` to preview the queue
 * would have silently consumed it, so every caller passes the flag through and this is the one
 * place that decides.
 */
async function stamp(id, report, stampRows = true) {
  if (!stampRows) { report.stamp_skipped = (report.stamp_skipped || 0) + 1; return true; }
  const res = await markSubmissionProcessed(id);
  if (res.ok) { report.stamped++; return true; }
  report.stamp_errors++;
  report.failures.push({ id, reason: `stamp_failed:${res.error}` });
  // Warned once per run, on stderr, rather than left as a number in a report nobody reads. A
  // queue that never drains is not visibly broken from the feed -- the rows look right -- so
  // this is the only place it can announce itself. The item still publishes: it is a real
  // submission and news.json is rebuilt each run, so nothing is duplicated by shipping it.
  if (!report.stamp_warned) {
    report.stamp_warned = true;
    console.error(`WARNING: could not mark submission ${id} processed: ${res.error}`);
  }
  return false;
}

/**
 * One submission to one feed row, in the same schema every other item uses.
 *
 * The row carries three fields no automated item has — `tweet_text`, `tweet_author` and
 * `tweet_handle` — and they are the only place third-party prose reaches the expandable detail.
 * They are stored as plain text (news-sources.mjs strips the oEmbed HTML rather than trusting
 * it) and escaped again at render.
 *
 * `user_id` is `""` rather than null on an unaddressed row. main()'s self-check refuses any row
 * whose `user_id` is not a known member, and "" is checked for explicitly there — a null would
 * have to be special-cased in the same place, and "" keeps every id in this file a string.
 */
function toTweetRow(sub, tweet, own, player) {
  const id = `tweet:${sub.id}`;
  const note = String(sub.note == null ? "" : sub.note);
  const item = {
    id,
    player: player ? player.name : "",
    category: "tweet",
    upbeat: false,
    title: tweet.text,
    note,
  };
  return {
    id,
    published: Date.parse(sub.created_at) || Date.now(),
    source: "x:submission",
    source_label: `@${tweet.author_handle}`,
    source_url: tweet.url,
    player: player ? player.name : "",
    player_id: player ? player.player_id : "",
    player_team: player ? player.team : null,
    player_position: player ? player.position : null,
    user_id: own ? own.user_id : "",
    manager: own ? own.manager : "",
    category: "tweet",
    severity: 4,
    upbeat: false,
    // A shared tweet's headline is the tweet, and the expander below it shows the same text in
    // full. Leaving `headline` empty keeps the collapsed row to the summary line, which is what
    // the feature asked for: a jab on top, the detail behind a control.
    headline: "",
    summary: "",
    league_line: leagueLine(item, { manager: own ? own.manager : "" }),
    trending_add: 0,
    match: own ? (sub.target_name ? "target_name" : "name") : "none",
    also: [],
    // The expandable detail. Present only on this path; renderNews() treats their absence as
    // "this is an ordinary news row" and renders no expander at all.
    tweet_text: tweet.text,
    tweet_author: tweet.author_name,
    tweet_handle: tweet.author_handle,
    submitted_by: String(sub.submitted_by == null ? "" : sub.submitted_by),
    // What the tweet is *about*, as distinct from `category`, which is always "tweet" on this
    // path. Used only by dedupeAgainstTweets() to decide whether an automated row is the same
    // story; it never picks a voice line and it is not shown. Not shipped in news.json — the UI
    // has no use for it — see bookOf().
    tweet_topic: classify(tweet.text).category,
  };
}

/**
 * Drop a shared tweet that restates an automated item already in the feed.
 *
 * A Schefter tweet and the Rotowire write-up of it are one story, and the feed showing both
 * reads as a stutter. Same player and same category inside a few hours is the test — the same
 * reasoning dedupe() uses for three outlets carrying one report, with a window instead of a
 * calendar day because a share arrives whenever somebody happened to see it.
 *
 * "Same category" cannot mean the row's own `category`, which is always "tweet" here and would
 * therefore never equal an automated row's. It means what the tweet is *about*: `tweet_topic`,
 * from running the same classify() over the tweet's text. Matching on the player alone was the
 * first version and it was too broad — a shared trade rumour would have swallowed an unrelated
 * injury note about the same player from the same afternoon, which is two stories, not one.
 *
 * **The submission wins and the automated row is dropped**, which is the opposite of dedupe()'s
 * earliest-published rule and is deliberate: a person chose this one, it carries their jab, and
 * it has the tweet itself behind the expander. An unattributed share is never deduped against
 * anything, because with no player it has no story to be the same as.
 */
const TWEET_DEDUPE_WINDOW_MS = 6 * 3600 * 1000;

function dedupeAgainstTweets(rows, tweetRows) {
  const keys = tweetRows
    .filter((t) => t.player_id)
    .map((t) => ({ player_id: t.player_id, topic: t.tweet_topic, at: t.published || 0 }));
  if (!keys.length) return { kept: rows, dropped: 0 };
  let dropped = 0;
  const kept = rows.filter((r) => {
    const clash = keys.some((k) =>
      k.player_id === r.player_id
      && k.topic === r.category
      && Math.abs((r.published || 0) - k.at) <= TWEET_DEDUPE_WINDOW_MS);
    if (clash) dropped++;
    return !clash;
  });
  return { kept, dropped };
}

/* ------------------------------------------------------------ assembly ---- */

/** A stable id for one story, so re-runs do not churn the file and dedupe has a key. */
function itemId(playerId, title, published) {
  let h = 0x811c9dc5;
  const s = `${playerId}|${normName(title)}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const day = published ? new Date(published).toISOString().slice(0, 10) : "undated";
  return `${day}:${playerId}:${h.toString(16).padStart(8, "0")}`;
}

/**
 * Collapse the same story arriving from several sources.
 *
 * The same Schefter report is restated by Rotowire, RotoBaller and FantasyPros within minutes,
 * so without this the feed reads as three identical rows. The key is the player plus the first
 * six meaningful words of the headline plus the calendar day — tight enough that two genuinely
 * different stories about one player on one day both survive, loose enough that the same story
 * retitled by three outlets collapses to one. The kept row is the earliest published, and the
 * outlets that also carried it are recorded in `also` so the row can say "and 2 more".
 */
function dedupe(items) {
  const STOP = new Set(["the", "a", "an", "to", "of", "for", "on", "in", "is", "his", "with", "and", "at", "as", "be", "will", "has"]);
  const groups = new Map();
  for (const it of items) {
    const words = normName(it.title).split(" ").filter((w) => w && !STOP.has(w)).slice(0, 6);
    const key = `${it.player_id}|${it.published ? new Date(it.published).toISOString().slice(0, 10) : "x"}|${words.join(" ")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const out = [];
  for (const group of groups.values()) {
    group.sort((a, b) => (a.published || 0) - (b.published || 0));
    const keep = { ...group[0] };
    keep.also = [...new Set(group.slice(1).map((g) => g.source_label).filter(Boolean))];
    out.push(keep);
  }
  return out;
}

function toRow(raw, own, player, trending) {
  // The title, not the title plus the summary — see classify()'s note on why.
  const kind = classify(raw.title);
  const id = itemId(player.player_id, raw.title, raw.published);
  const item = {
    id,
    player: player.name,
    player_id: player.player_id,
    team: player.team,
    position: player.position,
    category: kind.category,
    upbeat: kind.upbeat,
    title: raw.title,
  };
  return {
    id,
    published: raw.published,
    source: raw.source,
    source_label: raw.source_label || raw.source,
    source_url: raw.source_url || "",
    player: player.name,
    player_id: player.player_id,
    player_team: player.team,
    player_position: player.position,
    user_id: own.user_id,
    manager: own.manager,
    category: kind.category,
    severity: kind.severity,
    upbeat: kind.upbeat,
    headline: clip(raw.title, 180),
    summary: clip(raw.summary),
    league_line: leagueLine(item, { manager: own.manager }),
    trending_add: trending.add.get(player.player_id) || 0,
    match: raw.player_id ? "player_id" : "name",
    also: raw.also || [],
  };
}

async function build() {
  const ownership = buildOwnership();
  if (!ownership.owner.size) {
    throw new Error("no current rosters — run `node sleeper-sync.mjs` first");
  }
  const playersPath = `${DATA}/players.nfl.json`;
  if (!fs.existsSync(playersPath)) {
    throw new Error("data/players.nfl.json missing — run `node sleeper-sync.mjs` first");
  }
  const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));
  const index = buildPlayerIndex(ownership.owner, players);

  const trending = await fetchTrending();
  const sleeper = await fetchSleeperPlayerNews([...ownership.owner.keys()]);
  const rssResults = await fetchRss();

  const report = {
    rosters: ownership.rosters,
    managers: ownership.managers,
    rostered_players: ownership.owner.size,
    indexed_players: index.rows.length,
    duplicate_roster_entries: ownership.dupes,
    sleeper_graphql: { items: sleeper.items.length, errors: sleeper.errors.length },
    trending: { add: trending.add.size, drop: trending.drop.size, errors: trending.errors },
    feeds: rssResults.map((r) => ({ id: r.feed.id, ok: r.ok, items: r.items.length, error: r.error })),
    rss: { total: 0, matched: 0, no_player: 0, ambiguous: 0, stale: 0, ambiguous_examples: [], matched_examples: [] },
  };

  const rows = [];
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;

  // Path A: player-keyed. The owner is known before the text is read.
  for (const raw of sleeper.items) {
    if (raw.published && raw.published < cutoff) continue;
    const own = ownership.owner.get(String(raw.player_id));
    const p = index.rows.find((r) => r.player_id === String(raw.player_id));
    if (!own || !p) continue;
    rows.push(toRow(raw, own, p, trending));
  }

  // Path B: RSS, name-matched, refusing on ambiguity.
  for (const result of rssResults) {
    for (const raw of result.items) {
      report.rss.total++;
      if (raw.published && raw.published < cutoff) { report.rss.stale++; continue; }
      const hit = matchPlayer(raw.title, index);
      if (hit.reason === "ambiguous") {
        report.rss.ambiguous++;
        if (report.rss.ambiguous_examples.length < 5) {
          report.rss.ambiguous_examples.push({
            title: raw.title.slice(0, 110),
            candidates: hit.candidates.map((c) => `${c.name} (${c.position || "?"})`),
          });
        }
        continue;
      }
      if (!hit.row) { report.rss.no_player++; continue; }
      const own = ownership.owner.get(hit.row.player_id);
      if (!own) { report.rss.no_player++; continue; }
      report.rss.matched++;
      if (report.rss.matched_examples.length < 8) {
        report.rss.matched_examples.push({
          feed: result.feed.id,
          player: hit.row.name,
          manager: own.manager,
          title: raw.title.slice(0, 110),
        });
      }
      rows.push(toRow(raw, own, hit.row, trending));
    }
  }

  // Shared tweets, last, because they get to displace an automated row rather than compete with
  // one. A queue that is unreachable costs its own rows and nothing else — every failure inside
  // ingestSubmissions() is recorded and returned, never thrown.
  const members = readJson("ui/members.json", []) || [];
  const submissions = args.has("--no-submissions")
    ? { rows: [], report: { queue_ok: false, queue_error: "skipped by --no-submissions", seen: 0, published: 0, targeted: 0, matched: 0, unaddressed: 0, failed: 0, stamped: 0, stamp_errors: 0, failures: [] } }
    : await ingestSubmissions(ownership, index, members, { stampRows: !args.has("--report") });
  report.submissions = submissions.report;

  const deduped = dedupe(rows);
  const against = dedupeAgainstTweets(deduped, submissions.rows);
  report.submissions.displaced_automated = against.dropped;
  const merged = [...against.kept, ...submissions.rows]
    .sort((a, b) => {
      const at = a.published || 0;
      const bt = b.published || 0;
      if (at !== bt) return bt - at;
      return (b.severity || 0) - (a.severity || 0);
    })
    .slice(0, MAX_ITEMS);

  report.rows_matched_total = rows.length;
  report.rows_after_dedupe = deduped.length;
  report.rows_shipped = merged.length;
  report.by_manager = {};
  // A shared tweet that matched nobody is addressed to nobody, so it belongs under no manager
  // rather than under an empty-string one that would read as an eleventh member.
  for (const r of merged) {
    const key = r.manager || "(unaddressed)";
    report.by_manager[key] = (report.by_manager[key] || 0) + 1;
  }
  report.by_category = {};
  for (const r of merged) report.by_category[r.category] = (report.by_category[r.category] || 0) + 1;

  return { book: bookOf(merged, rssResults, sleeper), report };
}

/**
 * data/ui/news.json.
 *
 * ## Schema, v1
 *
 * ```
 * {
 *   "v": 1,                     // SCHEMA_VERSION. The UI ignores a file whose v it does not know.
 *   "generated": 1756569600000, // epoch ms this file was built
 *   "sources": [                // which feeds answered on this run, for the footer and for triage
 *     { "id": "espn", "label": "ESPN", "ok": true, "items": 18 }
 *   ],
 *   "items": [{
 *     "id":              "2026-08-30:4046:1a2b3c4d",  // stable: day + player + headline hash
 *     "published":       1756569600000 | null,         // epoch ms, null when the source's date was unparseable
 *     "source":          "sleeper:rotowire",           // feed id, or "sleeper:<aggregated source>"
 *     "source_label":    "Rotowire",                   // what the UI prints
 *     "source_url":      "https://…",                  // "" when the source gave no usable link
 *     "player":          "Patrick Mahomes",
 *     "player_id":       "4046",                       // Sleeper player_id
 *     "player_team":     "KC" | null,
 *     "player_position": "QB" | null,
 *     "user_id":         "457779824002330624",         // the affected manager, Sleeper user_id
 *     "manager":         "SF69erss",                   // their canonical name from members.json
 *     "category":        "injury",                     // injury|suspension|trade|depth_chart|breakout|news
 *     "severity":        5,                            // sort weight only — never a colour
 *     "upbeat":          false,                         // the story is good news for the owner
 *     "headline":        "…",                           // the source's own words, third-party text
 *     "summary":         "…",                           // the source's own words, or ""
 *     "league_line":     "…",                           // news-voice.mjs output — the replaceable part
 *     "trending_add":    167184,                        // Sleeper adds in 24h, 0 if not trending
 *     "match":           "player_id" | "name",          // how the player was attributed
 *     "also":            ["RotoBaller"]                 // other outlets that carried the same story
 *   }]
 * }
 * ```
 *
 * Every string field is third-party input except `league_line`, `category` and `match`. The UI
 * escapes all of them anyway.
 *
 * ## Shared tweets — four extra fields, and why `v` stays 1
 *
 * An item that came in through the submission queue carries `category: "tweet"` and four fields
 * no automated item has:
 *
 * ```
 *     "tweet_text":   "…",              // the tweet, as PLAIN TEXT — the oEmbed HTML is stripped,
 *                                       //   never forwarded. Third-party prose; escaped at render.
 *     "tweet_author": "Adam Schefter",  // the posting account's display name
 *     "tweet_handle": "AdamSchefter",   // the @, without the @
 *     "submitted_by": "BubbaCuckShremp" // who shared it in, "" when they did not say.
 *                                       //   Client-asserted and unverifiable — see db/schema.sql.
 * ```
 *
 * On such an item `user_id` and `manager` may both be `""`, meaning nobody was attributed:
 * curation is the point, so an unmatched share still publishes and is simply addressed to no
 * one. `headline` and `summary` are `""` — the tweet is the content, and it lives behind the
 * expander rather than in the collapsed row.
 *
 * **`v` stays 1 deliberately.** These fields are purely additive and every one of them is
 * optional, so a page built before they existed ignores them and renders these rows as ordinary
 * news rows with no expander. Bumping to 2 would make the *current* deployed page reject the
 * whole file on its version gate and drop all 60 items to add a feature to a handful — a
 * strictly worse failure than the one it would be protecting against. The version gate is for
 * changes that would make an old reader render something *wrong*, and there is no such change
 * here.
 *
 * `tweet_topic` exists on the row inside the pipeline and is **not** shipped: it only feeds
 * dedupeAgainstTweets(), and the UI has no use for it.
 */
function bookOf(items, rssResults, sleeper) {
  const sources = [
    {
      id: "sleeper:graphql",
      label: "Sleeper",
      ok: sleeper ? sleeper.ok : false,
      items: sleeper ? sleeper.items.length : 0,
    },
    ...(rssResults || []).map((r) => ({
      id: r.feed.id, label: r.feed.label, ok: r.ok, items: r.items.length,
    })),
  ];
  if (items.some((it) => it.category === "tweet")) {
    sources.push({ id: "x:submission", label: "Shared from X", ok: true,
      items: items.filter((it) => it.category === "tweet").length });
  }
  // `tweet_topic` is pipeline-internal — see the schema note above. Stripped here rather than
  // never being set, because dedupeAgainstTweets() runs after the rows are built.
  const shipped = items.map(({ tweet_topic, ...rest }) => rest);
  return { v: SCHEMA_VERSION, generated: Date.now(), sources, items: shipped };
}

function writeBook(book) {
  const path = `${DATA}/ui/news.json`;
  fs.mkdirSync(`${DATA}/ui`, { recursive: true });
  fs.writeFileSync(path, JSON.stringify(book) + "\n");
  return path;
}

/* ---------------------------------------------------------------- main ---- */

async function main() {
  if (args.has("--voice")) {
    for (const s of voiceSamples("BubbaCuckShremp", "Patrick Mahomes", "KC")) {
      console.log(`[${s.category}] ${s.line}`);
    }
    return;
  }
  if (args.has("--empty")) {
    const book = bookOf([], RSS_FEEDS.map((f) => ({ feed: f, ok: false, items: 0 })), null);
    console.log("wrote", writeBook(book), "— empty, no network");
    return;
  }

  const { book, report } = await build();

  // A row addressed to a manager who is not in this league is the failure that matters most:
  // it means the ownership map and the members file disagree, and the feed would be lying about
  // who owns whom. Refuse to write rather than ship it.
  const known = new Set((readJson("ui/members.json", []) || []).map((m) => m.user_id));
  for (const it of book.items) {
    // "" is the deliberate unaddressed case, and only a shared tweet may use it: an automated
    // row always knows its owner, because it was matched from a roster in the first place. Any
    // other empty user_id is the ownership map and the members file disagreeing.
    const unaddressed = it.user_id === "" && it.category === "tweet";
    if (!unaddressed && !known.has(it.user_id)) {
      throw new Error(`self-check failed: item ${it.id} is addressed to unknown user ${it.user_id}`);
    }
    if (unaddressed && it.manager !== "") {
      throw new Error(`self-check failed: item ${it.id} names a manager but is addressed to nobody`);
    }
    if (!it.league_line) {
      throw new Error(`self-check failed: item ${it.id} has no league line`);
    }
    if (!CATEGORIES.some((c) => c.id === it.category)) {
      throw new Error(`self-check failed: item ${it.id} has unknown category ${it.category}`);
    }
    // The expandable detail is third-party prose. It must arrive as text, never as markup —
    // news-sources.mjs strips the oEmbed HTML rather than trusting it, and this is the assertion
    // that the stripping actually ran before anything was written to disk.
    if (it.category === "tweet") {
      if (!it.tweet_text || !it.tweet_handle) {
        throw new Error(`self-check failed: shared tweet ${it.id} has no text or no handle`);
      }
      if (!parseTweetUrl(it.source_url)) {
        throw new Error(`self-check failed: shared tweet ${it.id} has a non-tweet source_url ${it.source_url}`);
      }
    }
  }

  if (args.has("--report")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  writeBook(book);
  console.log(JSON.stringify({
    out: "data/ui/news.json",
    items: book.items.length,
    managers_addressed: Object.keys(report.by_manager).length,
    by_category: report.by_category,
    rss_matched: report.rss.matched,
    rss_total: report.rss.total,
    rss_ambiguous: report.rss.ambiguous,
    sleeper_items: report.sleeper_graphql.items,
    feeds_ok: report.feeds.filter((f) => f.ok).length + "/" + report.feeds.length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
