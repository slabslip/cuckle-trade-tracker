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
`node scripts/loop-gm-dashboard.mjs` runs the 12 shell laws, hunt-week laws,
ESPN franchise laws, and 36 dataset loops.

Week scores stay Sleeper-only until ESPN cookies unlock 2010–2024. Those
years attach to current Sleeper seats by name, then by ESPN team slot
(a manager who left stays on that franchise). Playoff consolation still
does not set the low.

---

## 2. ESPN prior years — step by step

ESPN league `35763180` is **private**. Without cookies the API returns 401,
so Week scores can only use Sleeper 2025–2026. That is why every current
low is a 2025 week. The import and franchise attach are already wired;
they stay empty until the two cookies below are set.

### A. Copy the cookies (Chrome, computer)

1. Sign into ESPN in Chrome.
2. Open the fantasy league (the one whose URL has `leagueId=35763180`).
3. Press **F12** (or right-click → Inspect).
4. Open the **Application** tab (Chrome) or **Storage** (Firefox).
5. Left rail: **Cookies** → `https://fantasy.espn.com`.
6. Click **espn_s2**. Copy the whole **Cookie Value**. It is a long string.
7. Click **SWID**. Copy the **Cookie Value**. Keep the `{` `}` around it.

Do not paste these into a chat, a commit, or `espn_bridge.json`.

### B. Give the cookies to the rebuild

**GitHub (what Rebuild dashboard uses)**

1. Open the repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** named `ESPN_S2` → paste the espn_s2 value.
3. **New repository secret** named `ESPN_SWID` → paste the SWID value.
4. In the app: Menu → **Settings** → **Leagues** → **Rebuild dashboard**.
   That runs `league-sync.yml`, which already passes those two secrets into
   `build.mjs`.

**Laptop (optional, same book)**

```bash
export ESPN_S2='paste espn_s2 here'
export ESPN_SWID='{paste SWID here}'
node build.mjs 1389723418827460608 --skip-snapshot
```

Then commit `data/leagues/1389723418827460608/` and push `main`.

### C. What happens after a green rebuild

- ESPN team-weeks 2010–2024 (whatever years the league actually has) join
  the Week scores door.
- Current Sleeper **names** are used. A manager who left stays on that
  ESPN team slot and attaches to the Sleeper seat that inherited it.
- Unique name / team-name matches first. Misses can be pinned in
  `data/leagues/1389723418827460608/raw/espn_bridge.json`:

```json
{
  "espn:{SWID}": "458342725222133760",
  "espn-team:3": "1132355027018035200"
}
```

`espn:{SWID}` is a person. `espn-team:{id}` is the franchise slot.

- ESPN weeks never overwrite Sleeper 2025–2026.
- ESPN playoff consolation still does not set the low (same hunt rule).
- Past Champions gets ESPN crowns only from a real ESPN payload — never invented.

The same five steps also sit on **Settings → Leagues** when ESPN is locked.

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

4. **Add it to your dashboard** — sign in on Pages, then open
   `https://slabslip.github.io/cuckle-trade-tracker/?add=gm`
   (or tap **Add this league** on Your leagues / Settings → Leagues). Three
   IDs are filled: Sleeper `1389723418827460608` (2026), Sleeper
   `1253382148073725952` (2025), ESPN `35763180`. Add more IDs with
   **Add Sleeper ID** / **Add ESPN ID**. **Create, merge, and build**, then
   **Claim this seat** for your team (TrumanCooper is `458342725222133760`).
   `join-league` dispatches `league-sync` with every ID. After create,
   Settings → Leagues and the invite console keep those IDs (plus any you
   add later). **Rebuild dashboard** runs the same merge again. The book is
   already on Pages, so the meter opens without waiting on a rebuild.

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
