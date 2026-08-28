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
node generate-page.mjs
```

Dashboard book is **even-flatten DynastyProcess**. Filter every trade by day of trade / 1 year / 2 years / 3 years / all time (mean of year-ends in that window). KTC snaps stay in `data/ktc/` and are not mixed into the score. See `docs/VALUE_SDD.md`.

Serve the folder over HTTP so each person’s slice can load:

```bash
python3 -m http.server 8766
# http://localhost:8766/?me=TipsUp
# http://localhost:8766/?me=TipsUp&view=review
```

Live: [Home](https://slabslip.github.io/cuckle-trade-tracker/) · [Review 10](https://slabslip.github.io/cuckle-trade-tracker/?me=TipsUp&view=review)

Pin display names in `data/aliases.overrides.json` — re-sync will not overwrite it.

FAAB is ignored — no leg, no points. One-way deals (one side gets players/picks, the other gets nothing or only FAAB) are thrown out of the meter.

`value-snapshot.mjs --latest-only` skips git history if you only need today’s prices.
