# Dynasty dashboard — the overnight letter

**Status:** v1 shipping on **Cuckle dynasty Home only**. `overnightEnabled()`
is false for GM / any redraft book. Home paints one **league** overnight letter
in dashboard chrome (Trades / Wire / Out / IR meters, titled lists). The gold
share chip still sends text + `?r=overnight&league=&src=share`.
Every dynasty **team homepage** paints a matching **team analyzer** in the
same dashboard chrome as the Home letter (lineup, depth, outlook,
cornerstones, sell / target, C↔R, value grades, draft capital, gold image
chip). GM / redraft stay off. Do not mix the books.

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

Dashboard chrome (same card, type, and gold as the rest of Home). Collapsed
card is Out / IR only. Trades, wire, meters, and PUP wait on Show all.

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

**Lists** — titled, color-coded bands: Trades (ice), Wire (green), Out (orange),
IR (gold), PUP/NFI (violet). Rows are name + pos + owner. Collapsed preview is
four per list; **Show all** expands the rest. Share always sends every name.

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

v1 is the letter + chip + public link. That is distribution. Then, in this
order, only facts that make **missing the letter expensive**:

1. **Hurt starter → cuff owner (or unowned)** on the IR/Out lines. Data is
   already in `cuffs.json`. Tonight: Nico Collins Out on TipsUp, cuff
   unowned. That is a waiver, not a roster list. Do this before any new
   surface.
2. **Yesterday’s injury / tape snap** so the lede can say “Nico went Out
   last night,” not reprint a 36-man IR museum. Delta is the addiction.
   Status board is a museum.
3. **Live pick-holder ghost** only when it is live (“Truman still does not
   hold that 2028 3rd”). Already true in the calc. One line on the letter
   the morning after someone gets it wrong.
4. **Yesterday’s calculator snap** so a later line can say “markets bid up /
   cooler” in words — still no bag total.
5. **24h question** two or three mornings a week, expire at next dateline.
   Opinion stays quarantined. FOMO, not cost. Do not lead with this.
6. Re-open **automated roster news** *into the letter only*, not back onto
   the News tab.
7. Push / PWA later. If one manager already drops the letter in the thread,
   push is a copy of a copy.

Still parked, still correct:

- League Oracle, waiver hot sheet as a product, lineup-vs-optimal, playoff odds
- Accept-odds marketplace
- Title paint on every byline
- Per-seat first-person slip
- Weekly grind awards that need legal lineups

---

## 7. Need law — how this becomes something they cannot skip

v1 is a newspaper. Newspapers are optional. A need is when **not reading it
can cost you a player, a pick, or a fight you then lose in public.**

Sleeper already owns the action surface (lineups, waivers, the accept
button). We will not beat that. Chuckle can own the **truth surface**: the
thing you check *before* you act, because being wrong is expensive.

This league has two need moments. Everything else is a museum.

| Moment | Cost of missing it | What Chuckle already is |
| --- | --- | --- |
| **Morning** | You leave a cuff on the wire, start a ghost, or argue last night from memory | The letter, if it prints delta + consequence |
| **Trade** | You offer a pick you do not hold, or take a deal the book already priced | Calculator + live `traded_picks` + eight-year tape |

### What “so good they need it” actually means here

Not delight. Not a streak. Not a sixth tab. Ten phones. The test is:

1. **The share text stands alone in iMessage.** If they have to open the app
   to learn the fact, nine guys will not. The letter is the product. The
   link is the courthouse for when they disagree.
2. **One fact per night can change Sunday.** Hurt starter + who owns the
   cuff (or “unowned”). Named claim. Named trade. A pick-holder ghost.
   A board of six IR names is awareness. “Nico Out · TipsUp · cuff
   unowned” is a call without saying “Text this.”
3. **Being wrong in the thread is worse than opening Chuckle.** The tape
   is the only witness for eight years of hops. The letter points at last
   night. The calc is the scale they already accept. Once “run it through
   Chuckle” is how this league talks, the app is infrastructure.
4. **One manager sending it nightly installs the rest.** Status goes to
   whoever drops the minutes. After two weeks it is “the overnight,” the
   way standup is standup. You do not need standup until the team runs
   on it. We cannot code that. We can make the card worth sending.

### What will never be a need (do not build to chase the feeling)

- More tiles, Oracle, lineup-vs-optimal, playoff odds — Sleeper and Yahoo
  already own “tell me who to start.” A worse copy is not a need.
- First-person coaching. Rejected. Ten guys do not want a voice in their
  pocket. They want the same facts.
- Bag totals on Home. A number to fight about is not a reason to come
  back tomorrow.
- News as a second Twitter. If nobody pastes, the tab is dead. Correct.
- Ledger, for the other eight. Need for two degenerates. Leave it there.
- Push before the letter is the first message. A badge on a skippable
  card trains them to swipe it away.

### The revolutionary shape (not a new product)

Chuckle is not an app they open. It is the league’s **shared memory**,
delivered in the thread they already live in.

- Overnight letter = briefing
- Calculator = courthouse
- Tape = archive
- Group text = distribution

Revolution is becoming that infrastructure for *this* ten-team book, then
every booked league gets its own minutes. KTC cannot name TipsUp. Sleeper
cannot say the cuff is unowned in one sentence both sides will accept.
FantasyCalc cannot hand the thread a link that opens the same card.

### How we know it crossed from nice to need

- A manager shares the letter without being asked, more than once.
- A waiver or a start happens *because* of a cuff / unowned line.
- Someone loses a group-text argument and pastes the `?r=overnight` card
  or a calc link instead of typing a paragraph.
- A quiet Tuesday still gets sent, because last deal + one Out/cuff line
  is still true.

Fail: we add a fourth Home section and call it revolution.
Fail: we put “Text this” back on the card.

---

## 8. How we know it worked

Not DAU vanity. This league is ten phones.

- A manager shares the letter into the group text without being asked.
- A quiet Tuesday letter is still opened (IR / Out / last deal).
- The public `?r=overnight` link opens the same card for an unsigned phone.
- News tab stays a share feed. The letter does not drown it.

Fail: Home grows a fourth section and the letter becomes another tile.
Fail: we put “Text this” back on the card.

---

## 8b. Team analyzer (dynasty team home)

Same dashboard chrome as the Home letter, every seat. `teamAnalyzerEnabled()`
is false for GM / redraft. Grades are `teamAnalyzerValueGrade` — each desk
slot’s `calcValueNum` against `deskCuts` stud / start / mid. Same bag always
prints the same 0–10. Depth is the next two after the lineup on that same
scale, not vs the league floor. Draft capital sums owned `calcBook.picks`
values vs twelve starter cuts. Team grade is 70% positions / 15% depth / 15% draft.
Archetype is Dual elite QB / Elite QB / Dual elite [pos] else the
seat-direction label. Outlook and C↔R stay captions from
`seat-direction.json`. The gold chip saves `cuckle-team.png`. Depth names the extras that
exist, not a hard-coded eight. `scripts/loop-team-analyzer.mjs` reprints
all ten seats. No `fmt()`, no bag totals, no new value formula.

---

## 9. Decision

Lock the shareable **league overnight letter** as the Cuckle Home daily habit.
Do not add research surfaces until this card is the first message in the thread.
The next cut is not a new room. It is the one line that makes missing the
letter expensive: hurt starter → cuff owner or unowned. See §9.
