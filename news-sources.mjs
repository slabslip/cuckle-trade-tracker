#!/usr/bin/env node
/**
 * Where league news comes from. Three adapters, no dependencies, `fetch` and string work only.
 *
 * The adapters are deliberately separate from news-sync.mjs so a source that dies is one
 * function to replace rather than a rewrite. Each returns the same raw shape:
 *
 *   { source, source_url, title, summary, published, player_id? }
 *
 * `player_id` is present only when the source itself is keyed by player. When it is absent,
 * news-sync.mjs has to guess which player the headline is about, and guessing is the single
 * most dangerous thing this feature does — see matchPlayer() there.
 *
 * ## What was probed, and what is actually true (2026-08-30, from the build VM)
 *
 * **Sleeper GraphQL `get_player_news` — the primary source, and the surprise.** Sleeper's REST
 * API has no news route: `/v1/news/nfl`, `/news/nfl`, `/v1/nfl/news` all 404, and
 * `/v1/players/nfl/news` answers `null`. The documented API genuinely carries no news text.
 * But `https://api.sleeper.app/graphql` is open, unauthenticated, and its schema exposes
 * `get_player_news(sport, player_id, limit)` returning a `PlayerNews` with
 * `metadata { title, description, analysis, url, topic_id }`, `source`, `source_key` and
 * `published`. Observed sources in the payload: `rotowire`, `rotoballer`, `fantasy_pros`.
 * It requires `player_id` (`String!`), so there is no "give me today's league news" call —
 * you ask per player. GraphQL aliases batch it: 20 players in one POST answered in ~163ms,
 * so the whole league's 337 rostered players cost ~17 requests.
 *
 * This is better than RSS for this feature for one reason that outweighs everything else:
 * **it is keyed by player_id, so attribution is exact.** No name matching, so no chance of
 * telling the wrong manager their running back is hurt.
 *
 * It is also **undocumented**, which means it can change or close without notice. That is why
 * RSS is still here and still wired up: it is the fallback, not dead code.
 *
 * **RSS — the documented, stable backbone.** Reachable from this VM and verified:
 *   ESPN NFL, Rotowire NFL, CBS NFL, Yahoo NFL, ProFootballTalk, FoxSports NFL, BBC.
 * Not reachable: FantasyPros (`/nfl/rss/news.php` answers a 404 HTML page; `/rss/nfl-news.xml`
 * answers 200 with a zero-byte body), NFL.com (`/feeds/rss/news` 404s).
 *
 * **Adam Schefter's Twitter/X — not possible, and not worth it.** `api.twitter.com/2` answers
 * 401 without a bearer token, and a bearer token now requires a paid X API tier. Scraping is
 * against X's terms, and `x.com/AdamSchefter` answers 200 with a JavaScript shell that carries
 * no tweets to a fetch. Nitter is gone (`nitter.net` → HTTP 410). **No scraper is built here.**
 * The workaround is real and was verified in a live payload, not assumed: the Rotowire NFL feed
 * item for George Kittle on 2026-08-30 reads "...as he continues his push to play in the 49ers'
 * season opener against the Rams in Australia, **Adam Schefter of ESPN reports**." Schefter
 * breaks news on X and it is restated by ESPN's own feeds and the aggregators within minutes,
 * with attribution. The RSS path therefore captures nearly all of the value at zero cost.
 *
 * **Sleeper trending add/drop — a severity signal, not news.** `/v1/players/nfl/trending/add`
 * and `/trending/drop` are free and real and return `[{ player_id, count }]`. No text. A player
 * with 167,184 adds across Sleeper is a player something happened to, which is useful for
 * ranking what to show, and useless for saying what happened.
 *
 * **The player dictionary carries news-adjacent fields.** `/v1/players/nfl` includes
 * `news_updated` (a timestamp, populated for 8,208 players and moving live), `injury_status`
 * (735 populated), `injury_body_part` (658) and `injury_notes` (88, and terse — "Soreness",
 * "Surgery"). `practice_description` is populated for exactly 1 player. So: a reliable
 * *when did news break* clock and a reliable *is he hurt* flag, and no prose worth printing.
 */

const SLEEPER_GQL = "https://api.sleeper.app/graphql";
const UA = "cuckle-trade-tracker/1.0 (league news feed; +https://github.com/slabslip/cuckle-trade-tracker)";

