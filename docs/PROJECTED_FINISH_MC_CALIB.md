# Expected finish — multi-season Monte Carlo calibration

Ran **2500** sims per checkpoint × season (2019, 2020, 2021, 2022, 2023, 2024, 2025). Checkpoints: week 1, 6, 12, end of playoffs.

## Accuracy by checkpoint (mean across seasons)

| Checkpoint | Book MAE | MC MAE | Book corr | MC corr | MC 80% coverage |
|---|---|---|---|---|---|
| W1 | 2.943 | 2.358 | 0.245 | 0.296 | 0.9 |
| W6 | 1.743 | 1.506 | 0.704 | 0.737 | 0.857 |
| W12 | 1.714 | 1.138 | 0.697 | 0.844 | 0.843 |
| Playoffs | 0 | 0 | 1 | 1 | 1 |

## Week-scaled blend (encoded)

| Week | race | path | ease | arc | form | trend |
|---|---|---|---|---|---|---|
| 1 | 0.364 | 0.213 | 0.108 | 0.152 | 0.091 | 0.072 |
| 6 | 0.307 | 0.263 | 0.103 | 0.116 | 0.11 | 0.101 |
| 12 | 0.245 | 0.316 | 0.097 | 0.078 | 0.131 | 0.133 |

## Biggest W6 book misses (all seasons)

| Season | Seat | Book | MC mean | Actual | Miss book | In MC 80% |
|---|---|---|---|---|---|---|
| 2019 | ARae | #6 | #7.058 | #1 | +5 | no |
| 2021 | TrumanCooper | #3 | #4.034 | #8 | -5 | no |
| 2021 | ChiefGumby | #7 | #3.981 | #2 | +5 | yes |
| 2019 | ChiefGumby | #3 | #3.999 | #7 | -4 | no |
| 2019 | SF69erss | #5 | #6.8 | #9 | -4 | yes |
| 2020 | bigjberg | #2 | #3.77 | #6 | -4 | yes |
| 2020 | TedCumberbatch | #4 | #6.571 | #8 | -4 | yes |
| 2021 | bigjberg | #2 | #2.515 | #6 | -4 | no |
| 2023 | bigjberg | #10 | #7.397 | #6 | +4 | yes |
| 2024 | ChiefGumby | #3 | #4.199 | #7 | -4 | no |
| 2024 | KingHenryXXVI | #6 | #4.412 | #2 | +4 | yes |
| 2019 | TipsUp | #1 | #2.674 | #4 | -3 | yes |
| 2019 | TedCumberbatch | #8 | #6.576 | #5 | +3 | yes |
| 2020 | TrumanCooper | #5 | #5.843 | #2 | +3 | yes |
| 2021 | BubbaCuckShremp | #6 | #6.413 | #3 | +3 | no |

## Playbook

- Week-scale the blend: early (W1) overweight race+arc; mid (W6) balanced; late (W12) overweight path+trend+form.
- Publish MC bands (p10–p90) beside proj_finish — actuals land in the 80% band ~coverage rate; treat outside-band seats as acquisition/injury shocks.
- Prefer MC mean place when book and MC disagree by ≥2 at W6+ — MC captures schedule variance the point blend smooths over.
- W1 grades are noisy (high MAE); show wide bands and soft language, do not lock draft bands off W1 alone.
- W12 should be near-final — if book MAE stays high, path/SoS is underweighted vs live scoring.
- Keep heat + form_slope (2025 W6 retro); MC shows volume of paths, not deal quality — still need acquisition shock later.

## Per-season snapshots

### 2019 W1 — book MAE 3, MC MAE 2.232, coverage 0.9

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TipsUp | #3 | #1 | #4.457 | #4 | -3 | 1–8 |
| ChiefGumby | #4 | #2 | #5.075 | #7 | -5 | 1–9 |
| KingHenryXXVI | #1 | #3 | #3.06 | #2 | +1 | 1–6 |
| TrumanCooper | #5 | #4 | #5.162 | #8 | -4 | 2–9 |
| bigjberg | #2 | #5 | #4.054 | #3 | +2 | 1–8 |
| SF69erss | #7 | #6 | #6.394 | #9 | -3 | 2–10 |
| BubbaCuckShremp | #8 | #7 | #6.679 | #6 | +1 | 2–10 |
| ARae | #9 | #8 | #6.855 | #1 | +7 | 3–10 |
| TedCumberbatch | #10 | #9 | #7.055 | #5 | +4 | 3–10 |
| DarkWingDucks2023 | #6 | #10 | #6.21 | #10 | 0 | 2–10 |

