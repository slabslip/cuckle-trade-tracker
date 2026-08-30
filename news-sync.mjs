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
 *   node news-sync.mjs --with-automated  # turn the automated sources back on for this run
 *   node news-sync.mjs --corpus        # fetch RSS live, write data/fixtures/rss-corpus.json
 *
 * ## The feed is manual submissions only
 *
 * As of 2026-08-30 the rendered feed carries **only** tweets league members shared in from X.
 * The automated sources below still work, are still tested and are still wired up — they are
 * behind the AUTOMATED_SOURCES switch, which is off. Read the note on that constant before
 * changing anything here; the short version is that the code stays because Path A is the only
 * attribution in this project that cannot be wrong, and deleting it would throw that away.
 *
 * `matchPlayer` and the index builders are exported so a test can run *this* matcher — the one
 * that ships — over the committed corpus rather than over a reimplementation of it. main() is
 * therefore guarded to the direct invocation; `--voice` in the test suite proves that guard
 * still resolves true, because a guard that silently stopped matching would silently stop the
 * daily refresh.
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
import { fileURLToPath } from "node:url";
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

/**
 * **The off switch for the automated sources.** Off. `--with-automated` turns it on for one run.
 *
 * When this is false, neither Path A (Sleeper's GraphQL `get_player_news`) nor Path B (the five
 * RSS feeds) is fetched at all, and no row from either reaches `news.json`. The feed is the
 * submission queue and nothing else. That is what was asked for: *"wipe the news feed now, and
 * only have it include what i share through our new shortcut"*.
 *
 * ## Why the code is still here
 *
 * It is a switch and not a deletion, and that is a deliberate choice rather than timidity:
 *
 * **Path A cannot mis-attribute, and nothing else in this project can say that.** Sleeper's
 * `get_player_news` is asked about one `player_id` and answers about that player, so the owner
 * is known before a word of the text is read. Every other way this app decides who a story is
 * about — the RSS name matcher, the tweet matcher, `target_name` — is an inference over prose
 * or over a name somebody typed on a phone, and each can be wrong. Deleting Path A would throw
 * away the one source in the feature that is right by construction, to save a function call.
 *
 * **The stated reason for turning it off is temporary.** The feed went manual because the
 * shared-tweet path had just landed and the automated rows were drowning it, not because the
 * automated rows were wrong. The Schefter path is the thing being built towards; when it is
 * wired, coverage is wanted back. A switch makes that one word. A deletion makes it a rewrite
 * of 300 lines that already work and are already documented against real failures.
 *
 * **Off means off, not filtered.** The check is at the fetch, so a build in this state makes no
 * request to Sleeper, to ESPN, to Rotowire, to CBS, to Yahoo or to ProFootballTalk. There is no
 * path by which an automated row can appear in the file while this is false, and main()'s
 * self-check asserts exactly that rather than trusting it.
 */
const AUTOMATED_SOURCES = false;

/** Rows kept in the shipped file. The feed is a scroll box, not an archive. */
const MAX_ITEMS = 60;
/**
 * How many submissions to read. Above MAX_ITEMS because rejected URLs and tweets shared twice
 * both cost a row here and none in the feed, so reading exactly MAX_ITEMS could ship fewer.
 */
const SUBMISSION_FETCH_LIMIT = 200;
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

/** The switch above, with the per-run override applied. Read this, never the constant. */
const automatedOn = AUTOMATED_SOURCES || args.has("--with-automated");

/* ------------------------------------------------------------- rosters ---- */

/**
 * player_id -> { user_id, manager } for every player on a current roster, plus the reverse
 * index the RSS matcher needs.
 *
 * A player on two rosters is impossible in Sleeper, so a collision here means the roster file
 * is stale rather than that a choice has to be made. It is counted and the first owner wins.
 */
