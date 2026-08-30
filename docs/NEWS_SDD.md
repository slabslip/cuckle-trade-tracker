# News and Alerts — spec and the automation plan

What ships today, what it is actually built on, and how the daily feed should be automated.

**Status.** Phase 1 is built and live: the sources, the player→manager mapping, `data/ui/news.json`,
the scrollable feed on league home, and a template-based voice behind one replaceable seam. Phase 2
— the agent that refreshes the feed daily — is **specified here and deliberately not built**, because
the user asked for the feed first and for the automation to be strategised before it is written.

Companion files: [`news-sources.mjs`](../news-sources.mjs) (the adapters and the probe results),
[`news-voice.mjs`](../news-voice.mjs) (the seam), [`news-sync.mjs`](../news-sync.mjs) (the pipeline
and the schema).

---

## 1. What the feature is

NFL news, filtered to the ~337 players actually on this league's ten rosters, addressed by name to
the manager who owns the player, written in a needling locker-room register. Everything else in the
NFL news cycle is dropped, which is most of it — see §4.

News is **quarantined from the value book by design**. It never touches the trade values, the Value
Adjustment, the lens windows, `today_delta`, partner grades or any ranking. It is a separate payload
(`data/ui/news.json`) with a separate loader and a separate failure mode, and `generate-page.mjs`
carries a generate-time guard that fails the build if `renderNews()` so much as references `fmt()`,
`tapeMargin()`, `applyVa()`, `windowScore()`, `today_delta` or `value_adjust`. A headline must never
be able to move a number.

---

## 2. Sources — what is real, verified from the build VM on 2026-08-30

### The primary source is Sleeper's GraphQL, and that was a surprise

Sleeper's documented REST API has **no news**. Probed and confirmed: `/v1/news/nfl`, `/news/nfl` and
`/v1/nfl/news` all 404 to `sleeper.com/404`, and `/v1/players/nfl/news` answers the literal `null`.

But `https://api.sleeper.app/graphql` is open and unauthenticated, and its schema exposes 240 query
fields including **`get_player_news(sport, player_id, limit)`**. It returns a `PlayerNews` with
`metadata { title, description, analysis, url, topic_id }`, `source`, `source_key` and `published`
— i.e. **actual news prose**, aggregated from Rotowire, RotoBaller and FantasyPros.

It requires `player_id` (`String!`), so there is no "today's NFL news" call; you ask per player.
GraphQL aliases batch it — 20 players in one POST answered in ~163ms — so the whole league costs
about 17 requests.

This is the primary source for one reason that outweighs everything else: **it is keyed by
`player_id`, so attribution is exact**. There is no name matching, therefore no possibility of
telling the wrong manager their running back is hurt. See §5.

It is also **undocumented**. It can change shape or close without notice, which is exactly why RSS
stays wired up.

### RSS is the documented, stable fallback

Verified reachable, with a parsed item count from a live fetch:

| Feed | URL | Items | Notes |
| --- | --- | ---: | --- |
| ESPN NFL | `www.espn.com/espn/rss/nfl/news` | 18 | CDATA, RFC-822 with `EST` |
| Rotowire NFL | `www.rotowire.com/rss/news.php?sport=NFL` | 5 | Player-first headlines. 12-hour clock date, see below |
| CBS NFL | `www.cbssports.com/rss/headlines/nfl/` | 36 | Whitespace-padded tag bodies |
| Yahoo NFL | `sports.yahoo.com/nfl/rss.xml` | 50 | Also ships `content:encoded` |
| ProFootballTalk | `profootballtalk.nbcsports.com/feed/` | 30 | Terse, transaction-heavy |

Verified **not** reachable:

- **FantasyPros** — `/nfl/rss/news.php` answers a 404 HTML page; `/rss/nfl-news.xml` answers
  HTTP 200 with a **zero-byte body**. Its content is still reached indirectly: FantasyPros is one of
  the three sources Sleeper's GraphQL aggregates.
- **NFL.com** — `/feeds/rss/news` 404s.

Also reachable and currently unused, held in reserve for §7: FoxSports NFL
(`api.foxsports.com/v1/rss?...&tag=nfl`, 19 items), BBC American Football (52), `r/nfl` (25).

### Adam Schefter's Twitter/X is not possible, and the workaround was verified rather than assumed

The user asked specifically for Schefter's account. Stating it plainly:

- `api.twitter.com/2/tweets/search/recent?query=from:AdamSchefter` → **HTTP 401**. A bearer token is
  required and a bearer token now requires a **paid X API tier**.
- `x.com/AdamSchefter` → HTTP 200, and the body is a JavaScript application shell containing **no
  tweets**. Rendering it needs a real browser, and scraping it violates X's terms and breaks
  whenever the shell changes.
- `nitter.net/AdamSchefter/rss` → **HTTP 410 Gone.** The public Nitter instances are dead.

**No scraper is built, and none should be.**

The workaround captures nearly all of the value at zero cost, and it was confirmed in a live payload
rather than argued from first principles. The Rotowire NFL feed item for George Kittle fetched on
2026-08-30 reads:

> George Kittle: Expected to practice this week — *"Kittle (Achilles) is expected to practice this
> week as he continues his push to play in the 49ers' season opener against the Rams in Australia,
> **Adam Schefter of ESPN reports**."*

Schefter breaks on X; ESPN's own feeds and every aggregator restate it within minutes, with
attribution. An RSS path gets the substance, a few minutes later, for free and within terms.

**If the user still wants the tweets themselves**, that is a paid X API subscription and a decision
only they can make. Nothing here signs up for anything. It would also not change the feed much: the
same facts already arrive through the free path.

