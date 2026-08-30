#!/usr/bin/env node
/**
 * Harvest **real** Schefter wording out of the sources this repo already reaches, so the tweet
 * matcher can be validated against text somebody else wrote.
 *
 *   node news-fixtures.mjs --harvest   # network: writes data/fixtures/schefter-quotes.json
 *   node news-fixtures.mjs            # offline: describe the committed fixtures
 *
 * ## Why this file exists
 *
 * The X ingest cannot be exercised: there is no token yet (see docs/NEWS_SDD.md §10). The
 * tempting move is to write fifty fixtures in an imagined Schefter register and then report a
 * pass rate against them, which measures nothing except how well the matcher handles the
 * author's imagination. The RSS and Sleeper payloads this repo already fetches quote him
 * verbatim and by name several dozen times a day — "…, Adam Schefter of ESPN reports",
 * "sources told ESPN's Adam Schefter" — so real sentences about real transactions, carrying the
 * real names and teams, are already reachable for free.
 *
 * ## What a fixture holds, and what is honest to claim about it
 *
 * `verbatim` is the sentence exactly as the aggregator published it. It is **not** a tweet: it
 * is a third party restating a report and crediting him. That is still the useful part — the
 * player names, team names, positions, injury nouns and transaction verbs are real, and those
 * are the only things the matcher reads.
 *
 * `tweet_form` is `verbatim` with one attribution clause removed, and nothing else changed. When
 * a wire item ends ", Adam Schefter of ESPN reports." the remainder is the claim as the reporter
 * himself would post it, because the clause is the aggregator's credit line rather than part of
 * the claim. Every fixture records `stripped` — the exact clause removed — so a reviewer can
 * reverse the transform and check it. No fixture invents words: where no listed clause matches,
 * `tweet_form === verbatim` and `derived` is false.
 *
 * Deliberately-adversarial cases are **not** here. They live in news-match.test.mjs, next to
 * the expectation each one exists to check, and each is labelled with where its text came from.
 */
import fs from "node:fs";
import { DATA, readJson } from "./lib.mjs";
import { fetchRss, fetchSleeperPlayerNews } from "./news-sources.mjs";

const OUT = `${DATA}/fixtures/schefter-quotes.json`;
const args = new Set(process.argv.slice(2));

/** Any mention of him, in any of the forms the five feeds and Sleeper's three sources use. */
const MENTIONS = /\bSchefter\b/i;

/**
 * The credit clauses observed in live payloads, longest first so the specific form wins.
 * `where` records which end of the sentence the clause sat on, because a leading clause needs
 * the remainder re-capitalised and a trailing one needs its full stop put back.
 */