export function buildOwnership() {
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
export function normName(s) {
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
export function buildPlayerIndex(owner, players) {
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
export function matchPlayer(title, index) {
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
 * choice is paid here.
 *
 * ## The rule, in the order it is applied
 *
 * The input is normalised with normName() first, which lower-cases, strips punctuation and
 * suffixes, collapses runs of whitespace and trims. So `"  SF69erss  "` and `"sf69erss"` are
 * already the same string as `"SF69erss"` before any comparison happens. Then:
 *
 *   1. **Exact**, against the normalised member name. One hit wins.
 *   2. **Prefix**, if nothing was exact: members whose normalised name *starts with* the input.
 *      `big` -> `bigjberg`.
 *   3. **Substring**, if nothing was a prefix: members whose normalised name *contains* it.
 *      `berg` -> `bigjberg`.
 *
 * Two rules bound it. **Any tier that produces more than one candidate resolves to null** — the
 * item publishes addressed to nobody rather than to a coin flip. And **tiers 2 and 3 need at
 * least three characters**, because a one- or two-letter fragment is not a person's name, it is
 * a typo, and it would match half the league.
 *
 * ## This reverses an earlier decision, on purpose
 *
 * The first version of this function refused partial matches outright, arguing that "Bubba"
 * matching `BubbaCuckShremp` today is "Josh" matching the wrong Allen tomorrow. That argument is
 * about matchPlayer(), and it does not carry here, because the two searches are not alike:
 *
 *   * matchPlayer() searches an **open** set — 12,225 names in Sleeper's dictionary, growing
 *     every week, containing two Josh Allens and two Michael Carters. A surname there is
 *     genuinely ambiguous and the ambiguity is invisible until it is wrong.
 *   * This searches a **closed** set of ten, fixed, known, and inspectable at build time. There
 *     is no unseen eleventh member for `big` to collide with, and if there ever is, rule one
 *     catches it and refuses.
 *
 * And the failure modes are opposite in cost. There, a wrong match tells the wrong manager his
 * running back tore an ACL. Here, the worst case is a jab aimed at the wrong seat — and the
 * realistic case, the one actually seen, is a Shortcut sending `"  sf69erss  "` and the feed
 * silently addressing it to nobody because of two spaces. Refusing was costing real attribution
 * to prevent a collision that cannot occur in a ten-name set.
 */
function resolveTarget(targetName, members) {
  const want = normName(targetName);
  if (!want) return null;
  const list = (members || []).map((m) => ({ m, key: normName(m.name) })).filter((x) => x.key);
  const pick = (hits) => (hits.length === 1
    ? { user_id: hits[0].m.user_id, manager: hits[0].m.name }
    : null);

  const exact = list.filter((x) => x.key === want);
  if (exact.length) return pick(exact);
  if (want.length < 3) return null;

  const prefix = list.filter((x) => x.key.startsWith(want));
  if (prefix.length) return pick(prefix);

  const inside = list.filter((x) => x.key.includes(want));
  return inside.length ? pick(inside) : null;
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
 * One share per tweet.
 *
 * A phone's share sheet appends its own tracking — the two real submissions in the table arrived
 * as `.../status/2094028581080834282?s=12&t=6MCtlgACvPE2VEY3UhiZeA` — so the same tweet shared
 * twice is two different strings and, without this, two identical rows in a feed of two items.
 * `parseTweetUrl()` already rebuilds the URL from the captured handle and id and throws the
 * query string away, so the canonical form is the key and no stripping happens here.
 *
 * **The newest share wins.** The feed is newest-first, so the story belongs at the position of
 * the share that just happened, carrying that sharer's jab; keeping the first share would pin a
 * live story to a stale timestamp under an older note. The rows this drops are counted in the
 * report rather than lost silently.
 *
 * Rows whose URL is not a tweet are dropped here, before any network call: they are reported by
 * the caller as rejections. Input must be newest-first.
 */
function collapseShares(subs) {
  const byTweet = new Map();
  const rejected = [];
  const duplicates = [];
  for (const sub of subs) {
    // Re-validated here even though the table constrains it, because the table is write-open to
    // anyone holding the anon key and a check that runs in only one place is a check that can be
    // walked around. This is also the gate the XSS probes in rows 1, 5 and 6 hit: `evil.com`,
    // `javascript:` and `evil.example.com` never become a URL, never get fetched, and never
    // reach a row.
    const parsed = parseTweetUrl(sub.url);
    if (!parsed) { rejected.push(sub); continue; }
    // Keyed on the tweet's numeric id, not on the canonical URL, because the URL still carries
    // the handle as it was typed and `x.com/AdamSchefter/status/123` and
    // `x.com/adamschefter/status/123` are one tweet. The id is globally unique on X and is the
    // only part of the permalink that identifies the post rather than describing it.
    if (byTweet.has(parsed.id)) {
      duplicates.push({ id: sub.id, kept: byTweet.get(parsed.id).sub.id });
      continue;
    }
    byTweet.set(parsed.id, { sub, canonical: parsed.canonical, tweetId: parsed.id });
  }
  return { kept: [...byTweet.values()], rejected, duplicates };
}

/**
 * The submission queue, turned into feed rows.
 *
 * Every failure is recorded rather than thrown: a tweet that has been deleted, a Supabase that
 * is asleep and a URL somebody hand-edited must each cost their own row and nothing else. That
 * mattered less when sixty automated items were underneath; now that these rows *are* the feed,
 * it is the difference between one missing story and a blank page, so there is a second
 * defence — see `previousTweets`.
 *
 * A submission is stamped `processed_at` only if it does not already carry one, so the value
 * keeps meaning "first published". Nothing is gated on the stamp any more; see
 * markSubmissionProcessed().
 *
 * @param previousTweets Map of canonical URL -> the tweet body already in `news.json`, used when
 *   oEmbed fails *transiently*. A timeout against publish.twitter.com used to cost that row; in
 *   a manual-only feed of two items, two timeouts cost the whole page. A tweet's text and author
 *   do not change, so the last known good copy is a correct answer rather than a stale one, and
 *   the row around it is still rebuilt from the current submission. A tweet that is genuinely
 *   *gone* (404, or no readable body) is not carried forward — that is a permanent answer, and
 *   showing a deleted tweet forever would be the feed lying rather than degrading.
 */
async function ingestSubmissions(ownership, index, members, {
  stampRows = true, previousTweets = new Map(),
} = {}) {
  const report = {
    queue_ok: false, queue_error: null, seen: 0, published: 0,
    rejected_url: 0, duplicate_shares: 0, carried_forward: 0,
    // targeted        — target_name resolved to a seat; the row is addressed
    // player_only     — no target, but a rostered player was named; the row ships unaddressed
    //                   and carries the player in its meta line
    // target_unresolved — a target_name was given and matched no member, or matched two
    targeted: 0, player_only: 0, target_unresolved: 0,
    unaddressed: 0, failed: 0, stamped: 0, stamp_errors: 0,
    failures: [],
  };
  const queue = await fetchSubmissions({
    limit: SUBMISSION_FETCH_LIMIT,
    // The feed is the whole table now, not the rows nobody has published yet — see
    // fetchSubmissions(). Newest first, because collapseShares() keeps the first it sees.
    unprocessedOnly: false,
    newestFirst: true,
  });
  report.queue_ok = queue.ok;
  report.queue_error = queue.error;
  if (!queue.ok) return { rows: [], report };
  report.seen = queue.rows.length;

  const { kept, rejected, duplicates } = collapseShares(queue.rows);
  report.rejected_url = rejected.length;
  report.duplicate_shares = duplicates.length;
  for (const sub of rejected) report.failures.push({ id: sub.id, reason: "bad_url", url: String(sub.url).slice(0, 60) });
  for (const d of duplicates) report.failures.push({ id: d.id, reason: `duplicate_of:${d.kept}` });
  // Stamped: a URL this shape can never become valid, so it will never publish and the stamp is
  // the honest record of that. Duplicates are left unstamped — the tweet published, just under
  // another row's id, and stamping them would claim they appeared on their own.
  for (const sub of rejected) await stamp(sub, report, stampRows);

  const rows = [];
  for (const { sub, canonical } of kept) {
    let tweet = await fetchTweet(canonical);
    if (!tweet.ok) {
      const permanent = tweet.reason === "not_found" || tweet.reason === "no_tweet_text" || tweet.reason === "bad_url";
      const cached = permanent ? null : previousTweets.get(canonical);
      if (!cached) {
        report.failed++;
        report.failures.push({ id: sub.id, reason: tweet.reason, status: tweet.status });
        if (permanent) await stamp(sub, report, stampRows);
        continue;
      }
      report.carried_forward++;
      report.failures.push({ id: sub.id, reason: `carried_forward:${tweet.reason}` });
      tweet = { ...cached, ok: true, url: canonical };
    }

    /**
     * Attribution. **`target_name` is the only thing that can address a row to a manager.**
     *
     * The player in the text is still resolved, and still ships — it is what the row's meta line
     * prints, `Keenan Allen · IND WR`, and it is a fact about the tweet rather than a claim about
     * a person. What it no longer does is pick a seat.
     *
     * This reverses the fallback that shipped with the submission path, where an unaddressed
     * share was handed to whoever owned the player named in it. Two things changed:
     *
     * **The feed is curated now.** When sixty automated rows sat underneath, inferring an owner
     * made a share behave like the rest of the feed. With submissions as the whole feed, the
     * premise is that a person decided both what to share and who to aim it at, and inferring
     * the second half of that from prose is the pipeline overruling the curator.
     *
     * **The inference is wrong in a way that reads as the app inventing things.** Both real
     * submissions in the queue arrived with `target_name` null while the Shortcut is still being
     * debugged, and both name a rostered player. Under the fallback, TrumanCooper's note on a
     * Schefter tweet — *"lol suck it Brad"* — was published under the name of whoever happens to
     * roster Keenan Allen. Those are somebody's words pointed at a seat they never chose. A
     * player match is evidence about a *story*; it is not consent to address a person.
     *
     * So an untargeted share publishes as the league's, under "The league", with the player and
     * the tweet intact. Nothing is dropped and nothing is guessed. The moment `target_name`
     * arrives, resolveTarget() is forgiving about how it was typed — that is where the effort
     * belongs, because that field is the sharer actually saying who they meant.
     */
    let own = null;
    let player = null;
    const target = resolveTarget(sub.target_name, members);
    const hit = matchTweetPlayer(tweet.text, index);
    if (hit.row) player = hit.row;
    if (target) {
      own = target;
      report.targeted++;
    } else if (player) {
      report.player_only++;
    }
    if (String(sub.target_name || "").trim() && !target) report.target_unresolved++;
    if (!own) report.unaddressed++;

    rows.push(toTweetRow(sub, tweet, own, player));
    report.published++;
    await stamp(sub, report, stampRows);
  }
  return { rows, report };
}

/**
 * The tweet bodies already on disk, by canonical URL, for ingestSubmissions()' carry-forward.
 *
 * Only rows that still satisfy every rule this pipeline enforces are offered back: the URL must
 * still parse as a tweet and must already be in canonical form. A file hand-edited to carry a
 * `javascript:` source_url therefore feeds nothing, so reading yesterday's output cannot become
 * a way around today's validation.
 */
function previousTweetBodies() {
  const book = readJson("ui/news.json", null);
  const out = new Map();
  if (!book || !Array.isArray(book.items)) return out;
  for (const it of book.items) {
    if (it.category !== "tweet" || !it.tweet_text || !it.tweet_handle) continue;
    const parsed = parseTweetUrl(it.source_url);
    if (!parsed || parsed.canonical !== it.source_url) continue;
    out.set(parsed.canonical, {
      text: it.tweet_text,
      author_name: it.tweet_author || "",
      author_handle: it.tweet_handle,
    });
  }
  return out;
}

/**
 * Record when one submission first reached the feed.
 *
 * `--report` documents itself as writing nothing, and stamping a row is a write, so every caller
 * passes the flag through and this is the one place that decides. That was load-bearing when the
 * stamp consumed the queue; it is now simply the documented behaviour of the flag, and worth
 * keeping for that reason alone.
 *
 * A row that already carries a stamp is left alone, so `processed_at` keeps meaning *first*
 * published rather than "last time a build ran".
 */
async function stamp(sub, report, stampRows = true) {
  const id = sub && typeof sub === "object" ? sub.id : sub;
  if (sub && typeof sub === "object" && sub.processed_at) {
    report.stamp_already = (report.stamp_already || 0) + 1;
    return true;
  }
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
    // How the ROW was addressed, not how the player was found. "player" means a rostered player
    // was identified and deliberately not turned into an addressee — see the attribution note in
    // ingestSubmissions().
    match: own ? "target_name" : (player ? "player" : "none"),
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

  // The switch is enforced at the fetch, not at a filter downstream: with AUTOMATED_SOURCES off
  // this build makes no request to Sleeper's news graph, to any of the five RSS feeds, or to the
  // trending endpoint that only ever ranked their rows. An off switch that still fetches is a
  // switch somebody will later mistake for a display toggle.
  const trending = automatedOn ? await fetchTrending() : { add: new Map(), drop: new Map(), errors: [] };
  const sleeper = automatedOn
    ? await fetchSleeperPlayerNews([...ownership.owner.keys()])
    : { ok: false, items: [], errors: [], skipped: true };
  const rssResults = automatedOn
    ? await fetchRss()
    : RSS_FEEDS.map((f) => ({ feed: f, ok: false, items: [], error: "off: AUTOMATED_SOURCES" }));

  const report = {
    automated_sources: automatedOn ? "on" : "off",
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

  // Shared tweets. With the automated sources off these are the whole feed; with them on they
  // still come last, because they get to displace an automated row rather than compete with one.
  // A queue that is unreachable costs its own rows and nothing else — every failure inside
  // ingestSubmissions() is recorded and returned, never thrown.
  const members = readJson("ui/members.json", []) || [];
  // Read before anything is written, so a run that fails an oEmbed can still show yesterday's
  // copy of that tweet rather than dropping the row. writeBook() is the only writer and it runs
  // after every check in main() has passed.
  const previousTweets = previousTweetBodies();
  const submissions = args.has("--no-submissions")
    ? { rows: [], report: { queue_ok: false, queue_error: "skipped by --no-submissions", seen: 0, published: 0, rejected_url: 0, duplicate_shares: 0, carried_forward: 0, targeted: 0, player_only: 0, target_unresolved: 0, unaddressed: 0, failed: 0, stamped: 0, stamp_errors: 0, failures: [] } }
    : await ingestSubmissions(ownership, index, members, {
      stampRows: !args.has("--report"),
      previousTweets,
    });
  report.submissions = submissions.report;
  report.previous_tweets_on_disk = previousTweets.size;

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
 *   "automated": "off",         // the AUTOMATED_SOURCES switch, as it stood for this build
 *   "sources": [                // which sources actually contributed, for triage. Empty of feeds
 *     { "id": "espn", "label": "ESPN", "ok": true, "items": 18 }   // while "automated" is "off"
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
 * **`v` stays 1 deliberately.** These fields, and the top-level `automated`, are purely additive
 * and every one of them is optional, so a page built before they existed ignores them and
 * renders these rows as ordinary news rows with no expander. Bumping to 2 would make the
 * *current* deployed page reject the whole file on its version gate — and with the feed now
 * built from submissions alone, "reject the whole file" is a blank feed rather than a degraded
 * one. The version gate is for changes that would make an old reader render something *wrong*,
 * and there is no such change here.
 *
 * `tweet_topic` exists on the row inside the pipeline and is **not** shipped: it only feeds
 * dedupeAgainstTweets(), and the UI has no use for it.
 */
function bookOf(items, rssResults, sleeper) {
  // `sources` is a record of what actually contributed, so with the automated sources switched
  // off it lists only the submission queue. Six entries reading `ok: false, items: 0` would say
  // "every feed in this app is down" to whoever reads this file for triage, which is the exact
  // opposite of what is true: nothing asked them anything. `automated` says which it is.
  const sources = automatedOn
    ? [
      {
        id: "sleeper:graphql",
        label: "Sleeper",
        ok: sleeper ? sleeper.ok : false,
        items: sleeper ? sleeper.items.length : 0,
      },
      ...(rssResults || []).map((r) => ({
        id: r.feed.id, label: r.feed.label, ok: r.ok, items: r.items.length,
      })),
    ]
    : [];
  if (items.some((it) => it.category === "tweet")) {
    sources.push({ id: "x:submission", label: "Shared from X", ok: true,
      items: items.filter((it) => it.category === "tweet").length });
  }
  // `tweet_topic` is pipeline-internal — see the schema note above. Stripped here rather than
  // never being set, because dedupeAgainstTweets() runs after the rows are built.
  const shipped = items.map(({ tweet_topic, ...rest }) => rest);
  return {
    v: SCHEMA_VERSION,
    generated: Date.now(),
    automated: automatedOn ? "on" : "off",
    sources,
    items: shipped,
  };
}

function writeBook(book) {
  const path = `${DATA}/ui/news.json`;
  fs.mkdirSync(`${DATA}/ui`, { recursive: true });
  fs.writeFileSync(path, JSON.stringify(book) + "\n");
  return path;
}

/* -------------------------------------------------------------- corpus ---- */

/**
 * Freeze one live day of RSS into data/fixtures/rss-corpus.json, **with this matcher's own
 * verdict on every item**.
 *
 * The point is not to have test data. It is that any new matcher can be scored against a real
 * third-party corpus whose answer set was produced by the code that actually ships, per item
 * rather than in aggregate — so a divergence can be read as a specific headline rather than as
 * a number that moved. Feeds churn hourly, so an offline corpus is also the only way the
 * comparison is reproducible tomorrow.
 */
async function writeCorpus() {
  const ownership = buildOwnership();
  const playersPath = `${DATA}/players.nfl.json`;
  if (!ownership.owner.size || !fs.existsSync(playersPath)) {
    throw new Error("run `node sleeper-sync.mjs` first — corpus needs rosters and the dictionary");
  }
  const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));
  const index = buildPlayerIndex(ownership.owner, players);
  const results = await fetchRss();
  const items = [];
  for (const result of results) {
    for (const raw of result.items) {
      const hit = matchPlayer(raw.title, index);
      const own = hit.row ? ownership.owner.get(hit.row.player_id) : null;
      items.push({
        source: raw.source,
        source_label: raw.source_label,
        source_url: raw.source_url,
        title: raw.title,
        summary: clip(raw.summary, 500),
        published: raw.published,
        baseline: {
          verdict: hit.reason,
          player: hit.row ? hit.row.name : null,
          player_id: hit.row ? hit.row.player_id : null,
          manager: own ? own.manager : null,
          candidates: (hit.candidates || []).map((c) => c.name),
        },
      });
    }
  }
  const book = {
    v: 1,
    harvested: Date.now(),
    note: "One live day of the five RSS feeds, with news-sync.mjs's own matchPlayer() verdict per item. Third-party text, verbatim; summaries clipped to 500 chars.",
    feeds: results.map((r) => ({ id: r.feed.id, label: r.feed.label, ok: r.ok, items: r.items.length })),
    rostered_players: ownership.owner.size,
    items,
  };
  fs.mkdirSync(`${DATA}/fixtures`, { recursive: true });
  fs.writeFileSync(`${DATA}/fixtures/rss-corpus.json`, JSON.stringify(book, null, 1) + "\n");
  const tally = {};
  for (const it of items) tally[it.baseline.verdict] = (tally[it.baseline.verdict] || 0) + 1;
  return { out: "data/fixtures/rss-corpus.json", items: items.length, baseline: tally };
}

/* ---------------------------------------------------------------- main ---- */

/**
 * `--selftest`: the two rules that decide who a shared tweet is addressed to and which tweet it
 * is, run against the real functions and the real members file, with no network.
 *
 * These are the cases the rules were written for, and several of them are transcriptions of what
 * the Shortcut actually sent. They live here rather than in a scratch file because a rule that is
 * only ever exercised by the live queue is a rule nobody notices breaking: `target_name` is null
 * on every real submission today, so the entire resolver could stop working and every build would
 * still look correct. Each case therefore has to be able to fail — the refusals are asserted as
 * loudly as the matches.
 */
function selfTest() {
  const members = readJson("ui/members.json", []) || [];
  const name = (t) => { const r = resolveTarget(t, members); return r ? r.manager : null; };
  const cases = [
    // Exact, and the whitespace and case the Shortcut sends.
    ["SF69erss", "SF69erss"], ["sf69erss", "SF69erss"], ["  SF69erss  ", "SF69erss"],
    ["\tBUBBACUCKSHREMP\n", "BubbaCuckShremp"],
    // Prefix, three characters or more.
    ["big", "bigjberg"], ["Tips", "TipsUp"], ["darkwing", "DarkWingDucks2023"],
    // Substring, when nothing is a prefix.
    ["berg", "bigjberg"], ["henry", "KingHenryXXVI"],
    // Refusals. Two candidates, too short to be a name, empty, and no such member.
    ["cu", null],            // under three characters, so no partial tier runs at all
    ["cum", "TedCumberbatch"], // ...and at three it is unambiguous again
    ["uc", null],
    ["s", null], ["", null], ["   ", null], [null, null], [undefined, null],
    ["NotAManager", null],
    ["<script>window.__XSS_TARGET=1</script>", null],
    // "u" appears inside six members; a three-character fragment that still hits two must refuse.
    ["ber", null],           // TedCumBERbatch and bigjBERg
  ];
  const bad = [];
  for (const [input, want] of cases) {
    const got = name(input);
    if (got !== want) bad.push(`resolveTarget(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }

  /**
   * The prefix tier, against a membership that can see it.
   *
   * Every case above passes with the prefix tier deleted, because in *this* league nothing that
   * starts with a fragment is also contained in a second name — `big` reaches `bigjberg` through
   * the substring tier just as well. Verified by deleting the tier and watching all twenty cases
   * still pass, which is exactly the §3a failure the audit names: a check that cannot fail.
   *
   * The tier is still right, and it is asserted here on a membership where it decides the answer.
   * `berg` starts one name and sits inside another; preferring the one it starts is what a person
   * means, and without the tier both are candidates and the row goes unaddressed. resolveTarget()
   * takes its members as an argument, so this is the real function on different data rather than
   * a copy of the rule.
   */
  const SYNTHETIC = [
    { user_id: "s1", name: "Bergman" }, { user_id: "s2", name: "bigjberg" },
    { user_id: "s3", name: "Tank" }, { user_id: "s4", name: "TankDell" },
  ];
  const synth = [
    ["berg", "Bergman"],    // prefix wins over the substring inside bigjberg
    ["bigj", "bigjberg"],   // and the other one is still reachable by its own prefix
    ["Tank", "Tank"],       // exact beats a longer name that merely starts the same way
    ["tankd", "TankDell"],
    ["ank", null],          // no prefix, two substrings: refuse
  ];
  for (const [input, want] of synth) {
    const hit = resolveTarget(input, SYNTHETIC);
    const got = hit ? hit.manager : null;
    if (got !== want) bad.push(`resolveTarget(${JSON.stringify(input)}, synthetic) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }

  // Canonicalisation: what a phone share sheet appends must not survive into the feed, or the
  // same tweet shared twice is two stories.
  const CANON = "https://x.com/adamschefter/status/2094028581080834282";
  const urls = [
    ["https://x.com/adamschefter/status/2094028581080834282?s=12&t=6MCtlgACvPE2VEY3UhiZeA", CANON],
    ["https://x.com/adamschefter/status/2094028581080834282", CANON],
    ["https://twitter.com/adamschefter/status/2094028581080834282?s=20", CANON],
    ["https://www.x.com/adamschefter/status/2094028581080834282/photo/1", CANON],
    ["https://x.com/adamschefter/statuses/2094028581080834282#anchor", CANON],
    ["https://evil.com/a/status/1", null],
    ["https://evil.example.com/a/status/1", null],
    ["javascript:window.__XSS_URL=1", null],
    ["https://x.com/jack", null],
    // Host confusions. `www.` is the only subdomain allowed, so an attacker-controlled label on
    // either side of x.com must be refused — these are the two shapes a loosened host pattern
    // lets through, and neither is caught by simply testing that evil.com fails.
    ["https://x.evil.com/a/status/1", null],
    ["https://evil.x.com/adamschefter/status/2094028581080834282", null],
    ["https://x.com.evil.com/a/status/1", null],
  ];
  for (const [input, want] of urls) {
    const got = parseTweetUrl(input);
    const canonical = got ? got.canonical : null;
    if (canonical !== want) bad.push(`parseTweetUrl(${JSON.stringify(input)}) = ${JSON.stringify(canonical)}, want ${JSON.stringify(want)}`);
  }

  const total = cases.length + synth.length + urls.length;
  if (bad.length) {
    console.error(bad.map((b) => `FAIL ${b}`).join("\n"));
    throw new Error(`${bad.length} of ${total} self-test cases failed`);
  }
  console.log(`ok: ${cases.length} name-resolution, ${synth.length} prefix-tier and ${urls.length} url-canonicalisation cases`);
}

async function main() {
  if (args.has("--selftest")) { selfTest(); return; }
  if (args.has("--corpus")) {
    console.log(JSON.stringify(await writeCorpus(), null, 2));
    return;
  }
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
      // Canonical, not merely valid. `parseTweetUrl()` accepts the tracking parameters a share
      // sheet appends and strips them, so a URL that parses but is not equal to its own
      // canonical form means something bypassed the canonicaliser and reached the row raw —
      // which is exactly how the same tweet shared twice becomes two stories.
      const parsed = parseTweetUrl(it.source_url);
      if (!parsed) {
        throw new Error(`self-check failed: shared tweet ${it.id} has a non-tweet source_url ${it.source_url}`);
      }
      if (parsed.canonical !== it.source_url) {
        throw new Error(`self-check failed: shared tweet ${it.id} ships an uncanonical url ${it.source_url} (should be ${parsed.canonical})`);
      }
    }
  }

  // Manual-only, asserted rather than assumed. AUTOMATED_SOURCES gates two fetches, and a later
  // edit that reads a cached feed, or a path that slips past the gate, would put automated rows
  // back into a file the user asked to contain only their own shares. This is the one check that
  // states the product decision, so it is written as a refusal to write the file.
  if (!automatedOn) {
    const stray = book.items.find((it) => it.category !== "tweet" || it.source !== "x:submission");
    if (stray) {
      throw new Error(`self-check failed: AUTOMATED_SOURCES is off but item ${stray.id} came from ${stray.source} — the feed is submissions only`);
    }
  }
  // One story per tweet. collapseShares() is the only thing standing between "shared twice" and
  // two identical rows in a feed that may only have two rows in it, and a duplicate is invisible
  // in a count — both files have the right length. Compared on the tweet id rather than on the
  // URL string, for the same reason collapseShares() keys on it: two spellings of one handle
  // are two strings and one tweet, and a check on the string would miss exactly that case.
  const seenTweets = new Map();
  for (const it of book.items) {
    if (it.category !== "tweet") continue;
    const tid = parseTweetUrl(it.source_url).id;
    if (seenTweets.has(tid)) {
      throw new Error(`self-check failed: tweet ${tid} appears twice (${seenTweets.get(tid)} and ${it.id}) — the same tweet shared twice must be one story`);
    }
    seenTweets.set(tid, it.id);
  }

  if (args.has("--report")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  writeBook(book);
  console.log(JSON.stringify({
    out: "data/ui/news.json",
    automated_sources: automatedOn ? "on" : "off",
    items: book.items.length,
    managers_addressed: Object.keys(report.by_manager).length,
    by_category: report.by_category,
    submissions: {
      seen: report.submissions.seen,
      published: report.submissions.published,
      rejected_url: report.submissions.rejected_url,
      duplicate_shares: report.submissions.duplicate_shares,
      targeted: report.submissions.targeted,
      target_unresolved: report.submissions.target_unresolved,
      unaddressed: report.submissions.unaddressed,
      carried_forward: report.submissions.carried_forward,
    },
    rss_matched: report.rss.matched,
    rss_total: report.rss.total,
    rss_ambiguous: report.rss.ambiguous,
    sleeper_items: report.sleeper_graphql.items,
    feeds_ok: report.feeds.filter((f) => f.ok).length + "/" + report.feeds.length,
  }, null, 2));
}

/**
 * Run only when this file is the process entry point, so a test can import matchPlayer() without
 * firing a live build. A guard like this fails silently if it ever stops resolving — the cron
 * would run, print nothing and refresh nothing — so news-match.test.mjs spawns
 * `node news-sync.mjs --voice` and asserts it produces output.
 */
/**
 * This module is imported by news-match.mjs for its ownership index and its matcher, so main()
 * cannot run on import. It must still run when the workflow invokes it as a script, and getting
 * that backwards silently switches the live feed off — the failure would look like news simply
 * going stale, with a green cron.
 *
 * fileURLToPath, not `new URL(...).pathname`: the latter leaves percent-escapes in place, so a
 * checkout under a path containing a space would compare "/a%20b/news-sync.mjs" against
 * "/a b/news-sync.mjs", never match, and disable the sync.
 */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url));
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