**Update: the user has decided to pay** — X's 2026 pay-per-use tier, ~$4.50/month at this volume.
The findings above are unchanged and still the reason there is no scraper: what is now possible is
the *paid, documented, in-terms* API and nothing else. The ingest module is built and inert in
[§10.3](#103-x-ingest--x-sourcemjs); the token is not provisioned, and until it is, the free RSS
path above is still what the feed runs on.

### Sleeper's other endpoints — signal, not stories

- `/v1/players/nfl/trending/add` and `/trending/drop` are free and real, returning
  `[{ player_id, count }]`. **No text.** 167,184 adds means something happened to a player, which is
  useful for ranking and useless for saying what. Stored on each row as `trending_add`.
- `/v1/players/nfl` (the 12,225-player dictionary) carries news-adjacent fields, measured:
  `news_updated` populated for **8,208** players and moving live; `injury_status` **735**;
  `injury_body_part` **658**; `injury_notes` **88**, and terse — literally `"Soreness"`, `"Surgery"`;
  `practice_description` populated for exactly **1**. So a reliable *when did news break* clock and a
  reliable *is he hurt* flag, and no prose worth printing.

### The parser

Hand-rolled, no dependencies, ~120 lines in `news-sources.mjs`. It extracts `<item>`/`<entry>`
blocks with one regex, then reads named children as text, unwrapping CDATA. It does **not** build a
tree or resolve namespaces, because every feed checked emits flat text or CDATA children and a real
parser would be more code with more ways to be wrong. Anything it cannot read comes back `""` and
the item is dropped, which is the correct failure for a news feed.

Two things it does handle because the live feeds required it:

- **Atom's attribute link** — `<link rel="alternate" href="…"/>` carries no text body.
- **Rotowire's date** — `"Sun, 30 Aug 2026 7:58:00 AM PDT"` is a 12-hour clock with a meridiem *and*
  a zone name, which `Date.parse` returns `NaN` for. It is normalised to 24-hour and re-parsed. An
  unparseable date becomes `null`, **never `Date.now()`** — a missing timestamp must read as missing
  rather than as "this broke one second ago".

Entity decoding is narrow on purpose, and refuses to reconstitute `<` or `>` from numeric escapes.
Quotes and ampersands *are* decoded, because they are ordinary prose (`SportsLine's` arrives as
`&#039;`) and `esc()` escapes them at the point of use, so dropping them costs readability for no
security gain.

---

## 3. The player → manager mapping

No new sync. `sleeper-sync.mjs` already writes `data/rosters_now.json` from
`/v1/league/<id>/rosters` (roster_id, owner_id, players[]) and `data/ui/members.json` carries the
canonical manager name per `user_id`. `news-sync.mjs` is a **consumer** of both. Player names come
from `data/players.nfl.json`, the same cached dictionary `sleeper-sync.mjs` maintains (gitignored,
14.6MB, refetched when older than 24h).

Result: `player_id → { user_id, manager, roster_id }` over 337 players across 10 rosters, with 0
duplicate entries. Both paths resolve through that one map, so a row's `user_id` is always a real
seat — and `news-sync.mjs` refuses to write a file at all if any row is addressed to a `user_id`
that is not in `members.json`.

---

## 4. Match rate, measured on a real day of headlines

139 RSS items fetched live on 2026-08-30 across the five feeds:

| Outcome | Items | Share |
| --- | ---: | ---: |
| Matched a rostered player | **25** | 18.0% |
| Named no rostered player — dropped | 108 | 77.7% |
| Named **two** rostered players — dropped as ambiguous | 4 | 2.9% |
| Older than the 10-day window | 2 | 1.4% |

**The 77.7% is the expected answer, not a failure.** Ten rosters hold 337 of roughly 2,000 relevant
NFL players. Most NFL news — league-wide roster-cut trackers, betting models, All-Pro predictions —
touches nobody here, and dropping it is the whole point of the feature.

The Sleeper GraphQL path contributed **1,675 items** over the same window, every one already
attributed. Combined, 942 rows matched, 675 survived deduplication, and the newest 60 ship.

All ten managers were addressed. Category mix reflects the calendar — late August is preseason
blurbs, so most titles carry no strong signal and fall to the catch-all; in season the injury,
trade and depth-chart shares rise.

### Two mis-attributions this found, and what they changed

Both were caught by **reading the output**, not by a test, and both pushed the design the same way.

1. **Rotowire's *"Jalon Daniels: Wins backup QB job"* was addressed to Baker Mayfield's owner.**
   Daniels is not rostered; the *summary* mentions Mayfield as the starter he is backing up, and the
   matcher was searching title *and* summary. This is precisely the failure that matters. Fixed:
   **attribution reads the title only.** A news item's subject is named in its title; a summary
   names teammates, coaches and the reporter who broke it.

2. **An arrest was rendered as *"{player} is suspended"*, and a Trevor Lawrence ranking piece as
   injury-recovery news.** Same cause on the classification side — the summary supplied words the
   headline never said. Fixed: **classification also reads the title only**, and an `off_field`
   category was added ahead of `suspension` so an arrest is never described as a suspension.

The second fix has a deliberate consequence: an unclear headline now falls through to the `news`
catch-all, whose templates assert only that news exists about a player, which is always true. A
misclassification therefore costs a *generic* line rather than a *false* one.

### The refusal rule

A **full name** must appear in the title, on word boundaries, suffixes and punctuation removed.
Surnames alone are never matched — ESPN's *"Colts WR Allen arrested on drunk driving charges"* is
dropped, and that is correct, because "Allen", "Jones" and "Smith" appear in dozens of unrelated
headlines a day. Only rostered players are indexed, which removes almost every collision before it
can happen; the famous one is real, since Sleeper's dictionary holds both the Bills quarterback
Josh Allen and an inactive offensive guard of the same name.

**Two rostered players in one title means the item is dropped, not resolved.** *"Raiders expected to
name Kirk Cousins Week 1 starter over No. 1 pick Fernando Mendoza"* is genuinely about two owned
players and picking one would be a guess.

---

## 5. `data/ui/news.json`

Versioned (`v: 1`), one row per item, documented in full in the `bookOf()` comment in
`news-sync.mjs`. The UI ignores a `v` it does not know rather than reading it optimistically.

Fields: `id` (stable — day + player + headline hash, so re-runs do not churn the file),
`published`, `source`, `source_label`, `source_url`, `player`, `player_id`, `player_team`,
`player_position`, `user_id`, `manager`, `category`, `severity`, `upbeat`, `headline`, `summary`,
`league_line`, `trending_add`, `match` (`player_id` | `name`), `also` (other outlets that carried
the same story).

`severity` is a **sort weight only, never a colour**. `--red` and `--green` mean "you are down or up
value" on every other screen in this app, and a hamstring is not a value delta.

Every string field is third-party input except `league_line`, `category` and `match`. Summaries are
clipped to 240 characters at a word boundary — RotoBaller's `analysis` runs to full paragraphs, and
untrimmed they were most of a 70KB payload for text nobody reads on a phone. Shipped size: ~47KB for
60 rows.

---

## 6. The voice

One seam: **`leagueLine(item, ctx)` in `news-voice.mjs`**. It is called once per item by
`news-sync.mjs` and its output is stored in `league_line`. Nothing else in the pipeline knows how a
line is made and the UI only reads the stored string, so the voice can be replaced — different
templates, a different register, or an LLM behind the same signature — by editing that one file.
Ingest does not change, the UI does not change, the schema does not change.

The first pass is **deterministic templates**: no npm, no API key, no network in the copy step. The
variant is an FNV-1a hash of the item id rather than `Math.random()`, so a story keeps its line
forever, `news.json` stays diffable in git, and a re-run does not rewrite fifty rows for no reason.
Eight banks, 44 variants; the `news` catch-all has the most because most weeks most rows land there.

The rules, because the names are real people who know each other: needle the **roster decision**,
the **timing** or the **player**, never the person; nothing about appearance, family or money;
address the manager by their Sleeper name in second person; **never invent a fact** — the line
frames the headline and the headline is printed beside it.

---

## 7. Phase 2 — the daily agent

### Recommendation: GitHub Actions on a cron, committing `news.json` to `main`

**Take this one.** The comparison is not close for this app.

The site is a static build deployed by GitHub Pages from `main`, and every data file the page reads
is a committed artifact produced by a Node script. A scheduled workflow that runs `news-sync.mjs`,
commits the changed `news.json` and pushes to `main` is **the mechanism that already exists**, used
once more. Pages redeploys on the push. Nothing new has to be understood, and there is no second
runtime dependency in the request path.

```yaml
# .github/workflows/news.yml — NOT COMMITTED. This is the proposal.
name: news
on:
  schedule: [{ cron: "0 12,23 * * *" }]   # 08:00 and 19:00 US Eastern
  workflow_dispatch:
permissions: { contents: write }
concurrency: { group: news, cancel-in-progress: false }
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      # players.nfl.json is gitignored and 14.6MB; cache it rather than refetch every run.
      - uses: actions/cache@v4
        with:
          path: data/players.nfl.json
          key: players-${{ github.run_id }}
          restore-keys: players-
      - run: node sleeper-sync.mjs      # rosters only; it is already idempotent
      - run: node news-sync.mjs
      # No generate-page.mjs and no apply-value-adjust.mjs. The page reads news.json at
      # runtime, so nothing needs regenerating, and the value book must not move on a cron.
      - run: |
          git config user.name  "cuckle-news-bot"
          git config user.email "news@users.noreply.github.com"
          git add data/ui/news.json
          git diff --staged --quiet || git commit -m "News: $(date -u +%Y-%m-%dT%H:%MZ)"
          git push
```

Costs nothing: public repos have unlimited Actions minutes, and this is a sub-minute job.

Two things the workflow must be careful about, both already true of the scripts:

- **It must not run `apply-value-adjust.mjs` or `generate-page.mjs`.** The page fetches
  `news.json` at runtime, so a data-only commit is enough. Running the value pipeline on a cron
  would let a scheduled job move the trade book, which is the one thing news must never do.
- **`DATA_V` is a cache key on the *page*, and the workflow does not bump it.** `getJson()` appends
  `?<DATA_V>`, so a new `news.json` under an unchanged `DATA_V` can be served from cache. Pages sets
  a short `max-age` on JSON and the practical staleness is minutes, but if it bites, the fix is to
  give the news fetch its own buster — `?news=<generated>` read from a tiny `news.head.json`, or
  simply `?t=<hour>` — rather than to bump `DATA_V` from a bot and invalidate the whole payload.

### The alternative: write to Supabase, read live client-side

Supabase is already provisioned and working for votes (project `gtqyvnkkjiksmmtmzubw`, see
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md)), so a `news` table with an `anon`-readable RLS policy and
a writer using the service key from Actions secrets would work, and the feed would update **without
a rebuild**.

