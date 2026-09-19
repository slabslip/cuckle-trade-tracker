# Dynasty dashboard — the overnight letter

**Status:** v1 shipping. Home paints one **league** overnight letter with a gold
share chip. The share is a text + `?r=overnight&league=&src=share` link, not a
first-person “Text this” poke.

**Companion:** tape cadence [`sleeper_daily_sweep.md`](./sleeper_daily_sweep.md)
(PR #157). Memory chips [`MEMORY_SDD.md`](../MEMORY_SDD.md). Home law
[`UI_SDD.md`](../UI_SDD.md). News quarantine [`NEWS_SDD.md`](../NEWS_SDD.md).

---

## 0. The one-sentence verdict

Chuckle is the best **receipt** in dynasty and a weak **morning paper**.
Managers open it when they are already fighting. They do not open it to see
what happened while they slept.

KTC, Sleeper, and FantasyCalc already won “more numbers.” We cannot out-database
them. We can be the only app that writes **last night’s minutes for this
ten-team book** and hands the league a card they can drop in the group text
before work.

---

## 1. Why “Text this” was lame — and why a league letter is the product

A first-person poke (“Your night… Text this”) is a coach in your pocket. Ten
guys do not want a coach. They want **the same facts**, named, so the group
chat has a commissioner.

The real product is already the group text. Sleeper pings are personal and
vanish. KTC has no seat names. Memory is how this league argues. The overnight
letter is the official record of last night: one dated card, both bags named,
who holds the hurt skill players, gold chip, one link.

That is the need. Not a streak. Not a bag total. **Someone has to write the
first message every morning.** Status goes to whoever drops the minutes.
Chuckle writes them. The chip sends them. The link is how the other nine open
the same card — signed-in on Home, unsigned on the public ticket, then claim.

---

## 2. Full room audit (HAVE)

| Room | What it is good at | Why it is not daily |
| --- | --- | --- |
| **Home** | Calling card, four board doors, calc door, 1–3 Team Ideas | Was undated. The letter is the dateline. |
| **Teams** | Career museum: titles, tape, partners, rookies | Great the week after the title game. Dead in Week 4. |
| **News** | Shared tweets, seat-tagged, locker-room voice | Manual only. Tab stays member shares. |
| **Ledger** | Handshake wagers, clocks, trash | High heat for two degenerates. Zero for the other eight on a Tuesday. |
| **Data / Menu** | 13 memory doors, calc, settings, barracks | Encyclopedia. You open it to win an argument, not to start the day. |
| **Calculator** | Best 2-team scale we have (today blend + VA + cuff) | A trade-day tool. Most mornings there is no trade. |
| **Cuffs / IR** | Starter → backup; `injury_now` after the sweep | Was buried. The letter now surfaces the league IR / Out board. |

**What we must not pretend is missing:**

- Another value formula. The today book is settled.
- Best 10 / Worst 10. Removed twice. Dead.
- Bag-total heroes on Home. Law.
- A sixth pill. Law.
- Lineup optimizer / playoff odds / waiver AI. Parked on purpose.
- A first-person “Text this” / “That’s not how I remember” poke. Rejected.

---

## 3. v1 shape — shareable league summary

Not a new tab. Not a per-seat slip. **One letter per league.**

```text
data/leagues/<id>/ui/overnight.json
```

`build-overnight.mjs` runs after the calculator in `build.mjs`. Daily jobs
already run that chain. Do not run `generate-page.mjs`.

Home, signed-in or not, paints the card above the tape. Unsigned `?r=overnight`
opens the same card as a public receipt (existing gold share path).

### Card (one screen, ~390px)

**Dateline** — `Sat Sep 19 · CuckleChunkle`

**Lede** — one English verdict, no numbers from the meter:

- `Quiet night`
- `1 trade last night`
- `2 trades last night`
- `Wire moved · no trades`

**Trades** — named both sides (`A sent X · B sent Y`). If the night is quiet,
say so, then **Last deal** from the tape so the letter is never empty.

**Wire** — named waiver / FA / commish from `moves.json`
(`TipsUp waiver claimed Pearsall · dropped X`). Empty section collapses.

**On IR / Out** — ranked by the existing calculator book (no numbers on the
card), skill / Out / starters ahead of taxi. A.J. Brown and a Darnold Out
beat a taxi rookie. Cap 12 in JSON / 6 on the card.

**Gold share chip** — existing `.tile-share`. Sends `overnightShareText()` +
`?r=overnight&league=&src=share`. No “Text this” label.

### Share text (the group-chat body)

The letter *is* the text. One fact per line. Link underneath via
`shareProofNow`. Example quiet Tuesday:

```text
Sat Sep 19 · CuckleChunkle
Quiet night

No trades last night.
Last deal · TrumanCooper sent Justin Jefferson + Keaton Mitchell · DarkWingDucks2023 sent Marvin Harrison + 2027 2nd + 2028 1st + 2028 2nd

On IR / Out
A.J. Brown · SF69erss
James Conner · …
```

### What a quiet Tuesday looks like (this is the product)

No trade. No tweet. Still a letter: dateline, Quiet night, last deal, IR board,
one chip. Trade week is easy. Dead week is the test.

---

## 4. Why this is a venture, not a feature

| Old category | New category |
| --- | --- |
| Dynasty analytics dashboard | League minutes |
| “Come research” | “We already wrote last night” |
| Compete with KTC’s board | Compete with the group chat’s first message |
| More tiles | One dated, shareable artifact |

**Moat:** eight years of *this* hop tape + live pick holders + `injury_now` ∩
rosters + share chips. Sleeper cannot say “the 2028 3rd you think you have is
Bubba’s.” KTC cannot say “A.J. Brown is IR on SF69erss.” FantasyCalc cannot
hand the thread a link that opens the same card for all ten.

**Distribution:** we do not need push for v1 (parked). One manager hitting the
gold chip *is* the notification for the other nine. That is how this league
already lives.

**Need loop (no streak badge):**

1. Morning tape lands.
2. Home shows the letter.
3. Someone shares it to the thread (status).
4. Nine phones open the same card.
5. Argument uses named bags, not memory.

**Expansion:** every booked league gets its own letter. GM redraft gets a
different voice (money games, lineup week) later. Do not mix the books.

**What we are not:** a marketplace, an accept-odds engine, a second Twitter,
Yahoo’s waiver bot, or a first-person coach.

---

## 5. How the letter is written (no new formula)

| Input | File | Line it feeds |
| --- | --- | --- |
| Complete trades since yesterday | `trade_tape.json` | Trades / Last deal |
| Waiver / FA / commissioner | `moves.json` | Named wire |
| IR / Out / PUP / NFI on rostered ids | `injury_now.json` + `rosters_now.json` | On IR / Out |
| Seat names | `members.json` | Every line |
| Player names on the wire | `players.nfl.json` | Wire |

Rules:

- League voice. “Truman sent Jefferson,” not “Your bag.”
- Empty sections collapse. Quiet night still prints last deal + IR.
- No `fmt()` / `today_delta` / VA / bag totals on the letter.
- Do not invent a fake Upgrade to fill space.
- News tab stays member shares. The letter does not become automated roster news.
- Rebuild writes the letter in `build.mjs` after calculator. Do not run
  `generate-page.mjs`.

---

## 6. What is next (ranked, do not start at the bottom)

v1 is the letter + chip + public link. Then:

1. **Yesterday’s calculator snap** so a later line can say “markets bid up /
   cooler” in words — still no bag total.
2. **24h question** two or three mornings a week, expire at next dateline.
   Opinion stays quarantined (News / Ledger / Votes). Not v1.
3. Re-open **automated roster news** *into the letter only*, not back onto the
   News tab.
4. Push / PWA later. The letter has to be good in the tab and in iMessage first.

Still parked, still correct:

- League Oracle, waiver hot sheet as a product, lineup-vs-optimal, playoff odds
- Accept-odds marketplace
- Title paint on every byline
- Per-seat first-person slip
- Weekly grind awards that need legal lineups

---

## 7. How we know it worked

Not DAU vanity. This league is ten phones.

- A manager shares the letter into the group text without being asked.
- A quiet Tuesday letter is still opened (IR / Out / last deal).
- The public `?r=overnight` link opens the same card for an unsigned phone.
- News tab stays a share feed. The letter does not drown it.

Fail: Home grows a fourth section and the letter becomes another tile.
Fail: we put “Text this” back on the card.

---

## 8. Decision

Lock the shareable **league overnight letter** as the Cuckle Home daily habit.
Do not add research surfaces until this card is the first message in the thread.
