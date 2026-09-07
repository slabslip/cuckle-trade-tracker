# DynastyDealer snapshots

Daily Superflex trade-engine pull (`/api/player-values?perSlot=true`).
`value` on each row is `base_value` (raw trades). `current_value` is kept for Info.
Git-committing `YYYY-MM-DD.json` **is** the history.

```bash
node dynastydealer-snapshot.mjs
# writes data/dd/YYYY-MM-DD.json and data/dd/latest.json
```

One of four today-book sources. Do not backfill onto flatten windows.
`base_value <= 0` is a placeholder miss, not a price. The today book reads `latest.json`
even when the DP curve date is older. The phone never fetches this API.