### 2019 W6 — book MAE 2.6, MC MAE 1.952, coverage 0.8

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TipsUp | #2 | #1 | #2.674 | #4 | -3 | 1–5 |
| bigjberg | #1 | #2 | #2.209 | #3 | -1 | 1–4 |
| ChiefGumby | #3 | #3 | #3.999 | #7 | -4 | 2–6 |
| KingHenryXXVI | #4 | #4 | #3.354 | #2 | +2 | 1–6 |
| SF69erss | #7 | #5 | #6.8 | #9 | -4 | 3–10 |
| ARae | #10 | #6 | #7.058 | #1 | +5 | 3–10 |
| BubbaCuckShremp | #6 | #7 | #6.395 | #6 | +1 | 3–9 |
| TedCumberbatch | #5 | #8 | #6.576 | #5 | +3 | 4–9 |
| DarkWingDucks2023 | #8 | #9 | #7.561 | #10 | -1 | 5–10 |
| TrumanCooper | #9 | #10 | #8.376 | #8 | +2 | 6–10 |

### 2019 W12 — book MAE 1.8, MC MAE 0.634, coverage 0.9

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| bigjberg | #1 | #1 | #2.125 | #3 | -2 | 1–4 |
| TipsUp | #3 | #2 | #3.495 | #4 | -2 | 1–5 |
| TedCumberbatch | #6 | #3 | #5.039 | #5 | -2 | 3–6 |
| KingHenryXXVI | #2 | #4 | #2.089 | #2 | +2 | 1–4 |
| ARae | #4 | #5 | #4.043 | #1 | +4 | 2–6 |
| BubbaCuckShremp | #5 | #6 | #4.208 | #6 | 0 | 2–6 |
| TrumanCooper | #8 | #7 | #8 | #8 | -1 | 8–8 |
| DarkWingDucks2023 | #10 | #8 | #10 | #10 | -2 | 10–10 |
| ChiefGumby | #7 | #9 | #7 | #7 | +2 | 7–7 |
| SF69erss | #9 | #10 | #9 | #9 | +1 | 9–9 |

### 2020 W1 — book MAE 3.4, MC MAE 2.646, coverage 0.8

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TipsUp | #3 | #1 | #4.541 | #7 | -6 | 1–8 |
| DarkWingDucks2023 | #1 | #2 | #2.962 | #5 | -3 | 1–6 |
| TedCumberbatch | #5 | #3 | #5.732 | #8 | -5 | 2–9 |
| KingHenryXXVI | #2 | #4 | #4.373 | #4 | 0 | 1–8 |
| bigjberg | #4 | #5 | #4.937 | #6 | -1 | 1–9 |
| ARae | #8 | #6 | #6.089 | #1 | +5 | 2–10 |
| ChiefGumby | #6 | #7 | #5.868 | #3 | +4 | 2–10 |
| SF69erss | #7 | #8 | #6.316 | #10 | -2 | 2–10 |
| BubbaCuckShremp | #10 | #9 | #7.281 | #9 | 0 | 3–10 |
| TrumanCooper | #9 | #10 | #6.9 | #2 | +8 | 3–10 |

### 2020 W6 — book MAE 2.2, MC MAE 1.33, coverage 1

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| ChiefGumby | #4 | #1 | #3.662 | #3 | -2 | 1–6 |
| bigjberg | #3 | #2 | #3.77 | #6 | -4 | 1–6 |
| ARae | #2 | #3 | #2.902 | #1 | +2 | 1–5 |
| TedCumberbatch | #7 | #4 | #6.571 | #8 | -4 | 4–9 |
| TrumanCooper | #6 | #5 | #5.843 | #2 | +3 | 2–8 |
| KingHenryXXVI | #1 | #6 | #3.537 | #4 | +2 | 1–6 |
| DarkWingDucks2023 | #5 | #7 | #3.643 | #5 | +2 | 1–7 |
| TipsUp | #8 | #8 | #6.566 | #7 | +1 | 3–9 |
| SF69erss | #9 | #9 | #9.265 | #10 | -1 | 8–10 |
| BubbaCuckShremp | #10 | #10 | #9.24 | #9 | +1 | 8–10 |