/** Feeds this VM was verified able to reach. `id` is what lands in news.json's `source`. */
export const RSS_FEEDS = [
  { id: "espn", label: "ESPN", url: "https://www.espn.com/espn/rss/nfl/news" },
  { id: "rotowire", label: "Rotowire", url: "https://www.rotowire.com/rss/news.php?sport=NFL" },
  { id: "cbs", label: "CBS Sports", url: "https://www.cbssports.com/rss/headlines/nfl/" },
  { id: "yahoo", label: "Yahoo", url: "https://sports.yahoo.com/nfl/rss.xml" },
  { id: "pft", label: "ProFootballTalk", url: "https://profootballtalk.nbcsports.com/feed/" },
];

/** Human labels for the sources Sleeper's GraphQL aggregates. */
export const SLEEPER_NEWS_LABELS = {
  rotowire: "Rotowire",
  rotoballer: "RotoBaller",
  fantasy_pros: "FantasyPros",
};

/* ------------------------------------------------------------------ XML ---- */

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", rsquo: "\u2019",
  lsquo: "\u2018", ldquo: "\u201c", rdquo: "\u201d", eacute: "\u00e9",
};

/**
 * Decode the entity forms that actually appear in these five feeds, plus numeric ones.
 * Deliberately not a general HTML entity table: the output of this is escaped again with
 * esc() before it reaches the DOM, so an entity this misses renders as its own literal text
 * rather than as markup. Failing closed is the point.
 */
export function decodeEntities(s) {
  return String(s == null ? "" : s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : m;
    });
}

function safeCodePoint(n) {
  // `&#60;` would put a literal "<" back into the text after the tag stripper has run, so tag
  // delimiters are never reconstituted. Quotes and ampersands are left alone: they are ordinary
  // prose ("SportsLine's" arrives as `&#039;`), esc() escapes them at the point of use, and
  // dropping them costs readability for no security gain.
  if (!Number.isFinite(n) || n < 32 || n > 0x10ffff) return "";
  const ch = String.fromCodePoint(n);
  return ch === "<" || ch === ">" ? "" : ch;
}

/** Strip tags and collapse whitespace. Feed descriptions carry markup; the UI wants a sentence. */
export function plainText(s) {
  return decodeEntities(
    String(s == null ? "" : s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull one child element's text out of an item block.
 *
 * Narrow on purpose. It reads the first matching tag, unwraps CDATA, and returns text — it does
 * not build a tree, resolve namespaces or handle attributes beyond one href case. Every feed
 * checked emits `<item>`/`<entry>` children as flat text or CDATA, so a real parser would be
 * more code with more ways to be wrong. Anything this cannot read comes back "" and the item
 * is dropped, which is the correct failure for a news feed.
 */
function tagText(block, ...names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
    const m = block.match(re);
    if (m) {
      const raw = m[1].trim();
      const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
      const text = plainText(cdata ? cdata[1] : raw);
      if (text) return text;
    }
  }
  return "";
}

/** Atom puts the URL in an attribute: <link rel="alternate" href="..."/>. */
function atomHref(block) {
  const m = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  return m ? decodeEntities(m[1]).trim() : "";
}

/**
 * Parse dates these feeds actually emit. `Date.parse` handles RFC-822 with a numeric offset and
 * the common US abbreviations, but Rotowire ships "Sun, 30 Aug 2026 7:58:00 AM PDT" — a 12-hour
 * clock with a meridiem *and* a zone name, which Node parses as NaN. Normalise that one shape,
 * then fall back to null rather than to Date.now(), so an unparseable date is visibly missing
 * instead of silently claiming the story broke this second.
 */
export function parseFeedDate(s) {
  const text = String(s == null ? "" : s).trim();
  if (!text) return null;
  let t = Date.parse(text);
  if (Number.isFinite(t)) return t;
  const ampm = text.replace(
    /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\b/i,
    (_, h, m, sec, mer) => {
      let hour = Number(h) % 12;
      if (mer.toUpperCase() === "PM") hour += 12;
      return `${String(hour).padStart(2, "0")}:${m}:${sec || "00"}`;
    },
  );
  t = Date.parse(ampm);
  if (Number.isFinite(t)) return t;
  // Last resort: drop a trailing alphabetic zone name and read it as UTC.
  t = Date.parse(ampm.replace(/\s+\(?[A-Z]{2,5}\)?$/, " GMT"));
  return Number.isFinite(t) ? t : null;
}

/** RSS 2.0 `<item>` and Atom `<entry>`, to a flat list. Unknown shapes yield []. */
export function parseFeed(xml, feed) {
  const text = String(xml == null ? "" : xml);
  const blocks = text.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) || [];
  const out = [];
  for (const block of blocks) {
    const title = tagText(block, "title");
    if (!title) continue;
    const link = tagText(block, "link") || atomHref(block);
    const published = parseFeedDate(
      tagText(block, "pubDate", "published", "updated", "dc:date"),
    );
    out.push({
      source: feed.id,
      source_label: feed.label,
      source_url: /^https?:\/\//i.test(link) ? link : "",
      title,
      summary: tagText(block, "description", "summary"),
      published,
      player_id: null,
    });
  }
  return out;
}

/* -------------------------------------------------------------- fetchers ---- */

async function getText(url, timeoutMs = 12000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every RSS feed, in parallel, each failing on its own. A dead source must cost its own items
 * and nothing else — see NEWS_SDD "what happens when a source dies".
 */
export async function fetchRss(feeds = RSS_FEEDS) {
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const items = parseFeed(await getText(feed.url), feed);
        return { feed, ok: true, items, error: null };
      } catch (err) {
        return { feed, ok: false, items: [], error: err.message || String(err) };
      }
    }),
  );
  return results;
}