const ATTRIBUTIONS = [
  { where: "tail", re: /,?\s*sources\s+told\s+ESPN'?s\s+Adam\s+Schefter\s*\.?\s*$/i },
  { where: "tail", re: /,?\s*(?:as\s+)?(?:ESPN'?s\s+)?Adam\s+Schefter\s+of\s+ESPN\s+reports?\s*\.?\s*$/i },
  { where: "tail", re: /,?\s*(?:as\s+)?(?:ESPN'?s\s+)?Adam\s+Schefter\s+reports?\s*\.?\s*$/i },
  { where: "tail", re: /,?\s*(?:per|according\s+to)\s+(?:NFL\s+Insider\s+)?Adam\s+Schefter(?:\s+of\s+ESPN)?\s*\.?\s*$/i },
  { where: "head", re: /^According\s+to\s+(?:NFL\s+Insider\s+)?Adam\s+Schefter,\s*/i },
  { where: "head", re: /^Per\s+(?:NFL\s+Insider\s+)?Adam\s+Schefter,\s*/i },
  { where: "head", re: /^(?:ESPN'?s\s+)?Adam\s+Schefter\s+reports?(?:\s+that)?\s+/i },
];

/** Remove exactly one credit clause. Returns the clause removed, or null when none applied. */
export function stripAttribution(sentence) {
  const text = String(sentence == null ? "" : sentence).trim();
  for (const { where, re } of ATTRIBUTIONS) {
    const m = text.match(re);
    if (!m) continue;
    let rest = text.replace(re, where === "head" ? "" : "").trim();
    if (!rest) continue;
    if (where === "head") rest = rest.charAt(0).toUpperCase() + rest.slice(1);
    if (!/[.!?]$/.test(rest)) rest += ".";
    return { tweet_form: rest, stripped: m[0].trim() };
  }
  return null;
}

/** Sentence split that keeps "Adam Schefter of ESPN reports." attached to its own claim. */
function sentences(text) {
  return String(text == null ? "" : text)
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function harvest() {
  const rosters = readJson("rosters_now.json", []) || [];
  const ids = new Set();
  for (const r of rosters) for (const pid of r.players || []) ids.add(String(pid));

  const rss = await fetchRss();
  const sleeper = await fetchSleeperPlayerNews([...ids]);

  const pool = [];
  for (const r of rss) {
    for (const it of r.items) pool.push({ origin: it.source, label: it.source_label, title: it.title, summary: it.summary });
  }
  for (const it of sleeper.items) {
    pool.push({ origin: it.source, label: it.source_label, title: it.title, summary: it.summary });
  }

  const seen = new Map();
  for (const it of pool) {
    for (const raw of sentences(`${it.title}. ${it.summary || ""}`)) {
      if (!MENTIONS.test(raw)) continue;
      // A sentence long enough to carry a claim, short enough to be one post.
      if (raw.length < 40 || raw.length > 400) continue;
      const key = raw.replace(/\s+/g, " ").toLowerCase();
      if (seen.has(key)) continue;
      const strip = stripAttribution(raw);
      seen.set(key, {
        id: "",
        origin: it.origin,
        origin_label: it.label,
        verbatim: raw.replace(/\s+/g, " "),
        tweet_form: strip ? strip.tweet_form : raw.replace(/\s+/g, " "),
        stripped: strip ? strip.stripped : null,
        derived: !!strip,
      });
    }
  }

  const items = [...seen.values()]
    .sort((a, b) => a.verbatim.localeCompare(b.verbatim))
    .map((row, i) => ({ ...row, id: `sq${String(i + 1).padStart(2, "0")}` }));

  const book = {
    v: 1,
    harvested: Date.now(),
    method:
      "Every sentence containing 'Schefter' in a live fetch of the five RSS feeds plus Sleeper's "
      + "get_player_news over this league's rostered players. `verbatim` is the publisher's own "
      + "text. `tweet_form` is `verbatim` with the one credit clause named in `stripped` removed "
      + "and nothing else altered; `derived: false` means no clause matched and the two are equal.",
    sources_fetched: {
      rss: rss.map((r) => ({ id: r.feed.id, ok: r.ok, items: r.items.length })),
      sleeper: { ok: sleeper.ok, items: sleeper.items.length },
    },
    items,
  };
  fs.mkdirSync(`${DATA}/fixtures`, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(book, null, 1) + "\n");
  return {
    out: "data/fixtures/schefter-quotes.json",
    sentences: items.length,
    derived: items.filter((i) => i.derived).length,
    verbatim_only: items.filter((i) => !i.derived).length,
    by_origin: items.reduce((acc, i) => ({ ...acc, [i.origin]: (acc[i.origin] || 0) + 1 }), {}),
  };
}

function stats() {
  const book = readJson("fixtures/schefter-quotes.json", null);
  if (!book) return { error: "no data/fixtures/schefter-quotes.json — run --harvest" };
  return {
    harvested: new Date(book.harvested).toISOString(),
    sentences: book.items.length,
    derived: book.items.filter((i) => i.derived).length,
    by_origin: book.items.reduce((acc, i) => ({ ...acc, [i.origin]: (acc[i.origin] || 0) + 1 }), {}),
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
  const run = args.has("--harvest") ? harvest() : Promise.resolve(stats());
  run
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