### 2020 W12 — book MAE 2.2, MC MAE 1.214, coverage 0.9

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| bigjberg | #5 | #1 | #4.327 | #6 | -5 | 2–6 |
| TipsUp | #7 | #2 | #5.357 | #7 | -5 | 2–7 |
| ChiefGumby | #4 | #3 | #3.944 | #3 | 0 | 1–6 |
| ARae | #1 | #4 | #2.244 | #1 | +3 | 1–4 |
| KingHenryXXVI | #2 | #5 | #3.237 | #4 | +1 | 1–5 |
| TrumanCooper | #6 | #6 | #5.731 | #2 | +4 | 3–7 |
| DarkWingDucks2023 | #3 | #7 | #3.161 | #5 | +2 | 1–5 |
| TedCumberbatch | #8 | #8 | #8 | #8 | 0 | 8–8 |
| SF69erss | #10 | #9 | #9.849 | #10 | -1 | 9–10 |
| BubbaCuckShremp | #9 | #10 | #9.151 | #9 | +1 | 9–10 |

### 2021 W1 — book MAE 4, MC MAE 3.026, coverage 0.9

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| bigjberg | #1 | #1 | #3.692 | #6 | -5 | 1–7 |
| TedCumberbatch | #5 | #2 | #5.077 | #7 | -5 | 2–9 |
| ARae | #4 | #3 | #4.21 | #1 | +2 | 1–8 |
| KingHenryXXVI | #2 | #4 | #4.115 | #10 | -6 | 1–8 |
| DarkWingDucks2023 | #3 | #5 | #4.17 | #5 | 0 | 1–8 |
| SF69erss | #8 | #6 | #6.347 | #9 | -3 | 2–10 |
| TrumanCooper | #7 | #7 | #6.469 | #8 | -1 | 2–10 |
| BubbaCuckShremp | #9 | #8 | #7.064 | #3 | +5 | 3–10 |
| ChiefGumby | #6 | #9 | #6.089 | #2 | +7 | 2–10 |
| TipsUp | #10 | #10 | #7.767 | #4 | +6 | 4–10 |

### 2021 W6 — book MAE 2.2, MC MAE 2.166, coverage 0.6

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| ARae | #1 | #1 | #2.094 | #1 | 0 | 1–4 |
| bigjberg | #2 | #2 | #2.515 | #6 | -4 | 1–4 |
| TrumanCooper | #4 | #3 | #4.034 | #8 | -5 | 1–6 |
| DarkWingDucks2023 | #3 | #4 | #4.076 | #5 | -1 | 2–6 |
| TipsUp | #9 | #5 | #8.083 | #4 | +1 | 6–10 |
| BubbaCuckShremp | #6 | #6 | #6.413 | #3 | +3 | 4–9 |
| ChiefGumby | #5 | #7 | #3.981 | #2 | +5 | 1–6 |
| SF69erss | #8 | #8 | #7.808 | #9 | -1 | 6–10 |
| TedCumberbatch | #7 | #9 | #7.26 | #7 | +2 | 4–10 |
| KingHenryXXVI | #10 | #10 | #8.736 | #10 | 0 | 7–10 |

### 2021 W12 — book MAE 2.4, MC MAE 1.808, coverage 0.7

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| ARae | #1 | #1 | #2.142 | #1 | 0 | 1–4 |
| TipsUp | #4 | #2 | #4.197 | #4 | -2 | 2–6 |
| ChiefGumby | #3 | #3 | #3.451 | #2 | +1 | 1–5 |
| bigjberg | #2 | #4 | #2.509 | #6 | -2 | 1–4 |
| TrumanCooper | #6 | #5 | #5.229 | #8 | -3 | 2–7 |
| TedCumberbatch | #7 | #6 | #5.187 | #7 | -1 | 2–7 |
| SF69erss | #10 | #7 | #9.467 | #9 | -2 | 8–10 |
| KingHenryXXVI | #9 | #8 | #9.034 | #10 | -2 | 8–10 |
| BubbaCuckShremp | #8 | #9 | #8.46 | #3 | +6 | 8–9 |
| DarkWingDucks2023 | #5 | #10 | #5.324 | #5 | +5 | 3–7 |