Rejected for this feature, for four reasons:

1. **It does not remove the runner.** Something still has to fetch RSS on a schedule. Supabase Edge
   Functions have their own cron, but that is a second deploy target and a second language runtime
   to maintain for no gain — or it is still GitHub Actions, just writing to Postgres instead of to
   git.
2. **It adds a live dependency to a screen that currently has none.** `SUPABASE_SETUP.md` records
   that the **free tier pauses projects after inactivity**, and the votes adapter is deliberately
   built so a paused project degrades to a caption. News as a live read would mean a paused project
   empties the feed. As a committed file, the feed is exactly as available as the site itself.
3. **It costs the git history.** `news.json` in the repo means every day's feed is diffable and
   revertable, and a bad run — a mis-attributed row, a voice regression — is one `git revert`. In
   Postgres it is a `DELETE` nobody can review.
4. **The freshness gain is worth little here.** This is NFL news for a ten-person dynasty league.
   Twice a day is fine; nobody needs sub-minute latency on a Rotowire blurb.

**Where Supabase would win** and should be revisited: if the league wants to *react* to news —
emoji, comments, "called it" — that is per-user writes on a shared surface, which is exactly what
the votes table already does well and exactly what a committed JSON file cannot do.

### Cadence

**Twice a day, 08:00 and 19:00 US Eastern.** The morning run catches overnight and early-morning
reports (the Kittle item above landed at 07:58 PT); the evening run catches practice reports and
inactives. In-season Sunday is the exception — real injury news breaks during games — but a
scrolling feed of what happened is a morning-after artifact, not a live game tool, and this app has
no live scoring anywhere else. Do not go hourly: it multiplies commits, it multiplies the chance of
shipping a mis-attributed row, and nothing in the feed decays that fast.

GitHub's `schedule` triggers are best-effort and can be delayed by many minutes under load, and are
**disabled automatically after 60 days of repository inactivity** — worth knowing before someone
concludes the feed is broken.

### Deduplication

Already built, and it does real work: 942 matched rows collapsed to 675, and the Keenan Allen DWI
story arrived from **six** outlets and shipped as one row reading "+5 more".

The key is `player_id` + first six meaningful words of the normalised title + calendar day. Tight
enough that two genuinely different stories about one player on one day both survive; loose enough
that the same story retitled by three outlets collapses. The kept row is the **earliest published**
— the outlet that had it first — and the rest are recorded in `also`.

Across runs, `id` is stable (day + player + headline hash), so a story that is still in the window
tomorrow keeps its identity and its line. What is **not** yet handled and should be, once the cron
exists: a follow-up that supersedes rather than repeats ("Questionable" → "Ruled out"). The clean
approach is a per-player *thread*, keyed on `player_id` + category, showing the latest state with
the earlier item collapsed underneath. That is a schema change (`supersedes`, or a `thread_id`) and
therefore a `v: 2`.

### Retention and pruning

- Ingest window: **10 days**. Older items are dropped at fetch.
- Shipped rows: **60**, newest first. A phone scroll box is not an archive.
- Both are constants at the top of `news-sync.mjs` (`MAX_AGE_DAYS`, `MAX_ITEMS`).

`news.json` is rewritten whole every run, so the file cannot grow without bound; at ~47KB for 60
rows it is a fifth of `league.json`. The **git history** does grow — two commits a day of a 47KB
file. That is roughly 34MB a year of loose objects before compression, and far less after, which is
fine for years. If it ever matters, the answer is to stop committing the file and move to the
Supabase option, not to prune history.

### When a source dies

Feeds are fetched in parallel and **each fails on its own**: a dead source costs its own items and
nothing else. Every run records per-source status in `news.json.sources` (`{ id, label, ok, items }`),
which is the triage surface — a source at `ok: false` for a week has moved or closed.

Ordered by likelihood:

1. **The Sleeper GraphQL endpoint changes or closes.** It is undocumented, so this is the most
   likely single failure and it is the *primary* source — 54 of 60 rows on the measured run. RSS
   keeps the feed alive at a lower volume, with name matching and therefore with the refusal rate in
   §4. This is exactly why the RSS path is wired up rather than described.
2. **A feed URL 404s.** FantasyPros already did. Drop it from `RSS_FEEDS`, add one from the reserve
   list in §2. One line.
3. **A feed changes shape** — the parser returns 0 items where it used to return 30. `sources[].ok`
   is `true` with `items: 0`, which is the signal. The workflow should fail loudly on it: **if the
   run produces fewer than, say, 5 rows when the last committed file had more than 20, do not
   commit** — an empty feed is worse than a stale one.
4. **A feed starts rate-limiting or blocks the UA.** The adapters send a descriptive User-Agent
   with a repo URL, which is the polite form and the one least likely to be blocked.

The one failure that must never be silent is the **absent** feed. That already happened once during
this build: rebasing onto the League Data Sets dropdown left `renderLeagueHome` as
`+ dataSetPanel();` followed by `+ renderNews();` — a terminated return and then dead code. Valid
JavaScript, `node --check` clean, every other guard satisfied, and the feed simply not on the page.
Only the screenshot showed it. There is now a generate-time assertion that `renderLeagueHome`
composes `renderNews()` *inside* its return.

### LLM-written copy — what it would cost and what the user would have to provide

Templates are honest and repeatable and they are not as funny as a model would be. 44 variants
across 8 banks stops the feed reading identically today; at two runs a day for a season, a regular
reader will start recognising them.

**Nothing here signs up for anything.** If the user wants this, here is exactly what it takes.

**What changes in the code:** one function. `leagueLine(item, ctx)` becomes async and calls a
model with the headline, the player, the manager's name and the category, plus a system prompt
carrying the voice rules and — the valuable part — **the user's own example lines**. Ingest and UI
are untouched; that is the entire reason the seam exists. Keep the templates as the fallback for
when the API is down or the key is missing, so a failed call costs variety rather than the feed.

