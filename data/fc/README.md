# FantasyCalc snapshots

Daily Superflex dynasty pull (`isDynasty=true&numQbs=2&numTeams=10&ppr=1`).
Git-committing `YYYY-MM-DD.json` **is** the history.

```bash
node fantasycalc-snapshot.mjs
# writes data/fc/YYYY-MM-DD.json and data/fc/latest.json
```

One of four today-book sources. Do not backfill onto flatten windows.
The phone never fetches this API.
