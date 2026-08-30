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
 *   node news-sync.mjs --corpus        # fetch RSS live, write data/fixtures/rss-corpus.json
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
import { DATA, readJson } from "./lib.mjs";
import { CATEGORIES, classify, leagueLine, voiceSamples } from "./news-voice.mjs";
import {
  RSS_FEEDS,
  fetchRss,
  fetchSleeperPlayerNews,
  fetchTrending,
} from "./news-sources.mjs";

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

  const deduped = dedupe(rows);
  const merged = deduped
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
  for (const r of merged) report.by_manager[r.manager] = (report.by_manager[r.manager] || 0) + 1;
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
  return { v: SCHEMA_VERSION, generated: Date.now(), sources, items };
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

async function main() {
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
    if (!known.has(it.user_id)) {
      throw new Error(`self-check failed: item ${it.id} is addressed to unknown user ${it.user_id}`);
    }
    if (!it.league_line) {
      throw new Error(`self-check failed: item ${it.id} has no league line`);
    }
    if (!CATEGORIES.some((c) => c.id === it.category)) {
      throw new Error(`self-check failed: item ${it.id} has unknown category ${it.category}`);
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

/**
 * Run only when this file is the process entry point, so a test can import matchPlayer() without
 * firing a live build. A guard like this fails silently if it ever stops resolving — the cron
 * would run, print nothing and refresh nothing — so news-match.test.mjs spawns
 * `node news-sync.mjs --voice` and asserts it produces output.
 */
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