**What the user must provide:**

1. **An API key**, added as a repository secret (Settings → Secrets and variables → Actions → New
   repository secret), named something like `NEWS_LLM_KEY`, and exposed to the step as
   `env: { NEWS_LLM_KEY: ${{ secrets.NEWS_LLM_KEY }} }`. It must **not** be committed —
   unlike the Supabase `anon` key, which is browser-safe by design, this key spends money.
2. **A choice of provider**, which is theirs to make. Any of the major hosted APIs suits this; all
   are called over plain HTTPS with `fetch` and none needs an npm package, so the no-dependency rule
   survives.
3. **5–15 example lines in their own voice**, which matters more than the model. The prompt should
   quote the user's writing, not describe it.

**Cost shape.** This is a genuinely small workload: **60 rows twice a day**, each a short prompt in
and one sentence out — order of 400 tokens in, 60 out. That is roughly 55,000 input and 8,000 output
tokens per run, about **1.5M input tokens a month**. On the small/cheap tier of any current
provider that is **cents to low single-digit dollars a month**; on a frontier model it is still
comfortably under a few dollars. Published per-token prices move constantly, so the user should read
the provider's current page rather than a number written here — but the *shape* is "trivial", and the
control that matters is the cap:

- **Only generate for rows that are new.** `id` is stable, so carry `league_line` forward for any
  row already in the previous `news.json` and call the model only for genuinely new items. In steady
  state that is a handful of rows per run, not 60.
- **Cache the line with the row.** It is already stored in `news.json`; never regenerate a line
  that exists.
- **Set a hard per-run call budget** and fall back to templates past it, so a runaway loop cannot
  produce a surprise invoice.

**One editorial risk worth stating.** A model given "be funny and mean about your friends" will
occasionally produce a line about a *person* rather than about a roster decision, and the whole
premise is that these are ten friends whose names are real. The template pass cannot do this because
every line was written by hand. If the LLM path is taken, the prompt needs the §6 rules stated as
hard constraints, and the run should keep a human-readable diff of generated lines so a bad one is
caught in review before it reaches the page.

---

## 8. Failure modes, worst first

1. **A row addressed to the wrong manager.** The worst outcome available, and worse than no news at
   all — it is publicly wrong, it is wrong about a person, and it makes every other row suspect.
   Defences: the primary source is keyed by `player_id` so it cannot happen there; the RSS path
   matches full names in the **title only**; ambiguous titles are **dropped**; and `news-sync.mjs`
   refuses to write the file if any row names a `user_id` absent from `members.json`. All four exist
   because the second one was found failing on real data (§4).
2. **A line that states something the source did not say.** An arrest rendered as a suspension.
   Defence: classify on the title only, and let unclear headlines fall to a catch-all whose
   templates assert nothing beyond "there is news about this player".
3. **XSS from a headline.** Every field is third-party text from the open internet — the highest-risk
   surface in this app. Defences in `generate-page.mjs`, all nine verified to fire by breaking them:
   a **negative** assertion over `renderNews()` that refuses any `+ it.field +` not wrapped in
   `esc()`; the ten specific `esc()` call sites; an http(s)-only `href` gate asserted with its
   escapes intact (a feed can ship `javascript:`, and a lone backslash in this template literal is
   swallowed); and `rel="noopener noreferrer"` on every outbound link.
4. **A stale feed read as current.** Defence: no timestamp is ever invented — an unparseable date is
   `null` and the row prints no relative time rather than "just now".
5. **The feed empties.** A source change that yields 0 rows should **not** be committed over a good
   file; see §7. An empty `news.json` is also handled gracefully by the UI, which shows "Nothing
   breaking" rather than an error.
6. **The feature is absent and everything passes.** See §7 — the semicolon. The counter is an
   assertion on the composition, and reading the screenshots.

---

## 9. Open questions for the user

1. **The voice.** The templates are a first pass, explicitly built to be replaced. Send 5–15 lines
   in your own register and they go straight into `news-voice.mjs` — or into the LLM prompt.
2. **Cadence.** Twice a day is the recommendation. In-season Sunday evening could be a third run.
3. **The LLM path.** Worth cents a month, and it needs a key you own and a provider you choose.
4. **Whether news should ever be per-seat.** Today the feed is league-wide on league home, showing
   everyone's news. A manager's own tab could carry only theirs. That is additive and cheap — the
   rows already carry `user_id`.
5. **Whether "Ruled out" should supersede "Questionable"** rather than sit beside it. That is the
   thread model in §7, and a `v: 2`.
6. **Whether `contract` should be its own category.** §10.1: it needs a `news-voice.mjs` entry, a
   template bank *and* a `NEWS_CATS` label in `generate-page.mjs`, and without the third it would
   render as "News" on screen while passing every assertion. Contract news currently classifies as
   `trade`. Say the word and it is three small edits and a regenerate.
7. **Whether the notify threshold is in the right place.** 0.80 means a nickname, a bare surname
   and a collision resolved by ranking can all print but never ping. That is a judgement about how
   much a wrong ping costs relative to a missed one, and it is the user's to make — one constant,
   `NOTIFY_MIN` in `news-match.mjs`.

---

## 10. Phase 3 — @AdamSchefter on X, and @mentions in the league Discord

**Status: built, unwired, and deliberately not scheduled.** Both credentials are outstanding, and
the user asked to review before anything runs automatically. Nothing in this section is on a cron,
no workflow file is committed, and with no credentials present every part of it is a no-op.

Four new files, and one flag on an existing one:

| File | What it is | Runs today? |
| --- | --- | --- |
| [`news-match.mjs`](../news-match.mjs) | free text → rostered players, with confidence | On demand: `--corpus-score`, `--text` |
| [`x-source.mjs`](../x-source.mjs) | X timeline ingest | No-op without `X_BEARER_TOKEN` |
| [`discord-notify.mjs`](../discord-notify.mjs) | webhook sender | Dry run by default |
| [`news-fixtures.mjs`](../news-fixtures.mjs) | harvests real Schefter wording into fixtures | Only on `--harvest` |
| `news-sync.mjs --corpus` | freezes a live RSS day with its own verdicts | Only on `--corpus` |

`news-sync.mjs` is otherwise unchanged in behaviour. `matchPlayer()` and the index builders are now
exported and `main()` is guarded to the direct invocation, so a test can run the shipping matcher
without firing a live build.

### 10.1 The matcher, and why it is a second one

§4 records the two mis-attributions this feature shipped and the fix both pushed towards: **read the
title only**. An RSS item is a title plus a summary, and a summary names teammates, coaches and the
reporter who broke it — which is exactly how "Jalon Daniels: Wins backup QB job" reached Baker
Mayfield's owner.

**A post on X has no title/summary split.** There is one blob of text, so the title-only defence
does not transfer and something has to replace it. `news-match.mjs` is that replacement, and it is a
separate matcher on purpose: RSS should keep refusing on ambiguity, and nothing in the new path
should be able to change what the shipping feed does today.

Four things replace the title-only rule.

**1. Only rostered players are indexed.** 337 of 12,225. Inherited from `matchPlayer()`, which is
right about it.

