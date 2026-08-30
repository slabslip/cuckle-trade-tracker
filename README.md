# CuckleChunckle trade meter

Sleeper league `1315431339301806080`. Superflex dynasty, 2019–2026. Official Sleeper GETs + DynastyProcess CSVs (GPL-3). Not SlabSlip.

**Default:** a pick that has already been drafted is the player it became, priced today.

**Toggle:** what that pick (and the rest of the bag) was worth on the day they accepted, using DynastyProcess pick values from git history.

**Drafters:** who actually used the pick. Rookie 2020–2026 surplus = player today minus pick cost on draft day. 2019 startup is a separate tab ranked by player today (DynastyProcess has no 2019 startup pick prices).

```bash
node build.mjs
```

Or one step at a time:

```bash
node sleeper-sync.mjs
node draft-resolve.mjs
node value-snapshot.mjs          # latest + monthly git history
node ktc-snapshot.mjs            # weekly Superflex snap → data/ktc/ (not in build.mjs)
node revalue.mjs
node title-path.mjs              # titles.json for Champions Path
node apply-value-adjust.mjs      # today blend + Value Adjustment + trade boards + marks.json
node generate-page.mjs
node news-sync.mjs               # news.json for News and Alerts (not in build.mjs)
```

`news-sync.mjs` builds the News and Alerts feed: NFL news filtered to players on this league's
rosters, addressed to whoever owns them. It reads the rosters `sleeper-sync.mjs` already wrote
and **touches no value, no Value Adjustment, no lens window and no ranking**, which is why it is
outside `build.mjs` — it is a data-only refresh and the page reads `news.json` at runtime, so it
needs no regenerate.

```bash
node news-sync.mjs --report          # the match report: sources, hit rate, ambiguous drops
node news-sync.mjs --voice           # every voice variant, no network
node news-sync.mjs --empty           # a valid empty news.json, no network
node news-sync.mjs --no-submissions  # automated sources only, skip the shared-tweet queue
```

It also drains the **shared-tweet queue**: a league member taps Share on a tweet in X, picks an
iOS Shortcut, and the Shortcut POSTs the URL (plus an optional jab and an optional target
manager) to the `news_submissions` table. This run fetches each tweet's text from X's free
oEmbed endpoint, publishes it into the feed, and stamps the row so it is never ingested twice.
In the feed the jab is the summary line and the tweet itself sits behind an expander.

`--report` deliberately stamps nothing, so it can preview the queue without consuming it. The
Shortcut recipe, the exact request body and the SQL are in `docs/SUPABASE_SETUP.md` §3b.

The voice lives behind one seam, `leagueLine()` in `news-voice.mjs`, so it can be rewritten
without touching ingest or UI. See `docs/NEWS_SDD.md` for the sources actually reachable, the
Twitter/X finding, and the plan for the daily agent.

`apply-value-adjust.mjs` is not optional. It owns the today clock (40% flatten + 60% KTC,
retired → 0), the Value Adjustment, every `trade_boards` row and `marks.json`. Skipping it ships
the flatten-only book with stale boards. It reprices from the committed UI JSON, so it is
idempotent and runs in a checkout with no `value_curve.json`.

Dashboard windows (`t0` / `y1` / `y2` / `y3` / `all`) are **even-flatten DynastyProcess** and
never see KTC: day of trade / 1 year / 2 years / 3 years / all time, as the mean of year-ends in
that window. See `docs/VALUE_SDD.md`.

The 40/60 today blend is a **sixth** price, not one of those five, and no screen currently draws
it — `docs/DASHBOARD_AUDIT.md` §8c has the measurement and the open question.

Serve the folder over HTTP so each person’s slice can load:

```bash
python3 -m http.server 8766
# http://localhost:8766/?me=TipsUp
# http://localhost:8766/?me=TipsUp&view=trades&lens=y3
# http://localhost:8766/preview.html      framed at 375 / 390 / 402 / 430
```

Live: [Home](https://slabslip.github.io/cuckle-trade-tracker/) ·
[Champions Path](https://slabslip.github.io/cuckle-trade-tracker/?view=titles) ·
[Phone preview](https://slabslip.github.io/cuckle-trade-tracker/preview.html)

Pin display names in `data/aliases.overrides.json` — re-sync will not overwrite it.

FAAB is ignored — no leg, no points. One-way deals (one side gets players/picks, the other gets nothing or only FAAB) are thrown out of the meter.

`value-snapshot.mjs --latest-only` skips git history if you only need today’s prices.
