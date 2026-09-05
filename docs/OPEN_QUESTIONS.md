# CuckleChunckle — Open questions

Truman answers these. Each item: what we assumed, why it matters, recommended default. Until answered, implementers follow the **Recommended** column and do not invent a fourth clock.

---

## 1. Does 300 apply to today, 3y only, or both?

**Assumed:** Window clock only. Today shows Hill at 285.

**Why it matters:** Flooring today zeros Hill and turns Chief’s 2019 bag into “Zeke 0 + Hill 0 = 0 vs Saquon.” That is a different product. Flooring **picks** on 3y (IN FLIGHT) zeros a 215-point 2028 2nd and makes a four-day-old trade look like +406 instead of +254.

**Recommended:** 3y only, and only on **player** snaps (retired / last-gasp = 0). Leave Today and still-a-pick Mid values raw. Keep `MIN_ACTIVE` as a named constant so we can tune 250 / 300 / 400 without a rewrite.

---

## 2. Average vs peak vs AUC as the headline over-time number?

**Assumed:** Mean of surviving year-end snaps in the window (IN FLIGHT).

**Why it matters:** Peak crowns one spike year. Sum/AUC makes 2019 trades look richer than 2025 trades because they have more dates. Mean is the only aggregator that stays comparable once you also show “N dates in mean.”

**Recommended:** Mean as the chip number. Peak / years-above-300 can be a later caption, not a fourth chip.

---

## 3. Window length: 3y vs 2 / 4 / career?

**Assumed:** 3 years after accept (`addYears(t0, 3)`), year-ends that fall in `[t0, cap]`.

**Why it matters:** 2y is “did it hit.” 4y starts eating a second contract. Career-to-today re-creates the Zeke/Saquon today-lie for every old smash. 3y is the first real dynasty stretch you traded for.

**Recommended:** Stay at 3. Do not add length chips until 3y is trusted.

---

## 4. Should Best/Worst / `realized_per_trade` ever use the 3y clock?

**Assumed:** No. Home hero and boards stay today (and aged). Self-check `y3 leaves realized_per_trade` is law.

**Why it matters:** Putting 3y on the hero makes Home lie about “per trade today.” Putting it on Best/Worst before short windows are labeled will crown 2026 deals whose “3 years” is one floored snap.

**Recommended:** Not until (a) Q1 floor-scope is settled, (b) provisional windows are badged, (c) you have looked at Chief–ARae and a 2026 trade side by side and still want a 3y board. Then a **third board clock**, not a replacement.

---

## 5. Year-end only vs denser GitHub dates (weekly / monthly)?

**Assumed:** Year-end + today if today is in the window. Monthly history is already on disk (~75 dates) but y3 does not use it (`ponytail` in `revalue.mjs`: monthly if a mid-year crash must count).

**Why it matters:** Year-end misses a June ACL that is healed on the board by December — or counts a December dump that a September trade never “lived” through for long. Monthly is more honest and 3× the snaps; weekly is almost the full git log and a bigger rebuild. Cost is CPU in `revalue.mjs`, not a new package.

**Recommended:** Keep year-end for the **headline** mean (comparable, cheap). If a specific crash must count, add monthly as a research toggle later — not the default chip.

---

## 6. Flip P&L vs became-player on the over-time lens?

**Assumed:** Over-time = same identity as Today (became-player at each date). Hop tape stays the flip P&L (exit at hop-local; drafter last hop = player-today).

**Why it matters:** If you flipped a 2022 1st in 2020, became-player 3y still scores Wilson after the draft as if the **asset** hit. Your personal hold is the hop `t0 → out` on that sale. Mixing them double-counts or erases the flip.

**Recommended:** Do not merge. Chip = became-player window mean. Hops = hold P&L.

---

## 7. Display: chip vs default vs both on the open row?

**Assumed:** Third chip, not a second hero. Open row shows **one** pair of bags for the active chip. Aged caption stays on the became-player chip when T0 exists. Spark stays full history; later we shade the 3y span.

**Why it matters:** Two bag columns × two clocks is unreadable on a phone. Making 3y the default would hide Today (the water-cooler number everyone already argues about).

**Recommended:** Chip. Default remains Became the player. On the open row, one extra caption line is enough — not a second hero stack.

---

## 8. Pages publish cadence?

**Assumed:** Manual `node build.mjs` (or `value-snapshot` + `revalue` + `generate-page` after a Sleeper sync). `today` is the snapshot machine’s UTC date. No git remote on this folder.

**Why it matters:** A stale `today` makes Aged and 3y-provisional windows drift. Latest DP `as_of` is a clock date, not “when Ken updated the CSV.”

**Recommended:** Rebuild when you care (trade week / after a draft). Show `as of {league.today}` in the Home caption. Automate only if you want this on a phone without a laptop — that is a later ops slice, not product math.

---

## 9. Floor still-a-pick values under 300?

**Assumed in law (VALUE_SDD):** No. Assumed in IN FLIGHT code: Yes (all snaps).

**Why it matters:** This is the Truman–Bubba +406 vs +254 gap. Cheap future picks are not retired players.

**Recommended:** Do not floor picks. If you want “ignore dart throws,” use a **pick** threshold later (e.g. ignore 4ths), not `MIN_ACTIVE`.

---

## 10. When the 3y window is not over, show a number or a dash?

**Assumed (IN FLIGHT):** Show the partial mean (often = floored today).

**Why it matters:** A dash is honest (“come back in 2029”) but makes the chip look broken on half the tape. A number without a badge is a lie of confidence.

**Recommended:** Show the number, badge `not yet 3y`, keep it off any future 3y Best/Worst.

---

## 11. Receiver-only 3-team seats — keep on the meter?

**Assumed (HAVE):** Yes, if they received a player/pick. 2023-01-06 SF69erss sent nothing, Δ +388.

**Why it matters:** “No one-ways” is currently “everyone received,” not “everyone sent.” Stricter filter would drop that seat or the whole trade.

**Recommended:** Keep HAVE. Caption “you sent nothing” so it does not look like a missing bag.

---

## 12. Off-board Today: last-known (Zeke = 3) or 0?

**Assumed (HAVE):** Last-known carry-forward. `off_board` code never fires.

**Why it matters:** Today −1940 is partly “Saquon still 2226, Zeke stuck at 3.” Forcing 0 on first missed monthly file would also zero a one-month scrape miss.

**Recommended:** Leave Today as last-known. Use the 3y floor for dead years. If we later zero Today, require N consecutive missing months, not one gap.

---

## 13. Calc residual and a vote-nudge — when?

**Assumed (this pass):** Calculator prices a 2-team hypothetical on `even` + VA only. League
residual (how the rest of the bags move) and a later prompt to vote on a priced deal stay
specified, not built. See [`VALUE_SDD.md`](VALUE_SDD.md) §12 and [`VOTES_SDD.md`](VOTES_SDD.md).

**Why it matters:** Residual is a second identity if it shares a hero with the even delta. A
nudge that wrote a vote into the book would break the hard rule.

**Recommended:** Next VALUE pass after Home digest. Residual is its own figure. Vote-nudge
writes only a vote.

---

## 14. Where do equipped titles and emblems paint?

**Assumed (this pass):** Barracks + persist only. Header, news byline, trade cards, ledger, and
smack do not read the equipped pair yet. See [`COSMETICS_SDD.md`](COSMETICS_SDD.md).

**Why it matters:** Painting on every name before the catalog is trusted will lock a chrome
decision we have not looked at on 390.

**Recommended:** Show the pair on names after the barracks has been used in-season. No new
tokens when we do.