async function gql(query, timeoutMs = 15000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(SLEEPER_GQL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({ query }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.errors) throw new Error(body.errors.map((e) => e.message).join("; "));
    return body.data || {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sleeper's per-player news, batched with GraphQL aliases.
 *
 * `playerIds` should be the rostered players and nothing else — there is no reason to ask about
 * a player nobody in the league owns. Batches of 20 kept a single POST under 60KB and ~165ms in
 * probing; the batches run in sequence rather than in parallel because this is an undocumented
 * endpoint being used politely.
 *
 * Returns { items, ok, errors }. Items carry `player_id`, which is what makes this source safe.
 */
export async function fetchSleeperPlayerNews(playerIds, { limit = 5, batch = 20 } = {}) {
  const ids = [...new Set(playerIds.filter((id) => /^[A-Za-z0-9_-]+$/.test(String(id))))];
  const items = [];
  const errors = [];
  for (let i = 0; i < ids.length; i += batch) {
    const slice = ids.slice(i, i + batch);
    const body = slice
      .map((id, n) =>
        `a${n}: get_player_news(sport:"nfl",player_id:"${id}",limit:${Number(limit) || 5})`
        + "{ source source_key published metadata }",
      )
      .join("\n");
    let data;
    try {
      data = await gql(`{${body}}`);
    } catch (err) {
      errors.push({ ids: slice, error: err.message || String(err) });
      continue;
    }
    slice.forEach((id, n) => {
      for (const row of data[`a${n}`] || []) {
        const meta = row.metadata || {};
        const title = plainText(meta.title);
        if (!title) continue;
        items.push({
          source: `sleeper:${row.source || "unknown"}`,
          source_label: SLEEPER_NEWS_LABELS[row.source] || "Sleeper",
          source_url: /^https?:\/\//i.test(String(meta.url || "")) ? String(meta.url) : "",
          title,
          summary: plainText(meta.description || meta.analysis || ""),
          published: Number.isFinite(row.published) ? row.published : null,
          player_id: id,
        });
      }
    });
  }
  return { items, ok: errors.length < Math.ceil(ids.length / batch), errors };
}

/* ----------------------------------------------------- shared tweets (X) ---- */

/**
 * A tweet a league member shared in from the X share sheet.
 *
 * ## The endpoint, and why this is not the scraper the header rules out
 *
 * The note above stands: `api.twitter.com/2` needs a paid bearer token, and scraping x.com is
 * against its terms and returns a JavaScript shell anyway. **`publish.x.com/oembed` is neither.**
 * It is X's own documented, unauthenticated oEmbed endpoint, intended to be called by any site
 * that wants to display a tweet, and it hands back the tweet's text as a field. We ask for one
 * specific tweet that a league member deliberately chose to share. That is the whole difference:
 * it is a per-item lookup on a public endpoint, not a crawl.
 *
 * ## Verified from the build VM, 2026-08-30 — the parts that shape this code
 *
 * `publish.twitter.com/oembed` answers **301** to `publish.x.com/oembed`, so redirects must be
 * followed. Both `x.com/...` and `twitter.com/...` are accepted in the `url` parameter and the
 * response normalises `url` to `x.com`. A live tweet returns 200 JSON with `url`, `author_name`,
 * `author_url`, `html`, `width`, `height`, `type`, `cache_age`, `provider_name`, `provider_url`
 * and `version`. Twelve sequential calls all answered ~110ms with no rate-limit headers and no
 * throttling, and `cache_age` is 100 years, so this is a cheap call made once per submission.
 *
 * Three failure shapes matter, and each one is a branch below:
 *
 * **A missing tweet does not return JSON.** Deleted, protected and non-X URLs all return **404
 * with an HTML body** — X's ordinary "Nothing to see here" web page. Calling `res.json()` on a
 * non-200 therefore throws on the HTML rather than yielding an error object, so the status is
 * checked before the body is ever parsed.
 *
 * **A malformed URL returns 400 JSON**, in a *different* shape from the endpoint's other 400
 * (`{"message":"bad url, reason: no protocol: ..."}` versus `{"errors":[{"code":357,...}]}`), so
 * neither shape is relied on for anything beyond "this failed".
 *
 * **A profile URL returns 200 with no tweet in it.** `https://x.com/jack` answers 200 with
 * `title: ""`, **no `author_name` at all**, and an `html` containing a timeline widget link
 * rather than a blockquote. This is the trap worth naming: a naive `res.ok` check followed by
 * "read `html`" publishes a row whose text is the string "Posts by jack". So a result is only
 * accepted when it has an author *and* a tweet body was actually extracted.
 */
const OEMBED = "https://publish.twitter.com/oembed";

/**
 * The one place a tweet URL is validated, and the only thing downstream may use.
 *
 * Returns `{ handle, id, canonical }` or null. `canonical` is **rebuilt from the captured parts**
 * rather than passed through from the input, which is what makes the rest of the pipeline safe
 * by construction: whatever query string, `/photo/1` suffix, `www.`, `twitter.com` host or
 * trailing junk the share sheet appended, what leaves here is exactly
 * `https://x.com/<handle>/status/<id>` and cannot be anything else. A string that does not match
 * never becomes a URL at all.
 *
 * This mirrors `news_submissions_url_shape` in db/schema.sql on purpose. The constraint stops a
 * bad row being stored; this stops a bad row being fetched or rendered if one ever is — the
 * table is write-open to anyone holding the anon key, so neither check may be the only one.
 */
export function parseTweetUrl(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (s.length > 500) return null;
  const m = s.match(
    /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/([0-9]{1,25})(?:\/(?:photo|video)\/[0-9]{1,2})?\/?(?:[?#].*)?$/i,
  );
  if (!m) return null;
  return { handle: m[1], id: m[2], canonical: `https://x.com/${m[1]}/status/${m[2]}` };
}

/**
 * The tweet's text, out of the HTML oEmbed hands back, without ever trusting that HTML.
 *
 * oEmbed returns markup, and markup is the one thing this pipeline must never pass along. The
 * body of a tweet is the first `<p>` inside the blockquote; everything after it is X's own
 * `&mdash; Name (@handle) <a>date</a>` trailer, which is chrome rather than content. So: take
 * the first paragraph, and hand it to `plainText()` — the same stripper the RSS path uses, which
 * removes `<script>`/`<style>` bodies outright, drops every remaining tag, and decodes entities
 * through a table that deliberately **refuses to reconstitute `<` or `>`** from `&#60;`/`&#62;`.
 *
 * The result is plain text with no markup in it by construction, and it is escaped again with
 * esc() at render time. A tweet whose text is literally `<script>alert(1)</script>` arrives from
 * X already entity-encoded, survives here as the visible characters, and renders as those
 * characters. It never becomes an element at any point.
 *
 * Returns "" when there is no paragraph to read, which is what a profile URL produces, and ""
 * is refused by the caller.
 */
export function tweetTextFromHtml(html) {
  const s = String(html == null ? "" : html);
  const para = s.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  if (!para) return "";
  // <br> is a line break in a tweet, and stripping it bare would run two lines together into
  // one word. Everything else plainText() collapses to a space.
  return plainText(para[1].replace(/<br\s*\/?>/gi, " "));
}

/** `https://x.com/AdamSchefter` -> `AdamSchefter`. Anything unexpected -> "". */
export function handleFromAuthorUrl(authorUrl) {
  const m = String(authorUrl == null ? "" : authorUrl)
    .match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i);
  return m ? m[1] : "";
}

/**
 * One tweet, by URL. Never throws: a submission that cannot be read must cost that submission
 * and nothing else, the same rule every other source in this file follows.
 *
 * Returns `{ ok, status, reason, text, author_name, author_handle, url }`.
 */
export async function fetchTweet(rawUrl, timeoutMs = 12000) {
  const fail = (reason, status = 0) => ({
    ok: false, status, reason, text: "", author_name: "", author_handle: "", url: "",
  });
  const parsed = parseTweetUrl(rawUrl);
  if (!parsed) return fail("bad_url");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  let body;
  try {
    res = await fetch(
      `${OEMBED}?url=${encodeURIComponent(parsed.canonical)}&omit_script=1&dnt=1`,
      { headers: { "user-agent": UA, accept: "application/json" }, signal: ac.signal, redirect: "follow" },
    );
    // Deleted, protected and unknown tweets answer 404 with an HTML page, so the body is only
    // worth reading once the status says it is a body. res.json() here would throw on "<!DOCTYPE".
    if (!res.ok) return fail(res.status === 404 ? "not_found" : `http_${res.status}`, res.status);
    if (!/\bjson\b/i.test(res.headers.get("content-type") || "")) return fail("not_json", res.status);
    body = await res.json();
  } catch (err) {
    return fail(err && err.name === "AbortError" ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }

  const text = tweetTextFromHtml(body && body.html);
  const authorName = plainText(body && body.author_name);
  // Both, not either. A profile URL returns 200 with a timeline widget, no author_name and no
  // paragraph — see the note above — and must not publish as a tweet with an empty body.
  if (!text || !authorName) return fail("no_tweet_text", res.status);

  return {
    ok: true,
    status: res.status,
    reason: "ok",
    text,
    author_name: authorName,
    author_handle: handleFromAuthorUrl(body && body.author_url) || parsed.handle,
    // Our canonical form, never the `url` X echoed back and never the submitted string.
    url: parsed.canonical,
  };
}

/* ------------------------------------------------ the submission queue ---- */

// The same project and the same anon key the page already carries for votes. It is public by
// design — this is a static site on GitHub Pages, there is nowhere to keep a secret, and the
// boundary is the RLS in db/schema.sql rather than the key. A service_role key must never
// appear here: it bypasses RLS entirely.
const SUPABASE = "https://gtqyvnkkjiksmmtmzubw.supabase.co/rest/v1";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0cXl2bmtramlrc21tdG16dWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMjk2MzMsImV4cCI6MjEwMzYwNTYzM30.cyEU9bWTkRWTJxlwwPKEgXNT9WJukSluNcsj56WZib8";

function supabaseHeaders(extra) {
  return Object.assign(
    { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "user-agent": UA },
    extra || {},
  );
}

/**
 * Submissions nobody has published yet, oldest first — the partial index in db/schema.sql 5a
 * covers exactly this predicate.
 *
 * Returns `{ ok, rows, error }` and never throws. A paused free-tier Supabase project can hang
 * rather than refuse, so this is on a timeout: the shared-tweet path going quiet must cost the
 * shared tweets and leave the 60 automated items alone.
 */
export async function fetchSubmissions({ limit = 50, timeoutMs = 10000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const url = `${SUPABASE}/news_submissions`
      + "?select=id,url,note,target_name,submitted_by,created_at"
      + "&processed_at=is.null&order=created_at.asc&limit=" + (Number(limit) || 50);
    const res = await fetch(url, { headers: supabaseHeaders(), signal: ac.signal });
    if (!res.ok) return { ok: false, rows: [], error: `HTTP ${res.status}` };
    const rows = await res.json();
    return { ok: true, rows: Array.isArray(rows) ? rows : [], error: null };
  } catch (err) {
    return { ok: false, rows: [], error: err && err.name === "AbortError" ? "timeout" : String(err && err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stamp one submission as published, so it is never ingested twice.
 *
 * The payload is `{processed_at}` and nothing else, deliberately: anon holds a column-level
 * grant on that column alone (db/schema.sql 5c), so a payload naming any other column would be
 * refused on privileges. That is the intended behaviour, not a limitation to work around.
 */
export async function markSubmissionProcessed(id, timeoutMs = 10000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE}/news_submissions?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: supabaseHeaders({ "content-type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({ processed_at: new Date().toISOString() }),
      signal: ac.signal,
    });
    return { ok: res.ok, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Trending adds and drops. Signal only — a count, not a story. Used to rank which of several
 * items about the same player is worth a row, never to write one.
 */
export async function fetchTrending(limit = 50) {
  const out = { add: new Map(), drop: new Map(), errors: [] };
  for (const kind of ["add", "drop"]) {
    try {
      const rows = JSON.parse(
        await getText(`https://api.sleeper.app/v1/players/nfl/trending/${kind}?limit=${limit}`),
      );
      for (const r of rows || []) {
        if (r && r.player_id) out[kind].set(String(r.player_id), Number(r.count) || 0);
      }
    } catch (err) {
      out.errors.push({ kind, error: err.message || String(err) });
    }
  }
  return out;
}
