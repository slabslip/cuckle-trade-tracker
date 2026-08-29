# KTC Superflex lift sample (40 players)

Look these up on **KeepTradeCut Superflex (2QB)** and send back **name + today’s KTC value**. We will refit the even-flatten / “lift” so Hill-class names do not jump to ~3k.

**Live formula is unchanged until you return numbers.** Do not expect the site or `revalue.mjs` constants to move on this file alone.

## How to look them up

1. Open [Keep Trade Cut dynasty rankings](https://keeptradecut.com/dynasty-rankings) and set the format to **Superflex / 2QB** (KTC `format=2`).
2. Search each name. Copy the **Superflex trade value** (the ~10k-scale number, not 1QB).
3. Paste into the blank `ktc_sf_today` column in [`ktc-lift-sample.csv`](./ktc-lift-sample.csv), or just reply with `Name, 1234` lines.

Our last in-repo snap is **2026-08-28**. That column is a hint only — write **today’s** KTC so we do not fit stale data.

## What to send back

Just **player name + today’s KTC Superflex value**. All 40 is best. If you are short on time, the must-hits are:

- **Tyreek Hill** (the known-too-high point: raw DP **285** → flatten **2892**, last KTC snap **1069**)
- Josh Allen (top / 10k anchor)
- Baker Mayfield (mid-starter)
- Tank Bigsby (young depth)
- One more aging-but-real (Adams / Kittle / Henry)
- One taxi (Milroe or Coleman)

## Why these 40

A curve fit needs the whole Superflex board, not only washed WRs. This set is spaced from Josh Allen **10232** down to taxi **44**, with:

| Band | Who / why |
| --- | --- |
| Elite (5–6+) | Allen, Lamar, Chase, JSN, Burrow, Bijan, Gibbs — QB + skill top, Cuckle-relevant |
| High | Jeanty, Maye, Purdy, Achane, Bowers, McBride — young + TE1/TE2 |
| Mid starters | Baker-range: Goff, CMC, McConkey, Higgins, LaPorta, Baker, Saquon, Judkins |
| Aging-but-real | Stafford, Henry, Adams, Kittle — still startable, not Zeke |
| Low starter | Pierce, Bryce Young, Ferguson — ~500–1.5k raw, Cuckle tape / title |
| Hill-class | **Hill** plus Diggs / Rodgers / Aiyuk / Kelce (same cheap raw-DP neighborhood) |
| Young near Hill | Charbonnet, Shedeur — similar raw DP to Hill, but KTC usually treats them as real pieces |
| Young depth / taxi | Bigsby, Schultz, Spears, Milroe, Coleman — cheap *live* names, not retired leftovers |

Players only (no picks). No Zeke / Chubb / Mixon-class retired leftovers (those are a floor-to-0 problem, not a lift problem). No IDP / unpriced.

Names prefer this league’s **current roster** and **trade tape** so the sample is Cuckle-relevant.

## Numbers in this file

- **raw_dp_sf** = DynastyProcess Superflex `value_2qb` from the 2026-08-28 board (same number we flatten). Board top = **10232** (Josh Allen).
- **current_flatten** = today’s even-flatten:

  ```
  FLAT_SCALE = 10000
  FLAT_EXP = 0.3
  FLAT_TOP_MIX = 0.5
  flatten(v, top) = round(10000 * (w * t + (1-w) * t^0.3))
  where t = v/top, w = t^0.5
  ```

  Hill **285** → **2892**. That is the overshoot. Last KTC snap had Hill at **1069** — that is the neighborhood we want, not ~3k.
- **ktc_sf_last_snap** = mapped value from `data/ktc/latest.json` (2026-08-28). Fill **ktc_sf_today** anyway.
- Flatten constants, `revalue.mjs`, `value-adjust.mjs`, and the live site are **not** changed in this pass.

Paste-back file: [`docs/ktc-lift-sample.csv`](./ktc-lift-sample.csv)

## The 40

| # | Player | Pos | Raw DP SF | Flatten now | Last KTC snap | Today’s KTC SF | Band | Why |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | Josh Allen | QB | 10232 | 10000 | 9986 |  | elite | Board top / flatten anchor (raw DP max) |
| 2 | Lamar Jackson | QB | 9184 | 9013 | 7517 |  | elite | Elite SF QB; tape max in TRACKER |
| 3 | Ja'Marr Chase | WR | 9055 | 8897 | 9975 |  | elite | Elite WR; Cuckle tape |
| 4 | Jaxon Smith-Njigba | WR | 8498 | 8408 | 9221 |  | elite | Elite young WR |
| 5 | Joe Burrow | QB | 8262 | 8207 | 7248 |  | elite | Elite QB; Cuckle hit |
| 6 | Bijan Robinson | RB | 8127 | 8094 | 9994 |  | elite | Elite RB |
| 7 | Jahmyr Gibbs | RB | 7486 | 7575 | 9998 |  | elite | Elite RB; SF69erss title lineup |
| 8 | Ashton Jeanty | RB | 6440 | 6792 | 7381 |  | high | Young RB just under elite |
| 9 | Drake Maye | QB | 6380 | 6749 | 8984 |  | high | Young QB high |
| 10 | Brock Purdy | QB | 5686 | 6277 | 5630 |  | high | Cuckle title QB |
| 11 | De'Von Achane | RB | 4635 | 5627 | 6859 |  | high | Cuckle title RB |
| 12 | Brock Bowers | TE | 4485 | 5541 | 8219 |  | high | TE1 |
| 13 | Trey McBride | TE | 4229 | 5397 | 7350 |  | high | TE2 |
| 14 | Jared Goff | QB | 3613 | 5068 | 4606 |  | mid-starter | Mid starter QB |
| 15 | Christian McCaffrey | RB | 3571 | 5046 | 5279 |  | mid-starter | Aging star still mid-board |
| 16 | Ladd McConkey | WR | 3407 | 4962 | 5723 |  | mid-starter | Young mid WR |
| 17 | Tee Higgins | WR | 3094 | 4807 | 5083 |  | mid-starter | Mid WR |
| 18 | Sam LaPorta | TE | 3022 | 4772 | 4559 |  | mid-starter | Mid TE |
| 19 | Baker Mayfield | QB | 2588 | 4563 | 4620 |  | mid-starter | Named Baker-range calibration QB |
| 20 | Saquon Barkley | RB | 2226 | 4391 | 5281 |  | mid-starter | Mid RB; Cuckle tape (Chief–ARae bag) |
| 21 | Quinshon Judkins | RB | 2154 | 4357 | 5298 |  | mid-starter | Young RB; Cuckle title draft |
| 22 | Matthew Stafford | QB | 1511 | 4036 | 3721 |  | aging-but-real | Aging starter QB |
| 23 | Alec Pierce | WR | 1356 | 3951 | 3693 |  | low-starter | Cuckle tape WR; fills 1.3k gap |
| 24 | Derrick Henry | RB | 1206 | 3862 | 4223 |  | aging-but-real | Aging RB still a real piece |
| 25 | Bryce Young | QB | 1124 | 3811 | 3740 |  | low-starter | Cuckle title QB; low-starter range |
| 26 | Davante Adams | WR | 899 | 3652 | 3415 |  | aging-but-real | Aging WR still starting |
| 27 | George Kittle | TE | 830 | 3597 | 3320 |  | aging-but-real | Aging TE still starting |
| 28 | Jake Ferguson | TE | 572 | 3346 | 3118 |  | low-starter | Fills ~500–700 TE gap; Cuckle tape |
| 29 | Zach Charbonnet | RB | 388 | 3091 | 3248 |  | young-near-hill | Young RB at Hill-ish raw DP (KTC much higher) |
| 30 | Shedeur Sanders | QB | 314 | 2954 | 2467 |  | young-near-hill | Young QB at Hill-ish raw DP |
| 31 | Stefon Diggs | WR | 287 | 2896 | 2659 |  | hill-class | Same DP neighborhood as Hill; KTC snap much higher |
| 32 | Tyreek Hill **← known too high** | WR | 285 | 2892 | 1069 |  | hill-class | KNOWN TOO HIGH — flatten ~2892 vs KTC snap 1069 |
| 33 | Aaron Rodgers | QB | 275 | 2869 | 1979 |  | hill-class | Aging QB, Hill-class raw DP |
| 34 | Brandon Aiyuk | WR | 265 | 2846 | 1036 |  | hill-class | Hill-like KTC snap (~1.0k) at similar raw DP |
| 35 | Travis Kelce | TE | 225 | 2743 | 2515 |  | hill-class | Aging TE still real |
| 36 | Dalton Schultz | TE | 121 | 2367 | 2317 |  | young-depth | Cuckle tape TE; Bigsby-class raw |
| 37 | Tyjae Spears | RB | 92 | 2211 | 2525 |  | young-depth | Young RB depth |
| 38 | Tank Bigsby | RB | 83 | 2154 | 2542 |  | young-depth | Named young-depth calibration RB |
| 39 | Jalen Milroe | QB | 49 | 1878 | 2101 |  | taxi | Young taxi QB (cheap live name, not retired) |
| 40 | Keon Coleman | WR | 44 | 1825 | 2357 |  | taxi | Young taxi WR |

## After you send values

We will fit a less aggressive lift so Hill-class stays near your KTC (around 1k, not 3k), while elite names stay near 10k and Bigsby-class does not get dragged to a retired floor. Nothing goes live until that refit is agreed.