### 2022 W1 — book MAE 2.6, MC MAE 2.07, coverage 1

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TedCumberbatch | #3 | #1 | #4.273 | #5 | -4 | 1–8 |
| ARae | #1 | #2 | #3.758 | #2 | 0 | 1–7 |
| KingHenryXXVI | #2 | #3 | #4.003 | #4 | -1 | 1–8 |
| bigjberg | #4 | #4 | #4.462 | #7 | -3 | 1–8 |
| DarkWingDucks2023 | #5 | #5 | #5.482 | #6 | -1 | 2–9 |
| SF69erss | #8 | #6 | #6.571 | #10 | -4 | 2–10 |
| TipsUp | #9 | #7 | #7.075 | #3 | +4 | 3–10 |
| ChiefGumby | #6 | #8 | #5.517 | #1 | +7 | 1–9 |
| TrumanCooper | #7 | #9 | #6.471 | #8 | +1 | 2–10 |
| BubbaCuckShremp | #10 | #10 | #7.39 | #9 | +1 | 3–10 |

### 2022 W6 — book MAE 0.8, MC MAE 1.025, coverage 0.9

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| ARae | #1 | #1 | #2.138 | #2 | -1 | 1–4 |
| ChiefGumby | #2 | #2 | #2.325 | #1 | +1 | 1–4 |
| TipsUp | #5 | #3 | #4.856 | #3 | 0 | 2–7 |
| TedCumberbatch | #6 | #4 | #5.631 | #5 | -1 | 3–7 |
| KingHenryXXVI | #3 | #5 | #3.609 | #4 | +1 | 1–6 |
| bigjberg | #4 | #6 | #3.556 | #7 | -1 | 1–5 |
| DarkWingDucks2023 | #7 | #7 | #6.366 | #6 | +1 | 4–8 |
| BubbaCuckShremp | #10 | #8 | #9.218 | #9 | -1 | 8–10 |
| TrumanCooper | #9 | #9 | #8.589 | #8 | +1 | 7–10 |
| SF69erss | #8 | #10 | #8.712 | #10 | 0 | 7–10 |

### 2022 W12 — book MAE 1.4, MC MAE 0.927, coverage 0.9

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TedCumberbatch | #7 | #1 | #5.646 | #5 | -4 | 3–7 |
| TipsUp | #3 | #2 | #3.976 | #3 | -1 | 2–6 |
| ARae | #1 | #3 | #2.072 | #2 | +1 | 1–4 |
| ChiefGumby | #2 | #4 | #2.232 | #1 | +3 | 1–4 |
| bigjberg | #5 | #5 | #4.248 | #7 | -2 | 2–6 |
| DarkWingDucks2023 | #4 | #6 | #4.523 | #6 | 0 | 2–7 |
| KingHenryXXVI | #6 | #7 | #5.303 | #4 | +3 | 2–7 |
| TrumanCooper | #8 | #8 | #8.406 | #8 | 0 | 8–9 |
| BubbaCuckShremp | #9 | #9 | #8.876 | #9 | 0 | 8–10 |
| SF69erss | #10 | #10 | #9.718 | #10 | 0 | 9–10 |

### 2023 W1 — book MAE 2.4, MC MAE 2.242, coverage 0.8

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| SF69erss | #1 | #1 | #3.416 | #4 | -3 | 1–7 |
| TedCumberbatch | #5 | #2 | #5.485 | #1 | +1 | 2–9 |
| ARae | #3 | #3 | #4.527 | #5 | -2 | 1–8 |
| TipsUp | #2 | #4 | #4.252 | #3 | +1 | 1–8 |
| DarkWingDucks2023 | #4 | #5 | #5.361 | #9 | -4 | 2–9 |
| TrumanCooper | #8 | #6 | #6.26 | #2 | +4 | 2–10 |
| ChiefGumby | #9 | #7 | #6.39 | #8 | -1 | 2–10 |
| KingHenryXXVI | #6 | #8 | #5.096 | #10 | -2 | 1–9 |
| bigjberg | #7 | #9 | #6.084 | #6 | +3 | 2–10 |
| BubbaCuckShremp | #10 | #10 | #8.128 | #7 | +3 | 5–10 |

