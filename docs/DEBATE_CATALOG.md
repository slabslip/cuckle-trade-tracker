# Debate catalog — tape first

**Role:** The fights Cuckle already had, proven by the hop tape — not by scraping
Sleeper chat. Use this list to **rank doors** on Your board. Do not add a 17th
chip kind. Do not put quotes on a public receipt.

Companion: chip law [`MEMORY_SDD.md`](MEMORY_SDD.md). Parked scrape
[`APP_SDD.md`](APP_SDD.md) §11. Open later: opt-in paste
[`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) Q18.

This file is **WANT for ranking**. If a tile face disagrees with the hottest
row for that chip, the face is behind — change the example, not the catalog
shape.

---

## 1. Lock

Eight seasons (2019 startup → 2026), ten seats, about 290 completed two-way
deals. Heat comes from clocks, hops, titles, partner volume, held future
firsts, and the forever / passed-around lists already on the Data desks.

**Still cut:** Best 10 / Worst 10, bag-total rank, luck, H2H grade,
votes-as-receipt, Ledger stakes. Direction (Hard rebuild) is a **label on a
League row**, not a trophy chip.

**Chat:** parked. Sleeper REST in `sleeper-sync.mjs` has league / users /
rosters / transactions — no messages. Until a member exports or pastes a
thread (same pattern as News / Ledger), this list is the hop tape.

---

## 2. How heat is ranked

Not a Best 10 of people. Same eight tests as the desks:

1. **Aged smash/bust** — largest `|all − t0|` on a completed 2-team deal
2. **Day they traded** — largest `|t0|`
3. **Pick journeys** — used 1sts with ≥3 hops, or origin ≠ `used_by`
4. **Repeat opponents** — `me/*.json` `partners[].trades`
5. **Title vs now** — `titles.json` then current place / direction
6. **Held future 1sts** — 2027+ still-picks vs who sold them
7. **Passed around** — `player_lists.most_traded`
8. **Forever** — 2019 startup still home (`player_lists.forever`)

Each row: fight sentence, seats, date, tape hook, chip id, why it is heat.

---

## 3. Ranked Cuckle fights

### 1. How this deal aged — `trade_mark`

| Fight | Seats | Date | Hook | Why it is heat |
|-------|-------|------|------|----------------|
| This deal faded after they accepted. Hilton was the smash that day. | ChiefGumby vs TedCumberbatch | 2021-05-17 | `700010112802177024` · t0 +3986 → all −2245 · aged −6230 | Widest fade on the book. Ted sent Hilton, got Amon-Ra. |
| This deal grew after they accepted. The pick became Breece. | SF69erss vs TrumanCooper | 2021-10-31 | `760676752560521216` · t0 −4298 → all +1877 · aged +6175 | Widest grow. Same week as the Rudolph / Hall cluster. |
| This deal faded. Reagor was the bag. | DarkWingDucks2023 vs TedCumberbatch | 2022-01-23 | `790804578261118976` · aged −5752 | Follow-on smash that died. |
| This deal grew. Chase Brown from then to now. | TipsUp vs TrumanCooper | 2024-11-27 | `1167644560894377984` · aged +4273 | Recent enough that both seats still argue it. |
| This deal grew. Purdy was even on the day. | SF69erss vs ChiefGumby | 2023-05-19 | `965432936277311488` · t0 0 → all +4185 | “Even at accept” that became a title piece. |

**Default-six face:** Hilton fade (largest `|aged|`) or Breece grow — one
breath, signed gold number.

### 2. Smash the day they clicked accept — `lopsided` / `widest_clock`

| Fight | Seats | Date | Hook | Why it is heat |
|-------|-------|------|------|----------------|
| That Darnold deal was a smash the day they traded. | bigjberg vs TrumanCooper | 2019-09-16 | `479358775203983360` · t0 +10237 | Widest accept-day margin in the book. |
| That Caleb deal looked like a robbery the day they traded. | ARae vs BubbaCuckShremp | 2024-02-15 | `1063954191099535360` · t0 −8722 | Second-widest. ARae paid a 1st pile; Caleb is now on bigjberg. |
| CEH was a smash they still feel. | SF69erss vs DarkWingDucks2023 | 2021-05-19 | `700833467239305216` · t0 −6686 · all −9159 | Accept-day hole that did not heal. |
| CeeDee for a bag — smash at accept. | TrumanCooper vs TedCumberbatch | 2025-09-04 | `1269369347395026944` · t0 −6618 | Fresh. Ted sold a stud; Truman still underwater on the clock. |
| Nabers cost a fortune the day they clicked. | ARae vs KingHenryXXVI | 2024-10-03 | `1147621361330987008` · t0 −5712 | Same rebuild window as Caleb. |

Same deal, different question (`widest_clock`): Darnold stays huge on `all`
(+9268). Caleb shrank toward even (−5463). That is the “I remember it
differently” fight.

### 3. What did that 1st become — `pick_print`

| Fight | Seats | Season | Hook | Why it is heat |
|-------|-------|--------|------|----------------|
| You sold this 1st. They used it. It is Breece Hall now. | SF69erss origin · TedCumberbatch used | 2022 | `pick:2022:1:1` · 6 hops | Longest used-1st hop tape. Tile face for a seller. |
| You sold this 1st. They used it. It is Bijan Robinson now. | TrumanCooper origin · ARae used | 2023 | `pick:2023:1:7` · 4 hops · Truman → SF → Ducks → Truman → ARae | The room already uses this sentence. Bijan now sits on TipsUp. |
| You sold this 1st. They used it. It is Garrett Wilson now. | TrumanCooper origin · Truman used | 2022 | `pick:2022:1:7` · 5 hops | Sold, came home, used. |
| You sold this 1st. They used it. It is Chris Olave now. | BubbaCuckShremp origin · TipsUp used | 2022 | `pick:2022:1:8` · 4 hops | Olave later left TipsUp in the rebuild window. |
| You sold this 1st. They used it. It is Colston Loveland now. | SF69erss origin · bigjberg used | 2025 | `pick:2025:1:1` · 4 hops | Fresh first, already not home. |
| You sold this 1st. They used it. It is Ashton Jeanty now. | DarkWingDucks2023 origin · bigjberg used | 2025 | `pick:2025:1:9` · 4 hops | Same class as Loveland. |

**Default-six face:** the claimed seat’s highest-story used 1st (Truman’s
board already leads Breece / Bijan-class first-person). Portal = every pick
that seat ever owned.

### 3b. My Picks — `my_picks`

Same hop tape as `pick_print`, origin-only. Truman’s board lists
`pick:2023:1:7` (Bijan) and `pick:2022:1:7` (Garrett Wilson) because those
slots started on TrumanCooper, even after a sale. A pick Truman later
owned that started on another seat stays off this door.

### 4. Who actually won the year — `season_place` / `past_champions`

| Season | Champion | How | Final | Thesis (tape) |
|--------|----------|-----|-------|----------------|
| 2025 | SF69erss | Bracket (2nd in points) | beat TipsUp, 190–163 | Repeat. 11 of 13 title starters from opening. |
| 2024 | SF69erss | Points race | beat KingHenryXXVI, 210–170 | 12 of 13 from opening. |
| 2023 | TedCumberbatch | Bracket (3rd in points) | beat TrumanCooper, 209–158 | Leap from 5th. Quiet trade year. |
| 2022 | ChiefGumby | Points race | beat ARae, 124–115 | Quiet year. Playoff adds. |
| 2021 | ARae | Points race | beat ChiefGumby, 194–157 | Three-peat. 16 of 16 from opening. |
| 2020 | ARae | Points race | beat TrumanCooper, 215–197 | Repeat. |
| 2019 | ARae | Bracket (4th in points) | beat KingHenryXXVI, 188–150 | Startup. Josh Allen drafted, still home. |

**Now (2025 place):** SF 1st, TipsUp 2nd, … Truman 5th, ChiefGumby 8th Hard
rebuild, ARae 9th Hard rebuild (sold Bijan, sitting on 11 2027s), Bubba 10th.

Fight sentence: “We have always been a playoff team” dies on ARae 2019–21
then 9th. “SF bought the titles” dies on opening-roster counts.

### 5. Your tape vs one name — `vs_you`

Highest completed-deal volume (not a grade):

| Pair | Deals |
|------|------:|
| SF69erss vs TrumanCooper | 29 |
| SF69erss vs DarkWingDucks2023 | 21 |
| SF69erss vs ARae | 21 |
| SF69erss vs TedCumberbatch | 14 |
| TipsUp vs TrumanCooper | 14 |
| SF69erss vs bigjberg | 12 |
| DarkWingDucks2023 vs TipsUp | 12 |

Fight: “I barely trade with them.” Tape: 29 SF–Truman deals, including Breece
and the 2022 Bijan hop. Face = the claimed seat’s busiest partner.

### 6. Who is sitting on future 1sts — `held_firsts`

2025–26 window (`seat-direction.json`), not career:

| Seat | Label | 2027s held | 2027+ firsts (pick tape) | Heat |
|------|-------|----------:|-------------------------:|------|
| ARae | Hard rebuild | 11 | 6 | Sold Bijan and Caleb. “I never sell picks” is a lie; they *bought* the future. |
| ChiefGumby | Hard rebuild | 8 | 4 | 8th place, sold Olave. |
| TipsUp | Win-now | 0 | 1 later 1st | 2nd in 2025, aging core, 0 2027s. |
| TrumanCooper | Reload | 2 | 4 | Sold Mahomes; still holds 2027 firsts. |

Fight: “Who is actually tanking?” Count 2027 firsts, not bag total.

### 7. Forever — `forever`

2019 startup, never traded, still on that seat (~7.1y):

| Player | Seat |
|--------|------|
| Josh Allen | ARae |
| Jared Goff | KingHenryXXVI |
| D.K. Metcalf | KingHenryXXVI |
| Courtland Sutton | bigjberg |
| T.J. Hockenson | KingHenryXXVI |

Josh Allen is also the highest **piece** in the book (10003, ARae) — forever
and `book_top` meet on one name. Homesteaders (not startup): Burrow on Bubba,
Herbert on Truman, JT / Love on Ted (~6.3y).

### 8. Passed around — `passed_around`

| Player | Trades | Now |
|--------|-------:|-----|
| Sam Darnold | 7 | ChiefGumby |
| Tony Pollard | 6 | TrumanCooper |
| Calvin Ridley | 6 | SF69erss |
| Kenneth Walker | 5 | KingHenryXXVI |
| Christian Watson | 5 | TedCumberbatch |

Pick-hop cousin (not the same list): Eli Stowers 7 hops, Breece Hall 6 hops
as a *pick* before the name stuck. Darnold is the player-tape fight; Breece
is the pick-tape fight.

### 9. Rookie draft surplus — `draft_marks`

`drafters_rookie` total surplus (not a person GPA):

| Seat | Surplus | Hit they still mention |
|------|--------:|------------------------|
| TipsUp | +3723 | Jalen Hurts, 2020 3rd (+4422) |
| Everyone else | negative | Truman Herbert 2020 3rd (+4696) is a hit on a red seat |

Fight: “I won the draft.” Only TipsUp is green on the career rookie book.
Single hits (Chase +5508 Ted, Amon-Ra +5336 Chief, JSN +4387 SF) live on the
ticket, not as a Best 10 board.

### 10. Direction this window — label only

Not a chip. `seat-direction.json` window 2024–2026:

- SF Reload (repeat champ, sold McBride, still long)
- TipsUp Win-now (0 2027s)
- ARae / Chief / Bubba Hard rebuild

Do not mint “best rebuilder.”

### 11. Uninsured starters — `uninsured`

Cuff not rostered (today’s book). Highest-heat names, not a count trophy:

| Seat | Starter | Missing cuff |
|------|---------|--------------|
| ARae | Josh Allen | Kyle Allen (FA) |
| DarkWingDucks2023 | Drake Maye / Trey McBride | Tommy DeVito / Elijah Higgins |
| TipsUp | Trevor Lawrence / Sam LaPorta | Carter Bradley / Brock Wright |
| TrumanCooper | Justin Herbert | Trey Lance (not the real cuff) |

Fight: “My QB is fine.” Tape: the cuff is not on the roster.

### 12. Highest pieces — `book_top`

Not a seat total. Today’s top names:

| Piece | Value | Owner |
|-------|------:|-------|
| Josh Allen | 10003 | ARae |
| Ja'Marr Chase | 9592 | TedCumberbatch |
| Bijan Robinson | 9505 | TipsUp |
| Jahmyr Gibbs | 9480 | SF69erss |
| Jaxon Smith-Njigba | 8860 | bigjberg |
| Puka Nacua | 8389 | ARae |

Bijan on TipsUp after ARae used the 2023 1st is the pick-print → book-top
crossover.

---

## 4. Default-six faces this catalog wants

| Door | Face the room should see first |
|------|--------------------------------|
| `trade_mark` | Hilton fade or Breece grow (`700010112802177024` / `760676752560521216`) |
| `pick_print` | This seat’s sold-then-used 1st (Breece / Bijan class) |
| `my_picks` | Origin slots only (Truman 2023 1st → Bijan) |
| `season_place` | Last title (SF 2025) or this seat’s place |
| `lopsided` | Darnold t0 +10237 (`479358775203983360`) |
| `forever` | Josh Allen · ARae · 7.1y |
| `past_champions` | ARae three-peat then SF repeat |

A later pass may bias `receiptLeadTrade` / `receiptLeadPick` to these hooks.
That is a separate UI change. This file does not ship UI.

---

## 5. How this refines tiles

- Rank **examples**, not new kinds. Sixteen chips stay sixteen.
- Portal search stays scenario-scoped. No chat search box.
- Public `?r=` receipts stay tape numbers. No “room said …” line.
- No sixth bar item. No News remount. Votes never enter these numbers.

---

## 6. Appendix — Sleeper chat (parked)

| Fact | Law |
|------|-----|
| Official GETs we run | League, users, rosters, weekly transactions. No messages. |
| GraphQL we already touch | `get_player_news` (NFL), not league chat. |
| APP_SDD §11 | **No** Sleeper chat / comments scrape — no public API; privacy/ToS. |
| Ledger / News | Forward or paste only. The app does not read the group text. |

If chat is ever wanted later:

1. Member export or Shortcut paste (consent-by-action).
2. Private table, not `data/` on Pages. No raw 7-year log in git.
3. Link a thread to an existing chip + `transaction_id` / pick key.
4. Opinion layer only. Numbers stay tape.

Until then, the debate list is this file.

---

## 7. Acceptance

A reader can name the hottest Cuckle fight per chip in one breath, with a
date and a hook. An implementer can bias a tile face without inventing
`debate_*`. Chat scrape is still **No**.
