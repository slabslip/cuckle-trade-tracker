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