### 2023 W6 — book MAE 1.6, MC MAE 1.515, coverage 1

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TrumanCooper | #3 | #1 | #3.017 | #2 | -1 | 1–5 |
| TipsUp | #1 | #2 | #2.76 | #3 | -1 | 1–5 |
| SF69erss | #2 | #3 | #2.701 | #4 | -1 | 1–5 |
| TedCumberbatch | #5 | #4 | #4.21 | #1 | +3 | 1–6 |
| ARae | #4 | #5 | #3.587 | #5 | 0 | 1–6 |
| ChiefGumby | #6 | #6 | #6.18 | #8 | -2 | 4–8 |
| DarkWingDucks2023 | #10 | #7 | #8.654 | #9 | -2 | 7–10 |
| BubbaCuckShremp | #9 | #8 | #8.951 | #7 | +1 | 7–10 |
| KingHenryXXVI | #8 | #9 | #7.543 | #10 | -1 | 6–10 |
| bigjberg | #7 | #10 | #7.397 | #6 | +4 | 6–9 |

### 2023 W12 — book MAE 1.4, MC MAE 1.282, coverage 0.9

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TipsUp | #2 | #1 | #2.546 | #3 | -2 | 1–4 |
| SF69erss | #1 | #2 | #1.916 | #4 | -2 | 1–3 |
| TedCumberbatch | #3 | #3 | #3.356 | #1 | +2 | 1–5 |
| TrumanCooper | #5 | #4 | #4.045 | #2 | +2 | 2–5 |
| ARae | #4 | #5 | #3.685 | #5 | 0 | 2–5 |
| BubbaCuckShremp | #6 | #6 | #6.327 | #7 | -1 | 4–8 |
| bigjberg | #9 | #7 | #7.892 | #6 | +1 | 6–10 |
| DarkWingDucks2023 | #7 | #8 | #7.762 | #9 | -1 | 6–9 |
| KingHenryXXVI | #10 | #9 | #9.355 | #10 | -1 | 8–10 |
| ChiefGumby | #8 | #10 | #8.116 | #8 | +2 | 7–10 |

### 2024 W1 — book MAE 2.4, MC MAE 1.935, coverage 1

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TedCumberbatch | #5 | #1 | #5.263 | #4 | -3 | 2–9 |
| ARae | #2 | #2 | #4.358 | #6 | -4 | 1–8 |
| TipsUp | #1 | #3 | #3.582 | #3 | 0 | 1–7 |
| ChiefGumby | #4 | #4 | #4.797 | #7 | -3 | 1–8 |
| KingHenryXXVI | #3 | #5 | #4.634 | #2 | +3 | 1–8 |
| SF69erss | #6 | #6 | #4.518 | #1 | +5 | 1–9 |
| TrumanCooper | #7 | #7 | #6.675 | #5 | +2 | 2–10 |
| BubbaCuckShremp | #8 | #8 | #6.748 | #9 | -1 | 2–10 |
| bigjberg | #9 | #9 | #6.874 | #10 | -1 | 3–10 |
| DarkWingDucks2023 | #10 | #10 | #7.55 | #8 | +2 | 4–10 |

### 2024 W6 — book MAE 1.4, MC MAE 0.961, coverage 0.9

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| SF69erss | #2 | #1 | #1.909 | #1 | 0 | 1–3 |
| TipsUp | #1 | #2 | #2.594 | #3 | -1 | 1–4 |
| ChiefGumby | #3 | #3 | #4.199 | #7 | -4 | 2–6 |
| TedCumberbatch | #4 | #4 | #3.782 | #4 | 0 | 1–6 |
| TrumanCooper | #6 | #5 | #5.374 | #5 | 0 | 3–8 |
| KingHenryXXVI | #5 | #6 | #4.412 | #2 | +4 | 2–6 |
| BubbaCuckShremp | #9 | #7 | #8.704 | #9 | -2 | 7–10 |
| ARae | #7 | #8 | #7.112 | #6 | +2 | 5–9 |
| DarkWingDucks2023 | #8 | #9 | #7.35 | #8 | +1 | 5–9 |
| bigjberg | #10 | #10 | #9.564 | #10 | 0 | 9–10 |

