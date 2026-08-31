# CuckleChunckle trade meter

Sleeper league `1315431339301806080`. Superflex dynasty, 2019–2026. Official Sleeper GETs + DynastyProcess CSVs (GPL-3). Not SlabSlip.

**App (Chuckle Fantasy):** one commissioner creates the league (Sleeper league ID ± ESPN),
sends per-seat invites; members redeem a code and set username/password. See
[`docs/APP_SDD.md`](docs/APP_SDD.md). Custom domain: [`docs/CUSTOM_DOMAIN.md`](docs/CUSTOM_DOMAIN.md).

**Default:** a pick that has already been drafted is the player it became, priced today.

**Toggle:** what that pick (and the rest of the bag) was worth on the day they accepted, using DynastyProcess pick values from git history.

**Drafters:** who actually used the pick. Rookie 2020–2026 surplus = player today minus pick cost on draft day. 2019 startup is a separate tab ranked by player today (DynastyProcess has no 2019 startup pick prices).

```bash
node build.mjs                              # CuckleChunckle (default)
node build.mjs <sleeper_league_id>          # any league → data/leagues/<id>/{raw,ui}
```

Or one step at a time (pass the same league id to each league-scoped step):

```bash
node sleeper-sync.mjs [league_id]
node draft-resolve.mjs [league_id]
node value-snapshot.mjs          # latest + monthly git history (shared)
node ktc-snapshot.mjs            # weekly Superflex snap → data/ktc/ (not in build.mjs)
node revalue.mjs [league_id]
node title-path.mjs [league_id]  # titles.json for Champions Path
node apply-value-adjust.mjs [league_id]
node generate-page.mjs           # site shell (Cuckle)
node mark-league-ready.mjs [league_id]  # needs SUPABASE_SERVICE_ROLE_KEY
node news-sync.mjs               # news.json for News and Alerts (not in build.mjs)
```

League UI lives under `data/leagues/<id>/ui/` (Cuckle is dual-written to `data/ui/` for
news-refresh and legacy readers). Shared curve/KTC/players stay under `data/`.

`news-sync.mjs` builds the News and Alerts feed. It reads the rosters `sleeper-sync.mjs` already
wrote and **touches no value, no Value Adjustment, no lens window and no ranking**, which is why
it is outside `build.mjs` — it is a data-only refresh and the page reads `news.json` at runtime.

**The feed is manual submissions only.** Share a tweet → **Send to Cuckle** → done. The Shortcut
POSTs only `{url, submitted_by}`; the matcher tags the roster owner(s). Optional `note` /
`target_name` / **`agent_tip`** (private coaching for the smack agent) exist but are not part of
the one-tap path (`docs/SUPABASE_SETUP.md` §3b, `docs/SMACK_AGENT.md`).
GitHub Action `news-refresh` rebuilds `news.json` and pushes `main` when Supabase pings
`repository_dispatch` (§3d), with a one-minute cron as backup.

The automated sources — Sleeper's GraphQL `get_player_news` and RSS from ESPN, Rotowire, CBS,
Yahoo and ProFootballTalk — are **off**, behind `AUTOMATED_SOURCES` in `news-sync.mjs`. Off means
not fetched: no request is made to any of them. The code is switched rather than deleted, because
the Sleeper path is asked about one `player_id` and answers about that player, which makes it the
only attribution in this project that cannot be wrong. Read the note on the constant before
turning it back on.

```bash
node news-sync.mjs --selftest        # name resolution + url canonicalisation, no network
node news-sync.mjs --report          # the match report: queue, rejects, duplicates, attribution
node news-sync.mjs --voice           # every voice variant, no network
node news-sync.mjs --empty           # a valid empty news.json, no network
node news-sync.mjs --with-automated  # turn the automated sources on for this run
node news-sync.mjs --no-submissions  # skip the queue (with the switch off, this writes an
                                     #   empty feed — it is a diagnostic, not a build)
```

`--report` deliberately writes nothing, including the `processed_at` stamp, so it can preview the
queue without touching it. The Shortcut recipe, the exact request body and the SQL are in
`docs/SUPABASE_SETUP.md` §3b.

The voice lives behind one seam, `leagueLine()` in `news-voice.mjs`, so it can be rewritten
without touching ingest or UI. See `docs/SMACK_AGENT.md` for smack/summary coaching (including
Shortcut `agent_tip` → `data/smack-tips.json`), and `docs/NEWS_SDD.md` for sources and the
daily agent plan.

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
