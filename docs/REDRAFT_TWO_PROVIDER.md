# Two-provider redraft — Gm 2026 LLJ

A **separate** league book from CuckleChunckle. Same dashboard, same `build.mjs`
pipeline, 1QB half-PPR **redraft** clocks (Date of Trade + as of today). No Cuckle
crowns are copied over.

| Provider | ID | Years |
| --- | --- | --- |
| ESPN (prior) | `35763180` | through 2024, once cookies are set |
| Sleeper (recent + current) | `1389723418827460608` | 2026 live; walks to `1253382148073725952` (2025) |

Canonical key on disk and in the store: the **Sleeper** id.
Book path: `data/leagues/1389723418827460608/{raw,ui}/`.

---

## 1. What you can review now

Sleeper is public. This branch pulls 2025–2026 (12 seats, type `0`, 1QB, `rec: 0.5`)
and builds the same Home / Teams / News / Ledger / Menu shell against that tape.

Open locally after `python3 -m http.server`:

- [`design-redraft-home.html`](../design-redraft-home.html) — Design Mode on this league
- or Create a league in the store and paste `1389723418827460608`

`node scripts/review-redraft.mjs` prints format, seasons, titles, and ESPN status.

---

## 2. ESPN prior years

ESPN league `35763180` returns **401 AUTH_LEAGUE_NOT_VISIBLE** without cookies.
`espn-sync.mjs` writes `espn_status.json` and empty ESPN books, then the Sleeper
build continues.

To unlock 2010–2024 (or whatever years the league actually has):

1. In a browser where you can open that ESPN league, copy `espn_s2` and `SWID`.
2. Set them on the machine that runs the build:

```bash
export ESPN_S2='...'
export ESPN_SWID='{...}'
node build.mjs 1389723418827460608 --skip-snapshot
```

3. Optional name pins when auto-match misses: edit
   `data/leagues/1389723418827460608/raw/espn_bridge.json`

```json
{
  "espn:{SWID}": "458342725222133760"
}
```

4. For GitHub Actions, add repo secrets `ESPN_S2` and `ESPN_SWID`.
   [`.github/workflows/league-sync.yml`](../.github/workflows/league-sync.yml)
   passes them into `build.mjs`.

ESPN seasons **do not** overwrite 2025–2026 Sleeper rows. They append older
seats, trades, and champion cards. Format detection still reads the Sleeper
`leagues.json` (redraft / 1QB).

---

## 3. How to deploy

Same path as any second Sleeper league ([`FORMAT_BOOKS.md`](FORMAT_BOOKS.md) §3):

1. **Laptop / this branch**

   ```bash
   node ensure-players.mjs
   node build.mjs 1389723418827460608 --skip-snapshot
   ```

   `--skip-snapshot` keeps Cuckle’s Superflex history in `data/value_curve.json`.
   `ensure-1qb-curve.mjs` writes `data/value_curve_1qb.json` from DynastyProcess
   latest so this league is **not** scored on the Superflex curve.

2. **Commit** `data/leagues/1389723418827460608/` (and `value_curve_1qb.json` if new).
   Do not dual-write this book into `data/ui` — that folder stays Cuckle.

3. **Push `main`** — GitHub Pages serves
   `https://slabslip.github.io/cuckle-trade-tracker/`.
   Review door: `design-redraft-home.html` on that origin.

4. **Store register** — Create a league, paste `1389723418827460608`, optional ESPN
   `35763180`. `join-league` dispatches `league-sync` when `GITHUB_PAT` is set.
   Actions runs `node build.mjs <id>` on `main` and commits the scoped book.

5. **Invite seats** — same CF- codes as Cuckle. Truman’s Sleeper id on this
   league is `458342725222133760` (same person, different book).

---

## 4. What this league looks like

- 12 teams, 1QB / 2RB / 2WR / TE / FLEX / K / DEF / 6 BN
- Half-PPR, not TEP, not Superflex
- Redraft clocks only (Date of Trade + as of today)
- Calculator door and screen: **#1GM calc** (Menu still says Calculator)
- Today prices are DynastyProcess **value_1qb** flatten only — no Superflex KTC/FC/DD blend
- 2025 is complete on Sleeper (Biff34). ESPN years fill in when cookies are present
- Home tape line states Sleeper seasons vs ESPN locked/imported

---

## 5. Pipeline extras (this branch)

```text
sleeper-sync.mjs
espn-sync.mjs              # private ESPN → espn_*.json or a status stub
merge-provider-history.mjs # name-bridge ESPN people onto Sleeper seats
draft-resolve.mjs          # Sleeper drafts only
ensure-1qb-curve.mjs       # value_1qb, does not rewrite Superflex history
… existing meter steps …
```

Cuckle self-checks in `revalue.mjs`, `apply-value-adjust.mjs`, and
`title-path.mjs` run only when `LEAGUE_ID` is Cuckle.
