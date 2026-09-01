# Keep Trade Cut snapshots

Weekly Superflex scrape for CuckleChunckle. Git-committing `YYYY-MM-DD.json` **is** the history. Do not backfill old dates — KTC pages are live-only.

```bash
node ktc-snapshot.mjs
# writes data/ktc/YYYY-MM-DD.json and data/ktc/latest.json
node revalue.mjs && node generate-page.mjs
```

Not part of `node build.mjs` (that would hit KTC on every rebuild). Personal weekly snapshot, not a live in-app scrape.

Optional local cron (Sunday morning; replace `REPO_ROOT` with your clone path, e.g.
`~/Documents/cuckle-trade-tracker`):

```cron
20 9 * * 0 cd REPO_ROOT && /usr/bin/node ktc-snapshot.mjs >> data/ktc/cron.log 2>&1
```

`latest.json` is a copy of the newest dated file. `revalue.mjs` uses last `YYYY-MM-DD.json` with `as_of <=` the query date. Formula: `custom = 0.40 * even_DP + 0.60 * ktc_sf`. No file for that day = flatten-only.
