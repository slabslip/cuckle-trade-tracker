# Keep Trade Cut snapshots

Daily Superflex scrape for CuckleChunckle. Git-committing `YYYY-MM-DD.json` **is** the history. Do not backfill old dates — KTC pages are live-only.

```bash
node ktc-snapshot.mjs
# writes data/ktc/YYYY-MM-DD.json and data/ktc/latest.json
```

One of four daily today sources (with DynastyProcess flatten, FantasyCalc, and DynastyDealer).
`snapshot-values.mjs` / `.github/workflows/values-daily.yml` run this. If the scrape fails, yesterday's file is reused. Not part of `node build.mjs` (that would hit KTC on every rebuild).

ToS posture: personal daily snapshot for this league’s offline formula. **Not** a live scrape from the phone page.

`latest.json` is a copy of the newest dated file. The today book (`makeTodayPrice`) reads
`latest.json` so a newer FantasyCalc / DynastyDealer file is not dropped when the DP curve
date is older. Historical `loadSnapAsOf` still uses last `YYYY-MM-DD.json` with `as_of <=` the
query date. A quote `<= 0` is a miss. Missing source → that weight drops and the rest renormalize.
