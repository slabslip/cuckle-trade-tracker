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