### 2024 W12 — book MAE 1.8, MC MAE 0.917, coverage 0.8

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| SF69erss | #1 | #1 | #1.744 | #1 | 0 | 1–3 |
| KingHenryXXVI | #4 | #2 | #3.486 | #2 | 0 | 1–5 |
| ChiefGumby | #6 | #3 | #5.176 | #7 | -4 | 3–6 |
| TipsUp | #2 | #4 | #2.718 | #3 | +1 | 1–4 |
| TedCumberbatch | #3 | #5 | #3.318 | #4 | +1 | 1–5 |
| bigjberg | #9 | #6 | #8.915 | #10 | -4 | 7–10 |
| TrumanCooper | #5 | #7 | #4.732 | #5 | +2 | 3–6 |
| BubbaCuckShremp | #10 | #8 | #9.479 | #9 | -1 | 8–10 |
| DarkWingDucks2023 | #8 | #9 | #7.558 | #8 | +1 | 7–9 |
| ARae | #7 | #10 | #7.874 | #6 | +4 | 7–9 |

### 2025 W1 — book MAE 2.8, MC MAE 2.358, coverage 0.9

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TipsUp | #4 | #1 | #4.597 | #2 | -1 | 1–8 |
| TrumanCooper | #5 | #2 | #5.258 | #5 | -3 | 2–9 |
| SF69erss | #1 | #3 | #3.672 | #1 | +2 | 1–7 |
| DarkWingDucks2023 | #3 | #4 | #4.418 | #6 | -2 | 1–8 |
| bigjberg | #2 | #5 | #4.434 | #7 | -2 | 1–8 |
| ARae | #7 | #6 | #5.798 | #9 | -3 | 2–9 |
| BubbaCuckShremp | #6 | #7 | #5.56 | #10 | -3 | 2–9 |
| TedCumberbatch | #9 | #8 | #6.676 | #3 | +5 | 2–10 |
| KingHenryXXVI | #8 | #9 | #6.27 | #4 | +5 | 2–10 |
| ChiefGumby | #10 | #10 | #8.318 | #8 | +2 | 5–10 |

### 2025 W6 — book MAE 1.4, MC MAE 1.596, coverage 0.8

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| TedCumberbatch | #1 | #1 | #1.975 | #3 | -2 | 1–4 |
| TipsUp | #5 | #2 | #3.546 | #2 | 0 | 1–6 |
| SF69erss | #2 | #3 | #3.068 | #1 | +2 | 1–5 |
| KingHenryXXVI | #4 | #4 | #3.772 | #4 | 0 | 2–6 |
| DarkWingDucks2023 | #3 | #5 | #3.598 | #6 | -1 | 1–6 |
| ChiefGumby | #9 | #6 | #8.335 | #8 | -2 | 6–10 |
| TrumanCooper | #10 | #7 | #9.031 | #5 | +2 | 7–10 |
| BubbaCuckShremp | #8 | #8 | #7.287 | #10 | -2 | 6–9 |
| bigjberg | #7 | #9 | #6.828 | #7 | +2 | 4–9 |
| ARae | #6 | #10 | #7.56 | #9 | +1 | 6–9 |

### 2025 W12 — book MAE 1, MC MAE 1.183, coverage 0.8

| Seat | Now | Book | MC | Actual | Miss book | Band |
|---|---|---|---|---|---|---|
| SF69erss | #1 | #1 | #2.373 | #1 | 0 | 1–4 |
| TedCumberbatch | #2 | #2 | #1.794 | #3 | -1 | 1–3 |
| TipsUp | #3 | #3 | #3.328 | #2 | +1 | 1–5 |
| KingHenryXXVI | #5 | #4 | #4.282 | #4 | 0 | 2–6 |
| DarkWingDucks2023 | #4 | #5 | #4.117 | #6 | -1 | 2–6 |
| ChiefGumby | #6 | #6 | #6.073 | #8 | -2 | 4–7 |
| bigjberg | #7 | #7 | #6.403 | #7 | 0 | 4–8 |
| TrumanCooper | #8 | #8 | #7.93 | #5 | +3 | 7–9 |
| BubbaCuckShremp | #10 | #9 | #10 | #10 | -1 | 10–10 |
| ARae | #9 | #10 | #8.699 | #9 | +1 | 8–9 |