**2. Collisions are resolved against the whole dictionary, not the roster.** This is the part
`matchPlayer()` cannot do and the part that matters most. Sleeper has **357 colliding normalised
names**. Indexing rosters only means a post about the *Jaguars linebacker* Josh Allen would be
addressed with total confidence to whoever owns the *Bills quarterback*, because the linebacker was
never a candidate. So every name hit is re-opened against all 12,225 players and ranked with
`nameCandidateScore()` from `price-today.mjs` — the same ranking whose absence mispriced four
players — plus a roster bonus and team context. **If the winner is not rostered here, the item is
refused.** A same-named stranger costs a drop, not a wrong address.

**3. Team context, weighted heavier than the roster bonus.** Rostered is +12; a named team is +14
and a contradicted team is −12. The asymmetry is the design, and it was sized against a real
collision rather than chosen: Justin Jefferson is a Vikings receiver this league rosters **and** a
Browns linebacker it does not. At equal weights, "the Browns say Justin Jefferson will not play"
tied 16–16 and fell through to a player-id tie-break — a coin toss deciding whose phone rings.
Weighted this way the Browns linebacker wins the sentence outright and the item is refused.

| Sentence | Winner | Verdict |
| --- | --- | --- |
| "Justin Jefferson will not play Sunday" | Vikings WR, 26–6 | matched, 0.65 — published, no ping |
| "The **Vikings** say Justin Jefferson will not play Sunday" | Vikings WR, 40–−6 | matched, 0.85 — ping |
| "The **Browns** say Justin Jefferson will not play Sunday" | Browns LB, 20–14 | **refused** |

**4. Confidence, with two thresholds**, because "put this in a scrolling feed" and "ring somebody's
phone" are different bets. **Publish ≥ 0.55. Notify ≥ 0.80.**

| Evidence | Confidence | Publishes | Pings |
| --- | ---: | :---: | :---: |
| Full name, unique in the dictionary | 0.90 | yes | **yes** |
| Full name, collision settled by team context | 0.85 | yes | **yes** |
| Surname plus team context | 0.72 | yes | no |
| Alias ("Zeke", "CMC", "AJB") | 0.70 | yes | no |
| Full name, collision settled by ranking alone | 0.65 | yes | no |
| Surname alone | 0.58 | yes | no |
| Own team also named | +0.05 | | |
| Non-news wording (promo, mock draft, condolence) | −0.20 | | |

The notify line sits **above every form of evidence that involved a judgement call**. Only a name
that needed no interpretation can ping anyone, because a notification is the one output that cannot
be quietly corrected after it lands on ten phones. Publish-but-don't-notify is the normal state for
weaker matches, not an error. The −0.20 non-news penalty is sized so the strongest evidence lands at
0.70: a listicle naming your player still reaches the feed and cannot reach your phone.

**Several rostered players in one post emit one item per manager.** The RSS path drops these and for
RSS that is right — a *title* naming two owned players has one subject and picking it would be a
guess. For free text the drop is the wrong trade: the most valuable posts name two players by
construction (a trade has two sides and genuinely affects two managers), and the claim a per-manager
row makes is weaker — *"this story mentions your player"*, not *"this story is about your player"* —
which is true for both. The voice supports it, because `leagueLine()` is keyed on category and
frames the headline printed beside it rather than asserting a subject. It is bounded at
**MAX_SUBJECTS = 3**: past that the text is a cut tracker or an inactives list, which is not news
for anyone in particular, and it is refused outright rather than fanned out to six managers.

