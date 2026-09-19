# Dynasty dashboard — venture review and the daily-habit bet

**Status:** Strategy lock for the next Cuckle pass. Not built. Do not start Oracle,
lineup-vs-optimal, playoff odds, or a sixth tab. Those are parked in
[`PRODUCT.md`](../PRODUCT.md) for a reason.

**Companion:** tape cadence [`sleeper_daily_sweep.md`](./sleeper_daily_sweep.md)
(PR #157). Memory chips [`MEMORY_SDD.md`](../MEMORY_SDD.md). Home law
[`UI_SDD.md`](../UI_SDD.md). News quarantine [`NEWS_SDD.md`](../NEWS_SDD.md).

---

## 0. The one-sentence verdict

Chuckle is the best **receipt** in dynasty and a weak **morning paper**.
Managers open it when they are already fighting. They do not open it to see
what happened while they slept. That is the whole habit problem.

KTC, Sleeper, and FantasyCalc already won “more numbers.” We cannot out-database
them. We can be the only app that writes **one first-person letter about this
ten-team book** and hands the manager a sentence they can drop in the group
text before work.

---

## 1. Full room audit (HAVE)

| Room | What it is good at | Why it is not daily |
| --- | --- | --- |
| **Home** | Calling card, four board doors, calc door, 1–3 Team Ideas | No dateline. No “since yesterday.” Ideas do not say why *today*. On a quiet Tuesday it is a museum lobby. |
| **Teams** | Career museum: titles, tape, partners, rookies | Great the week after the title game. Dead in Week 4. |
| **News** | Shared tweets, seat-tagged, locker-room voice | Manual only. If nobody shares, the tab is a blank Alerts slot. Automated roster news is **built and switched off**. |
| **Ledger** | Handshake wagers, clocks, trash | High heat for two degenerates. Zero for the other eight on a Tuesday. |
| **Data / Menu** | 13 memory doors, calc, settings, barracks | Encyclopedia. You open it to win an argument, not to start the day. |
| **Calculator** | Best 2-team scale we have (today blend + VA + cuff) | A trade-day tool. Most mornings there is no trade. |
| **Cuffs / IR** | Starter → backup; `injury_now` after the sweep | Buried. Home never says “Pearsall is IR on your IR slot.” |

**What we already have that no competitor has, unused as a daily loop:**

- Eight seasons of *this* league’s hop tape (not a generic ranker)
- First-person seat identity (`you` is Truman, not “Team 7”)
- Share chips that already exist to be texted
- A twice-daily Sleeper sweep (trades, waivers, IR, values) that Home does not narrate
- Team Ideas that are real talks, not “players you may like”
- Smack voice that already knows upbeat-IR vs real IR
- Memory law: one English verdict, one gold number, Text this

**What we must not pretend is missing:**

- Another value formula. The today book is settled.
- Best 10 / Worst 10. Removed twice. Dead.
- Bag-total heroes on Home. Law.
- A sixth pill. Law.
- Lineup optimizer / playoff odds / waiver AI. That is Sleeper+ Yahoo. Parked on purpose.
- Painting titles on every byline before the daily letter exists.

---

## 2. Why ten guys do not open this every day

Dynasty managers already have a morning stack:

1. Group text (the real product)
2. Sleeper (roster / IR / waivers)
3. Twitter / the News tab *if someone pasted a tweet*
4. KTC when they are bored or about to trade

Chuckle is step 5, and only when someone says “look at the tape.”

Home *calls* itself the daily paper ([`UI_SDD.md`](../UI_SDD.md) §1) and then
paints **undated** doors and a calc banner. A newspaper without yesterday’s
date is a binder. Team Ideas can be the same three talks for a week. Values
move every morning at 10:20 UTC and nobody is told “your bag moved.” IR lands
in `injury_now.json` and dies in a JSON file.

The habit we accidentally built: **open Chuckle after the fight starts.**

The habit we need: **open Chuckle to start the fight.**

---

## 3. The out-of-the-box bet — the Overnight Slip

Not a new tab. Not a new tile wall. **Home becomes a dated letter.**

After the morning tape + value snap (and again after the 22:20 catch), the
pipeline writes one first-person artifact per seat:

```text
data/leagues/<id>/ui/me/<user_id>.slip.json
```

Home, signed-in, cold-loads **that letter** above the calc door. Board doors
and Team Ideas drop *under* it, or hide until the letter is short. Unsigned
users still see the water cooler (calc + doors). The slip is identity, so it
follows the signed-in seat the same way Team Ideas already do.

### Shape (one screen, ~8 lines, 390px)

**Dateline** — `Sat Sep 20 · Cuckle · overnight`

**Your night** — at most three facts, all *your* bag:

- Pearsall is IR (league IR slot)
- A.J. Brown is IR and still on your bench
- Zay Flowers is Doubtful · markets cooler

**The league night** — at most three facts about the other nine:

- Truman flipped Harrison + a 2028 1st for Jefferson (already on tape)
- Bubba still holds Bubba’s 2028 3rd (live `traded_picks`, not hop tape)
- Waiver: X added Y (from `moves.json`, not a fake wire AI)

**One sentence to send** — already written, one Share chip. Examples:

- “That’s not how I remember the Hilton deal.” → existing `trade_mark` ticket
- “Pearsall is IR on Truman. The cuff is on Chief.” → cuff + injury
- “Would you rather hold Flowers or sell this morning?” → 24h question

**One door** — one button. Prefills calc, opens the vote, or opens the idea.
Never three CTAs.

### The 24-hour question (the streak without a streak counter)

Last line of the slip, some mornings only: **one league question that dies at
the next dateline.** Everyone takes a side. It is not a trade vote and not a
receipt. Opinion stays quarantined (same wall as News / Ledger / Votes).

This is the Duolingo loop without a flame icon: you open to see if you look
stupid next to last night’s take. The group text is the distribution. Chuckle
is the ballot.

Do **not** put a “4-day streak” badge on Home. The reward is looking sharp in
the chat, not a counter.

### What a quiet Tuesday looks like (this is the product)

No trade. No tweet. Still a letter:

> Sat Sep 20 · Cuckle · overnight
> Your night: Pearsall IR. Flowers Doubtful.
> League night: nobody moved. Bubba’s 2028 3rd still his.
> Send: “Pearsall is IR and the cuff is on Chief.”
> Door: Team Idea — sell a WR, you are Win-now thin at RB.

That Tuesday is why people come back. Trade week is easy. Dead week is the
test.

---

## 4. Why this is a venture, not a feature

| Old category | New category |
| --- | --- |
| Dynasty analytics dashboard | League social OS |
| “Come research” | “We already wrote the text” |
| Compete with KTC’s board | Compete with the group chat’s first message |
| More tiles | One dated artifact |

**Moat:** eight years of *this* hop tape + first-person names + share chips +
smack polarity. Sleeper cannot say “the 2028 3rd you think you have is
Bubba’s.” KTC cannot say “Pearsall is on Truman’s IR, cuff on Chief.”
FantasyCalc cannot hand Truman a sentence he can text TipsUp.

**Distribution:** we do not need push for v1 (parked). The slip is designed to
be screenshotted. One manager posting the letter *is* the notification for the
other nine. That is how this league already lives.

**Expansion:** every booked league gets its own letter. GM redraft gets a
different voice (money games, lineup week) later. Do not mix the books.

**What we are not:** a marketplace, an accept-odds engine, a second Twitter, or
Yahoo’s waiver bot.

---

## 5. How the letter is written (no new formula)

Inputs we already have or just shipped:

| Input | File | Line it feeds |
| --- | --- | --- |
| IR / Out / Doubtful on *your* ids | `injury_now.json` + `rosters_now.json` | Your night |
| Today blend vs yesterday’s committed snap | `calculator.json` as_of + prior `calculator.json` (or `ktc/latest` vs prior date) | “markets bid up / cooler” — words only, no bag total |
| Complete trades since last slip | `trades.json` | League night |
| Waiver / FA / commissioner | `moves.json` | League night |
| Live pick holders | `traded_picks.json` | “you do not hold that 3rd” |
| Shared tweets tagged to your guys | `news.json` | Your night, one line, still quarantined |
| Direction + holes | `seat-direction.json` + Team Ideas | The one door |
| Hottest memory fight | [`DEBATE_CATALOG.md`](../DEBATE_CATALOG.md) | Sentence to send, only if nothing overnight is hotter |

Rules:

- First person. “Your IR,” not “Roster 7 reserve.”
- Max three + three + one + one. Cut the weakest line. Empty sections collapse.
- No `fmt()` / `today_delta` / VA on the letter. Same quarantine as News.
- “Markets cooler” is a word from the existing Team Ideas meta, not a new hero number.
- If the overnight is empty, say so. Do not invent a fake Upgrade to fill space.
- Rebuild writes the slip in `build.mjs` after calculator + cuffs + direction.
  Daily jobs already run that chain. Do not run `generate-page.mjs`.

---

## 6. What we are missing (ranked)

Ship order if we take this bet. Do not start at the bottom.

1. **Dateline + Your night** from `injury_now` + roster news (one slip JSON, Home paint).
2. **League night** from new trades + `moves.json` + live pick holders.
3. **One sentence to send** — reuse share-chip paint, do not invent a 17th memory kind.
4. **One door** — existing Team Idea or calc prefill, tagged “because last night.”
5. **Yesterday’s calculator snap** so “markets bid up” is real, not vibes.
6. **24h question** two or three mornings a week, expire at next dateline.
7. Re-open **automated roster news** *into the slip only*, not back onto the
   News tab. The tab stays member shares. That honors the 2026-08-30 wipe.
8. Push / PWA later. The letter has to be good in the tab first.

Still parked, still correct:

- League Oracle, waiver hot sheet as a product, lineup-vs-optimal, playoff odds
- Accept-odds marketplace
- Title paint on every byline
- Weekly grind awards that need legal lineups

---

## 7. How we know it worked

Not DAU vanity. This league is ten phones.

- A manager screenshots the slip into the group text without being asked.
- A quiet Tuesday letter is still opened (IR / Doubtful / “nobody moved”).
- A pick-holder line stops another Truman-2028-3rd ghost.
- Team Ideas taps come *from the door on the slip*, not from scrolling past a
  banner to find them.
- News tab stays a share feed. The slip does not drown it.

Fail: Home grows a fourth section and the letter becomes another tile.

---

## 8. Decision

**Recommended:** lock the Overnight Slip as the next Cuckle Home pass. Do not
add research surfaces until the letter exists.

Until Truman says go, this file is the want. The generator stays behind on
purpose.
