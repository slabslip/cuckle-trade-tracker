# Daily Sleeper sweep — keep the dashboard current

**Status:** Locked for this pass. There is **no live Sleeper webhook agent**.
Sleeper does not publish league-move webhooks we can subscribe to. The dashboard
stays current by **polling Sleeper twice a day** and **repricing the today book
once a day**. News tweets are a separate 5-minute job and are not this sweep.

Canonical jobs: [`.github/workflows/league-nightly.yml`](../../.github/workflows/league-nightly.yml),
[`.github/workflows/values-daily.yml`](../../.github/workflows/values-daily.yml).
Manual “do it now”: [`.github/workflows/league-sync.yml`](../../.github/workflows/league-sync.yml).

---

## 1. What we have today (honest)

| Job | When (UTC) | What it is |
| --- | --- | --- |
| `league-nightly` | **08:10** and **22:20** | Sleeper tape for Cuckle + GM |
| `values-daily` | **10:20** | Market snaps (KTC / FC / DD / DP) + reprice both books |
| `league-sync` | manual / dispatch | One league, on demand |
| `news-refresh` | every 5 min | Shared tweets only — not trades, IR, or values |

`sleeper-sync.mjs` is the sweep. It is not a daemon. GitHub Actions starts it.

What the sweep already wrote before this pass:

- Complete **trades** (and only trades) onto `trades.json` / `trade_legs.json`
- Current **rosters** including Sleeper IR (`reserve`) and taxi
- Live **traded_picks** holders
- NFL player dictionary (`players.nfl.json`, gitignored, **24h cache**)

What was missing:

1. **No live agent.** A trade at 2pm sat until the next morning cron — and
   `values-daily` then **died on the today-book self-check**, so the commit
   never landed. That is how the Sept 17 Truman ↔ Ducks deal froze.
2. **Waiver / FA / commissioner** txs were skipped. Roster files eventually
   showed the new owner; there was no move tape.
3. **NFL IR / Out** lived only in the 24h `players.nfl.json` cache. Cuffs
   read it. The calculator did not. A same-day IR could wait until tomorrow.
4. `ARCHITECTURE.md` still said “no publish cadence.” That is stale.
5. `values-daily` rebuilt Cuckle only. GM prices waited for the tape job.

---

## 2. Daily contract (this pass)

**Morning tape (08:10 UTC / 4:10am ET)**  
Cuckle + GM: fresh `/players/nfl`, transactions, rosters, IR/taxi, traded picks,
waiver/FA/commissioner moves. Rebuild calculator / cuffs / seats. Cuckle skips
dynasty finish rewrite. A today-book self-check **must not** block the commit.

**Market reprice (10:20 UTC / 6:20am ET)**  
Snapshot DP + KTC + FantasyCalc + DynastyDealer. Rebuild Cuckle and GM from
those snaps **and** a fresh Sleeper sweep. Same skip-page / allow-revalue-fail
rules. Do not run `generate-page.mjs`.

**Afternoon catch (22:20 UTC / 6:20pm ET)**  
Same tape job as morning. This is the same-day net for Tuesday cuts, afternoon
IR, waivers, and trades that missed 08:10.

**On demand**  
Actions → `league-sync` for one league. Still `--fresh-players` and
`--allow-revalue-fail`. Still never `generate-page.mjs` from the tape jobs.

Concurrency group `league-sync-1315431339301806080` keeps the two crons from
pushing `main` at the same time.

---

## 3. What each Sleeper pull writes

| File | Source | Dashboard use |
| --- | --- | --- |
| `rosters_now.json` | `/league/{id}/rosters` | Who holds whom; IR slot; taxi |
| `injury_now.json` | `/players/nfl` ∩ rostered ids | NFL IR / Out / PUP on the bag |
| `traded_picks.json` | `/league/{id}/traded_picks` | Calculator pick owners |
| `trades.json` + legs | `transactions/{week}` type=trade | Home tape, receipts, calc hops |
| `moves.json` | same weeks, waiver / FA / commissioner | Wire / IR-slot / FA adds |
| `seats.json` / members | users + rosters | Names and seats |
| `calculator.json` | rosters + injury + today book | Trade options, IR badge |
| `cuffs.json` | rosters + `injury_status` | Starter Out / IR |

Trade tape stays trades only. FAAB is still ignored. Dynasty finish / value
formulas do not change on this sweep.

---

## 4. Values vs tape

Tape and prices are **two jobs on purpose**.

- Tape can ship when KTC/FC/DD drift trips `even today is retired/ktc blend`.
- Prices still snapshot every morning. One dead market reuses yesterday.
- `players.nfl` on these jobs is **forced fresh** (`--fresh-players` /
  `SLEEPER_FRESH_PLAYERS=1`). News-only refresh may keep the 24h cache.
- Cuckle nightly/daily still `--skip-finishes` so dynasty years/pot stay v1.
- GM may rebuild finishes (redraft board). Continue-on-error so Cuckle tape
  still commits if GM fails.

---

## 5. What this is not

- Not a Sleeper webhook / in-process agent. If Sleeper ever ships league
  transaction webhooks, that is a later opt-in next to these crons — not a
  replacement until it has been proven.
- Not the smack / news agent. Tweets stay on `news-refresh`.
- Not ESPN cookie sync. ESPN years stay on the last good `espn-sync`.
- Not a live in-app poll. The phone reads committed `data/leagues/<id>/ui`.
- Not a dynasty formula change. Today blend weights stay 0.25 / 0.30 / 0.25 / 0.20.

---

## 6. Watch these

1. GitHub → Actions → `league-nightly` and `values-daily` must go green or
   yellow (continue-on-error), never skip the commit step because revalue threw.
2. After a known Sleeper trade, `trades.json` and the seat `me/*.json` must
   show it by the next 08:10 or 22:20 run.
3. After a known IR, `injury_now.json` and the calculator row must show IR.
4. If both crons miss a day, run `league-sync` by hand for that league id.

---

## 7. Later (not this pass)

- A true webhook only if Sleeper adds one we can verify.
- A Sunday-only extra poll (noon ET) if afternoon 22:20 is still late on
  game-day IR.
- A Moves door on Data that reads `moves.json`. Raw file first.
- Do not add a third market scrape. One daily snap is the book.