**Surnames are allowed, under three conditions at once.** `matchPlayer()` never matches a bare
surname and on headlines that is correct, but real reporter wording is full of them — "Kittle
(Achilles) is expected to practice", "The Texans placed Higgins (knee) on IR" — and refusing all of
them drops most of the corpus. So a surname needs: unique among the 337 rostered players; **no
dictionary namesake currently holding an NFL team** (the Josh Allen guard, and what stops "the Jets
are releasing defensive tackle Mazi Smith" from reaching a different Smith's owner); and
**capitalised in the raw text**. That last one earns its place on live data: the corpus contains
*"Eagles News: Philadelphia's most likely first-time Pro Bowl candidate"*, where lower-case "likely"
is the only thing between Isaiah Likely's owner and a wrong row. Where the text is **title-cased**,
capitalisation says nothing at all, so surname matching switches off entirely rather than run a
check that cannot fail — §3a of the audit, applied before it bit.

A surname beside a full name is treated as **context, not subject**, and the surname pass only runs
when no full name matched. That is the §4 lesson in a new place: the weakest evidence in a text that
already has strong evidence is usually a teammate. The cost is that one phrasing of a story can
reach fewer managers than another; the notifier's dedupe absorbs it.

**Categories are the existing vocabulary**, imported from `news-voice.mjs` — `injury` (with
`upbeat` selecting the `injury_good` template bank), `off_field`, `suspension`, `trade`,
`depth_chart`, `breakout`, `news`. `news-match.mjs` exports `CATEGORY_IDS` from `CATEGORIES` and the
test asserts every category the fixtures produce is in it, so the matcher cannot invent one the
voice and the UI do not know. **There is no `contract` category and this change does not add one**;
contract news currently classifies as `trade`, since `CATEGORIES.trade` already tests "agree to
terms" and "signs with". Adding one is a `news-voice.mjs` entry *and* a template bank *and* a
`NEWS_CATS` label in `generate-page.mjs`, and without the third it would render as "News" on screen
while passing every assertion — precisely the §6d.1 failure mode. It is listed in §9 as an open
question rather than half-done here.

### 10.2 Validation — 139 real items, 24 real Schefter sentences

The matcher cannot be exercised against tweets: there is no token. The tempting move is to invent
fixtures in an imagined Schefter register and report a pass rate against them, which measures the
imagination and nothing else. Two committed corpora instead, both third-party text.

**`data/fixtures/rss-corpus.json`** — one live day of the five RSS feeds, verbatim, **with
`news-sync.mjs`'s own `matchPlayer()` verdict on every item**, written by `news-sync.mjs --corpus`.
The answer set is produced by the code that ships, per item rather than in aggregate, so a
divergence reads as a specific headline. Feeds churn hourly, so freezing it is also the only way the
comparison is reproducible tomorrow.

| | Shipping RSS matcher | `news-match.mjs` on the same 139 titles |
| --- | ---: | ---: |
| Attributed to a rostered player | **27** | **32** (28 single-subject, 4 multi) |
| Named nobody | 108 | 108 (89 no candidate, **19 refused with a stated reason**) |
| Dropped as ambiguous | 4 | 0 — all four resolve |
| Baseline matches lost | — | **0** |
| Baseline matches re-attributed to someone else | — | **0** |

*(NEWS_SDD §4 records 25/108/4 from the run that day. This corpus was harvested later the same day
and the feeds had moved: `news-sync.mjs --report` reads 27 matched / 107 no-player / 4 ambiguous /
1 stale over the same 139. The corpus applies no age cutoff, so its 108 is the 107 plus the stale
item, which also named nobody. Same code, same day, different hour.)*

The five gains, all read by hand and all named in the test so a future gain cannot slide in unread:

- Four are the items the RSS path dropped as ambiguous. Three are genuinely about two owned players
  ("Raiders expected to name Kirk Cousins Week 1 starter over No. 1 pick Fernando Mendoza") and now
  reach both managers; one is *"Predicting first-time NFL All-Pros … Caleb Williams, Jahmyr Gibbs
  among young stars"*, which reaches both at 0.70 — published, unable to ping.
- One is new: *"Miami Dolphins 2026 roster cuts tracker: Miller, Gronowski cut leaving Willis only
  QB"*. "Willis" plus "Dolphins" identifies Malik Willis, and him being the only quarterback left
  is real news for his owner. 0.72, so it publishes and does not ping.

The 19 refusals all name their reason, and they include every headline this document already
flags as a required drop: *"Jalon Daniels: Wins backup QB job"* (the mis-attribution), *"Colts WR
Allen arrested on drunk driving charges"* (§4's deliberate surname drop), *"Report: Jets waive DT
Mazi Smith"*, *"Jaguars to trade TE Hunter Long to Cardinals"*.

**`data/fixtures/schefter-quotes.json`** — **24 sentences** that quote or credit Adam Schefter,
harvested by `news-fixtures.mjs --harvest` from a live fetch of the five RSS feeds plus Sleeper's
`get_player_news` over the rostered players. Sources: Rotowire via Sleeper (11), RotoBaller via
Sleeper (8), ESPN (2), Rotowire direct (1), FantasyPros via Sleeper (1), ProFootballTalk (1) —
six publishers, so the wording is not one outlet's house style.

**What is honest to claim about them.** They are **not tweets**. They are third parties restating
his reports and crediting him — *"The Jets are releasing defensive tackle Mazi Smith, Adam Schefter
of ESPN reports."* The useful part is that the player names, team names, positions, injury nouns and
transaction verbs are real. Each fixture stores `verbatim` (the publisher's text, untouched) and
`tweet_form` (that text with **one** credit clause removed and nothing else changed), and records
the exact clause removed in `stripped`, so the transform is reversible by inspection. 20 of 24 were
derived this way; the other 4 matched no listed clause and `tweet_form` equals `verbatim`. No
fixture invents words.

Against the 24: **19 reach at least one manager, 12 clear the notify line**, and eight hand-checked
attributions are pinned by name in the test. The five that reach nobody are correct — a promo
("Adam Schefter's cheat sheet"), two players nobody rosters (Kyle McCord, Mazi Smith), and two
surnames the guards refuse ("Kamara" with only the Cowboys named as the practice partner;
"Robinson" with three Falcons Robinsons on NFL rosters).

**The adversarial probes** — 15, in `news-match.test.mjs`, each declaring on its own row whether its
text is `real` (verbatim from a committed fixture) or `written` (composed there). The test asserts
that declaration and refuses to let a probe claim real text that is not findable in a fixture. Nine
are real. Every collision used is real in Sleeper's dictionary today.

| Probe | Text | Result |
| --- | --- | --- |
| Two rostered players | *real* — "Raiders expected to name Kirk Cousins Week 1 starter over No. 1 pick Fernando Mendoza" | two items, two managers, 0.95 each |
| Collision, no team context | Justin Jefferson | Vikings WR at 0.65 — published, no ping |
| Collision, team confirms | "The **Vikings** say…" | 0.85 — ping |
| Collision, team contradicts | "The **Browns** say…" | **refused** |
| Surname ambiguous | "Hunter is expected to miss a month" (two rostered Hunters) | **refused** |
| Surname unique + team | *real* — "The Texans placed Higgins (knee) on IR" | Jayden Higgins, 0.72, no ping |
| Non-news: promo | *real* — "Adam Schefter's cheat sheet…" | names nobody |
| Non-news: condolence | "Thoughts and prayers to Kirk Cousins and his family" | published, **no ping** |
| Non-news: draft chatter | "Mock draft season: where does Fernando Mendoza land…" | published, **no ping** |
| Nobody rosters him | *real* — "The Dolphins acquired quarterback Kyle McCord…" | names nobody |
| Roundup at the limit | *real* — the Commanders' three starters | three items |
| Roundup over the limit | four owned names | **refused as a roundup** |
| Ambiguous alias | "Big year coming for JJ" (J.J. McCarthy and Justin Jefferson, both MIN) | **refused** |
| Possessive | *real* — "…become Lamar Jackson's WR2" | both players |
| The Jalon Daniels headline | *real* | **refused** |

**The assertions are exact counts, not floors, and they were mutation-tested.** §3a: a check that
cannot fail is worse than no check. Dropping `normText`'s possessive step, setting
`allowed_mentions` to the webhook default, skipping headline sanitising and raising the read budget
each fail between one and three tests.

**One trap was fallen into and is recorded because of it.** The three collision probes passed *with
the weights tied*, because the player-id tie-break happened to land on the right player — so
reverting the weights failed nothing at all. That is §3a's rule in the form it actually takes: not a
check that cannot fail, but a check that **passes for a reason you did not intend**. The fix was to
assert the resolution *margin* (`scored[0].score > scored[1].score`) rather than the winner, and
reverting the weights now fails.

### 10.3 X ingest — `x-source.mjs`

**Nothing calls it, and without `X_BEARER_TOKEN` it does nothing:** one log line, exit 0, zero
reads, zero dollars. A missing token is deliberately a *successful* outcome rather than an error,
because a cron that goes red over a credential that does not exist yet is noise.

**The endpoint shape was checked, not remembered.** `https://api.x.com/2/openapi.json`, fetched from
the build VM on 2026-08-30: `openapi: 3.0.0`, `info.version: 2.168`,
`servers: [{ url: "https://api.x.com" }]`.

- **`GET /2/users/{id}/tweets`** — `operationId: getUsersPosts`. `security` lists `BearerToken`,
  defined in `components.securitySchemes` as `{ type: http, scheme: bearer }`: app-only
  `Authorization: Bearer …`, no OAuth dance. Query parameters: `max_results` (integer, **minimum 5,
  maximum 100**), `pagination_token`, `start_time`, `end_time`, `since_id`, `until_id`, and
  `exclude` (array, enum exactly `["replies","retweets"]`).
- **The field selector on this route is `post.fields`, not `tweet.fields`.** This is the one detail
  memory would have got wrong. In 2.168 the timeline route resolves `$ref: PostFieldsParameter`,
  whose `name` is `post.fields`; a parameter literally named `tweet.fields` survives only on the ten
  streaming routes (`/2/tweets/search/stream`, `/2/tweets/firehose/stream`, …). It is the constant
  `FIELDS_PARAM`, so changing it back is one line.
- **`referenced_posts` is an expansion, not a post field** — and reading the spec is what caught it.
  The first draft of `x-source.mjs` asked for it inside `post.fields`. The name is real, so it looks
  right, but in 2.168 it is a member of the `expansions` enum and is *absent* from the `post.fields`
  enum. X would have answered `400` and the X ingest would have been dead on its first real run,
  with nothing in the repo able to notice, because no test can call X without a token. We never
  consumed the value — `exclude=retweets,replies` already drops the referencing cases the feed cares
  about — so it is simply gone. This is the second time on this feature that a plausible-from-memory
  identifier was wrong (see also `post.fields`), which is the argument for the next paragraph.
- **The spec's enums are pinned, so the request is checked offline.** `post.fields`, `expansions`,
  `exclude`, the documented query-parameter list and the `max_results` bounds are committed to
  `data/fixtures/x-post-fields.json` together with their provenance (`spec_url`, `fetched`,
  `info.version`). The test suite asserts every parameter `x-source.mjs` sends is a member of the
  matching enum. That check earns its keep: reinstating `referenced_posts` fails it with
  `post.fields=referenced_posts is not in the spec's enum`, which was verified by doing exactly
  that. Re-pin the fixture by re-fetching the spec; do not hand-edit it to make a test go green.
- **`GET /2/users/by/username/{username}`** — `operationId: getUsersByUsername`. The only way to
  turn "AdamSchefter" into the numeric id the timeline route wants.

**Money.** X moved to pay-per-use in 2026: no free tier, prepaid credits, billed **per resource
returned**. Published rates, cross-checked 2026-08-30 against `console.x.com/pricing`: a **post read
is $0.005**, a **user read is $0.010**, and pay-per-use is capped at 3,000,000 post reads a monthly
cycle. Three consequences, all implemented:

1. **The user id is resolved once and cached in `data/x-state.json` forever.** It costs twice what a
   post costs and it never changes.
2. **`since_id` is persisted**, so a run is billed for new posts and not for the same fifty again.
   This is the difference between a few dollars a month and a few dollars a day.
3. **Two hard ceilings.** `X_MAX_READS_PER_RUN` defaults to **50 posts**; `X_MAX_READS_PER_MONTH`
   defaults to **1,200 posts**. The monthly one is the real guard: 1,200 × $0.005 = **$6.00**, a
   third above the ~$4.50 estimate the user is working to, so normal running is unaffected and a bug
   that loops cannot produce a surprise invoice. Past the ceiling the module no-ops exactly as if
   the token were missing, until the billing month rolls over. `X_MAX_PAGES_PER_RUN` defaults to
   **1**, because paging on a bug is how a read budget gets spent in a loop.

The estimate those defend: ~30 original posts a day at two runs a day is ~900 reads a month, ×
$0.005 = **$4.50**. Every run appends its actual `post_reads`, `user_reads` and `usd` to
`data/x-state.json` (last 30 runs), so the estimate can be checked against reality rather than
trusted. `node x-source.mjs --plan` prints the exact request, the cached id, the watermark and the
whole budget, with no token and no network.

A post normalises into the raw shape the `news-sources.mjs` adapters already return, with the whole
text in `title` and `summary` empty — the honest mapping, since a post has no split and inventing
one would invite the title-only rule to be applied to text it was never designed for. An unparseable
`created_at` becomes `null`, never `Date.now()`, per §8.4.

### 10.4 Discord — `discord-notify.mjs`

Plain HTTPS POST of a webhook payload with `fetch`. No dependencies.

**Dry run is the default.** With no `--target` and no webhook in the environment it writes what it
*would* have sent to `data/discord-outbox.json` (gitignored) and sends nothing. Promotion is
`--target=staging`, then `--target=live` — both settings, neither a code change. An explicit target
whose secret is not set **degrades to a dry run** rather than failing, so a cron that has not been
given its secret yet is quiet rather than red. Because the shipped member map is all placeholders,
the dry run substitutes a marked stand-in id so the outbox is readable; a real send still refuses a
placeholder.

**Mention injection.** Every string in a news item is third-party text from the open internet. A
headline containing `@everyone` must not ping the server. **Two independent defences**, because
either alone has a way to be wrong:

1. **`allowed_mentions: { parse: [], users: [<one id>] }` on every payload.** Discord's message
   documentation gives this as the surgical form: an empty `parse` resolves *nothing* from the
   content, while the explicit `users` array overrides `parse` for exactly those ids. So `@everyone`
   renders as text, a role mention renders as an unclickable name, and only the intended manager is
   notified. The docs are also explicit that `parse` and the type arrays conflict **per type** —
   `parse: ["users"]` together with `users: […]` is a 400 — so `parse` stays empty.
2. **The third-party text is neutralised before it is placed in `content`.** Relying on
   `allowed_mentions` alone means trusting a remote parser on a field whose semantics the docs
   themselves call "more complex than it seems". So raw mention syntax loses its angle brackets
   first (`<@&999>` → `@999`), then every `@` gains a zero-width space. The outgoing string contains
   **no mention token at all**, and still reads as `@everyone` to a person. The intended `<@id>` is
   prepended *after* sanitising, so it is the only one that exists.

`assertInertMentions()` then checks the **finished payload**, not the inputs, so a future caller that
forgets to sanitise is caught too. Given the headline
`@everyone @here <@&123456789012345678> Kittle ruled out — <@987654321098765432> confirms`:

```json
{
  "username": "CuckleChunckle",
  "content": "<@111111111111111111> **George Kittle** — Rotowire\n@​everyone @​here @​123456789012345678 Kittle ruled out — @​987654321098765432 confirms\n> …\n<https://example.com/story>",
  "allowed_mentions": { "parse": [], "users": ["111111111111111111"] }
}
```

Live `@everyone`/`@here` tokens in `content`: **0**. Mention tokens in `content`: **exactly one**,
the intended manager. All six guard clauses are shown refusing by `node discord-notify.mjs
--self-test` and asserted in the test suite.

**Rate limits.** Discord's own documentation says not to hard-code limits and to read the
`x-ratelimit-*` headers instead, so the limiter is header-driven — `x-ratelimit-remaining: 0` plus
`x-ratelimit-reset-after` holds the queue — with the community-known webhook floors underneath
(**5 requests per 2 seconds, 30 per minute**) and exponential backoff on top of the server's own
`retry_after` on a 429, to five attempts. Our volume never engages any of it. The run *after* an
outage is exactly when it matters, and Discord restricts IP addresses that accumulate 429s. A
**404, 401 or 403 is terminal and not retried**, because the docs say a webhook that 404s must not
be called again.

**Secrets versus config.** Webhook URLs **are** secrets — the URL *is* the credential, anyone
holding it can post as the webhook. They come from the environment only, and no code path writes one
to disk: the dry-run artifact records the target by *name* (`webhook_env`), and the test asserts no
webhook URL appears anywhere in it. Discord **user ids are not secrets** — every member of a server
can see them — so the map lives in the committed `data/discord-members.json`, one row per seat, all
ten shipped as `000000000000000000`. A placeholder is **refused at send time**, so a half-filled map
fails loudly instead of quietly never pinging somebody. The test asserts the ten seats match
`members.json` exactly, that every id ships as a placeholder, and that no webhook URL is in the file.

**Only above the notify threshold.** `alertsFrom()` takes `NOTIFY_MIN` (0.80). Rows already in
`news.json` carry no `confidence`, so it is derived from how they were attributed: `player_id` →
0.99 (Sleeper's per-player endpoint answered, so who owns the player cannot be wrong) and `name` →
0.90 (the RSS full-name-in-the-title rule, which refuses on any ambiguity). Nothing invents a
confidence for an item that has one.

**Deduplication is on a story key, not an item id.** `news-sync.mjs` ids hash the exact headline, so
the same report arriving from Sleeper and from a post has two ids and would ping twice. The key is
the same shape as `news-sync`'s own dedupe — player, calendar day, first six meaningful words —
plus the manager, since a trade legitimately notifies two people about one story. Deliveries are
recorded in `data/discord-delivered.json`, pruned at 21 days, so a story is never notified twice
across runs either.

### 10.5 What the user has to supply

Nothing here signs up for anything, and nothing runs until all of this exists.

**Repository secrets** (Settings → Secrets and variables → Actions → New repository secret). All
three are secrets and none may be committed:

| Secret | What it is | Needed for |
| --- | --- | --- |
| `X_BEARER_TOKEN` | App-only bearer token from the X developer console, with prepaid credits on the account | X ingest. Absent → no-op |
| `DISCORD_WEBHOOK_STAGING` | Webhook URL for a private staging channel | Staging sends. Absent → dry run |
| `DISCORD_WEBHOOK_LIVE` | Webhook URL for the league channel | Live sends. Absent → dry run |

**Committed config**, in the repo, not secret:

| Where | What | Default shipped |
| --- | --- | --- |
| `data/discord-members.json` | ten `sleeper user_id` → Discord user id rows | all `000000000000000000` — **must be filled** |
| `data/x-state.json` | cached user id, `since_id`, monthly read counter, cost telemetry | empty; written by the first real run |

To read a Discord user id: User Settings → Advanced → Developer Mode on, then right-click a member
→ Copy User ID. 17–20 digits.

**Optional environment overrides**, all with working defaults: `X_ACCOUNT` (`AdamSchefter`),
`X_MAX_READS_PER_RUN` (50), `X_MAX_READS_PER_MONTH` (1200), `X_MAX_PAGES_PER_RUN` (1),
`DISCORD_TARGET` (`dry-run`).

### 10.6 The workflow, when the user wants it

**Not committed.** This extends §7's proposal; the same rules apply — no `generate-page.mjs`, no
`apply-value-adjust.mjs`, and the value book must not move on a cron.

```yaml
# .github/workflows/news.yml — NOT COMMITTED. This is the proposal.
      # … §7's steps up to and including `node news-sync.mjs` …

      # Inert until X_BEARER_TOKEN exists. Not in news-sync.mjs yet: wiring it in is Phase 4,
      # and it must not be able to change today's feed.
      - run: node x-source.mjs
        env: { X_BEARER_TOKEN: "${{ secrets.X_BEARER_TOKEN }}" }

      # Dry run unless a webhook secret exists, whatever the target says.
      - run: node discord-notify.mjs --target=staging
        env:
          DISCORD_WEBHOOK_STAGING: "${{ secrets.DISCORD_WEBHOOK_STAGING }}"

      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: discord-outbox, path: data/discord-outbox.json, if-no-files-found: ignore }

      - run: |
          git add data/ui/news.json data/x-state.json data/discord-delivered.json
          git diff --staged --quiet || git commit -m "News: $(date -u +%Y-%m-%dT%H:%MZ)"
          git push
```

`data/x-state.json` and `data/discord-delivered.json` **must** be committed back, or `since_id`
resets and every run pays for the same posts, and the delivery ledger resets and every run re-pings
the same stories. `data/discord-outbox.json` is gitignored and goes out as an artifact instead.

### 10.7 Promotion checklist

Each step is reversible and each one is a setting. Do not skip to the last.

1. **Read the dry run.** `node discord-notify.mjs` with no secrets, then read
   `data/discord-outbox.json` end to end. Not the counts — the message bodies. §6d.1: a thing can
   pass every assertion while being wrong on screen.
2. **Run the suite.** `node --test news-match.test.mjs` — 36 tests, no network. Then
   `node news-match.mjs --corpus-score` and read the refusals; a refusal with a reason you disagree
   with is the cheapest bug report available.
3. **Fill `data/discord-members.json`.** Ten real ids, committed. Re-run the dry run and confirm
   every `discord_id_is_placeholder` is now `false`.
4. **Create the staging webhook** in a channel only the user is in. Add `DISCORD_WEBHOOK_STAGING`.
   Run `node discord-notify.mjs --target=staging` **by hand**, once. Confirm in Discord that the
   mention resolves to the right person and pings only them.
5. **Post an `@everyone` headline through staging on purpose.** The unit test proves the payload;
   this proves the server agrees. Nobody should be pinged but the one intended member.
6. **Leave staging alone for a few days** with the workflow still uncommitted, running by hand.
   Watch for a wrong manager. That is failure mode §8.1 and it is the only one that matters.
7. **Re-pin X's spec before you pay for anything.** Re-fetch `https://api.x.com/2/openapi.json`,
   regenerate `data/fixtures/x-post-fields.json`, and re-run the suite. `referenced_posts` proves
   the request shape can be wrong in a way only the spec reveals, and X is still renaming things.
   Doing this while the account has no credit is free; doing it after is a 400 on a paid run.
8. **Provision `X_BEARER_TOKEN`** with a small credit balance. Run `node x-source.mjs --report` by
   hand and read `data/x-state.json`: `post_reads` and `usd` against the $4.50 estimate. Do this
   before anything is scheduled, so the first bill is one the user chose.
9. **Wire X into `news-sync.mjs`** — Phase 4, not built here. `x-source.mjs` returns raw items and
   `news-match.mjs` turns them into per-manager subjects; joining them is the remaining work, and it
   needs the `confidence` field, which is a **`v: 2`** for `news.json`.
10. **Only then** commit the workflow, still pointing at staging.
11. **Last:** switch to `DISCORD_WEBHOOK_LIVE`. One line of YAML, and reversible.

### 10.8 What was checked on screen, and the check that can fail

This branch adds no rendered field, so the page ought to be untouched — but "ought to be" is
precisely the claim §6d.1 says not to accept. Two things were established, and one of them is the
negative control that makes the other worth anything.

**The feed still composes with `main` merged in.** A throwaway merge of `origin/main` into this
branch was regenerated and served, then Chrome was driven over the DevTools Protocol to ask the
*running* DOM what it had rendered at 390 px. All 60 items were present as `.news-row`, and — the
part that matters — **60 of 60 carried a non-empty headline, manager, league line and category**,
all with a non-zero box, with no horizontal overflow and no console error other than a missing
`favicon.ico`. Counting rows alone would not have been enough: the failure this guards against is a
feed that renders empty shells or loses the manager attribution, which a row count cannot see.

**The probe can fail, and was made to.** A copy of `index.html` was mutated in exactly the way the
audit records — `+ renderNews()` turned into `; renderNews()`, dead-coding the feed below a
terminated statement — and the probe reported 0 rows, 0 league lines, no `.news-box` at all, and
exited non-zero. A check that cannot fail is worse than no check, so this one was shown failing
before its passing result was believed.

**Provenance was not assumed either.** The first attempt served on a port that another process had
already taken, so the server never bound and Chrome was reading *someone else's stale build* — a
193 KB `index.html` from an unrelated worktree, which would have produced a perfectly green result
about the wrong artifact. The run now picks a verified-free port and refuses to probe until the
bytes served over HTTP hash-match the local `index.html`. That is failure mode §6d.1 in its most
literal form, and it very nearly landed.

Separately, `price-today.mjs` gained one `export` keyword, which needs to be inert. It was compared
against `origin/main`'s copy of the same module: identical export surface but for the added
`nameCandidateScore`, `normName` agreeing across 4,000 dictionary names, and `priceTodayValue`
returning the same number for **36,579 priced legs** — zero differences. The value book does not
move.

### 10.9 What is deliberately not built

- **No workflow file.** Nothing is scheduled. Every part of this runs only when invoked by hand.
- **X is not wired into `news-sync.mjs`.** `news.json` is byte-identical on this branch and no new
  field is rendered, so `generate-page.mjs` and `index.html` are untouched — verified byte-identical
  by regenerating.
- **No `contract` category.** §10.1 says why, and §9 carries it as an open question.
- **No `confidence` field in `news.json`.** The notifier derives one from `match`; storing it is the
  `v: 2` that Phase 4 needs.
- **Nothing near the value book.** No file this change touches reads or writes a value, the Value
  Adjustment, a lens window, `today_delta`, a partner grade or `marks.json`.
  `apply-value-adjust.mjs` was not run.
