# Smack talk & summary agent

Living guide for how shared tweets become **fact + optional poke**, and how you
coach the voice over time. Edit this file as the register evolves — it is the
brief for humans and for the LLM path.

> Pair with [`NEWS_SDD.md`](NEWS_SDD.md) §6 / §10 (pipeline) and
> [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) §3b (Shortcut). Code seam:
> `news-voice.mjs` → `leagueLine()` / `leagueLineAsync()`.

---

## 1. What the agent does

Every shared tweet becomes one feed row with:

| Field | Who writes it | Shown on the row? |
| --- | --- | --- |
| `tweet_text` | X (oEmbed) | No (matching / expander only) |
| `league_line` | **This agent** — fact, then maybe a poke | Yes |
| `note` | You (optional jab) | Yes, attributed above the line |
| `agent_tip` | You (optional coaching) | **No** — saved for the agent only |

**Fact first.** `summariseTweet()` lifts a contiguous span of the tweet’s own
words, classifies the kind (Injury / Roster move / …), and attaches credit.
It does not invent.

**Poke second — only when it earns it.** `tweetWantsPoke()` / `tweetPokeKind()`:

| Kind | When | Bank |
| --- | --- | --- |
| `injury` | Hurt / IR / PUP / misses time (not “cleared” / not “avoiding IR”) | `tweet_injury` |
| `cut` | Waived / released / cut (not “kept on the 53”) | `tweet_cut` |
| `retire` | Announced retirement (not “coming *out* of retirement”) | `tweet_retire` |
| `off` | Suspension / off-field | `tweet_off` |
| *(none)* | Made the roster, kept, buzz, good injury news, … | **fact only** |

Single-seat rows may say “you”. Multi-tag / The league stay impersonal
(`tweet_league`). **Never** put the manager’s display name in the poke — that
lives in the header.

Automated (non-tweet) rows still use the longer `{who}` / `{player}` banks
(`injury`, `trade`, …) in `TEMPLATES`.

### Reading injury polarity (do not miss this)

The word **IR** alone is not enough to decide poke vs fact-only. Read the
**assertion**, not the keyword.

| Tweet says | Fantasy meaning | Voice |
| --- | --- | --- |
| Placed on IR / starts the season on IR / PUP | Out — missed time | **Injury** + poke |
| **Not** starting on IR / not going on IR / avoided IR / not on IR / off IR | Healthy enough to be **active** — may play immediately | **Good injury news**, fact only |
| Cleared / returning / upgraded / expected to play | Upside for the owner | **Good injury news**, fact only |

**Worked example (2026-08-31).** Shared post: *“Keaton Mitchell is not going to
start on IR to start the season…”* That is **positive** for whoever rosters him:
he is not opening the year on the shelf; he may be available Week 1. The first
voice pass saw the bare `IR` token, labelled it Injury, and needled the seat
(“Ouch…”). Wrong. Correct line: *Good injury news — …* with **no poke**.

Code: `readsUpbeat()` / `UPBEAT_IR_AVOID` in `news-voice.mjs`; `tweetPokeKind()`
returns `""` when injury is upbeat. Revoice after changing those patterns.

---

## 2. House rules (do not loosen casually)

1. Needle the **roster decision**, the **timing**, or the **player** — not
   appearance, family, money, or anything a friend would not laugh at.
2. Never invent a fact the tweet did not state.
3. Informational posts do not need smack. Cuts and **real** hurts do.
   Negated IR / cleared / returning are informational — **no poke**.
4. The sharer’s public `note` is **their** voice. The agent’s poke is **ours**.
   Keep them separate.
5. Variant choice is a **hash of the item id**, not `Math.random()`, so a line
   is stable for a given story.
6. Keywords are not polarity. “IR” in “not on IR” is good news; “IR” in
   “placed on IR” is bad. Always parse the negation.

---

## 3. Coaching the agent (how it learns like you)

### 3a. Optional Shortcut field: `agent_tip`

One-tap **Send to Cuckle** stays `{url, submitted_by}` only.

When you want to coach a share, use the **with tip** recipe in
`SUPABASE_SETUP.md` §3b: an Ask / Dictation step writes into **`agent_tip`**.

- **Not** the same as `note`. `note` is public trash talk on the row.
- **`agent_tip`** is private coaching: tone, who to aim at, a line you would
  have said, “too soft”, “no poke — this is just roster news”, etc.
- Length: up to 500 characters in Supabase; trimmed like other free text.

### 3b. Where tips are saved

On every ingest that carries an `agent_tip`, `news-sync.mjs` appends a row to:

```
data/smack-tips.json
```

Shape (append-only log):

```json
{
  "v": 1,
  "tips": [
    {
      "id": "tip:51:1788136832711",
      "submission_id": 51,
      "tweet_url": "https://x.com/.../status/...",
      "submitted_by": "TrumanCooper",
      "created_at": "2026-08-31T00:00:00.000Z",
      "tip": "lean harder — he overdrafted this guy",
      "player": "Will Levis",
      "managers": ["TedCumberbatch"],
      "poke_kind": "cut",
      "league_line": "Roster move — … Waiver wire called. They laughed."
    }
  ]
}
```

Commit `data/smack-tips.json` when the feed refreshes so the corpus rides
`main` with the stories it belongs to.

### 3c. How tips get used

| Path | Behavior today |
| --- | --- |
| **Templates** | You (or an agent pass) read the corpus and promote keepers into `TEMPLATES` / themed `tweet_*` banks in `news-voice.mjs`. |
| **LLM** | If `NEWS_LLM_KEY` is set, `news-llm.mjs` loads recent tips from `data/smack-tips.json` into the prompt (same idea as `NEWS_LLM_VOICE`). |
| **This doc** | Paste favorite lines into §5 below so the brief stays human-readable. |

Learning is **corpus + promotion**, not silent weight updates. That keeps the
feed diffable and the register reviewable.

---

## 4. Files to touch when improving the voice

| File | Role |
| --- | --- |
| `news-voice.mjs` | `TEMPLATES`, `SEAT_FLAVOR`, `tweetPokeKind`, `summariseTweet`, `leagueLine` |
| `data/smack-tips.json` | Your coaching log from the Shortcut |
| `docs/SMACK_AGENT.md` | This brief — examples, seat flavor, do/don’t, heat level |
| `news-llm.mjs` | Prompt + tip injection when the model is on |
| `docs/SUPABASE_SETUP.md` §3b | Shortcut JSON including optional `agent_tip` |

Revoice the live feed after bank edits:

```bash
node -e "/* or the revoice script used in PR #37 */"
# then bump DATA_V in generate-page.mjs and node generate-page.mjs
```

---

## 5. Scratch pad — lines that sound like us

*Paste winners here as you coach. Promote into `TEMPLATES` when they stick.*

### Injury
- “Not starting on IR” / “not going on IR” / “avoided IR” = **good** — healthy
  enough to be active, maybe Week 1. Label **Good injury news**. **No poke.**
  (Keaton Mitchell, 2026-08-31 — do not repeat the “Ouch” miss.)
- Real IR / PUP / “will miss” / “placed on IR” = needle the seat.

### Cut / waive / release
- 

### Retire / disappear
- 

### Off the field / suspension
- Court / charges / arrest on **TedCumberbatch**’s roster → lean on the lawyer
  bit (see §5a). Winner: *“He may need a lawyer — are you offering your
  services?”* (Josh Jacobs court appearance, 2026-08-31).

### Soft (still friends)
- 

### Do not use
- Needling a seat because the tweet merely *mentioned* IR while saying the
  player is **not** going there.

### Heat level for this league
- Default: needle the roster, not the person.
- Group chat short spice is fine on cuts / real IR / PUP.
- Skip poke on “made the roster” / “kept on the 53” / good injury news.
- “Not starting on IR” / “not going on IR” is **good** news (healthy enough to be
  active, maybe start immediately) — **Good injury news**, fact only. Never jab.
- Seat flavor (profession jokes the seat would laugh at) is fine; still never
  appearance / family / money.

---

## 5a. Seat flavor (who these people are)

Known traits we reference when trash-talking **that seat’s** team. Still no
manager name in the poke — the header already has it. Code: `SEAT_FLAVOR` in
`news-voice.mjs`.

| Seat | Flavor | When to lean on it |
| --- | --- | --- |
| **TedCumberbatch** | **Lawyer** | Off-field / court / charges / arrest on his players. Also fair game on other jabs at his roster when a legal gag fits — he passed the bar; milk it. |

**Worked example (2026-08-31).** Schefter: Josh Jacobs’ initial court appearance
scheduled for Nov. Seat: TedCumberbatch. Fact + poke:

> Off the field — Josh Jacobs’ initial court appearance is scheduled for Nov.
> He may need a lawyer — are you offering your services?

Do **not** use a generic “How’s the stomach” poke here when the seat is Ted —
the lawyer line is the point.

---

## 6. Checklist for a new tip from your phone

1. Share tweet → **Send to Cuckle (with tip)** (or add Ask to the one-tap copy).
2. Dictate / type the tip (“no poke”, “use Ace Bandage line”, “aim at Ted”,
   “Ted’s a lawyer — services line”).
3. Wait for `news-refresh` (or cron) so `news-sync` appends `data/smack-tips.json`.
4. Optionally open this doc and copy the tip into §5 / §5a.
5. When a tip repeatedly lands, add it to the right `tweet_*` bank (or
   `SEAT_FLAVOR`) in `news-voice.mjs` and revoice.

---

## 7. Open improvements

- [x] Per-seat voice flavor started — TedCumberbatch = lawyer (`SEAT_FLAVOR`)
- [ ] More seat flavors (Bubba, …) as the corpus splits cleanly
- [ ] Tip that says `poke: none` forces fact-only even on a cut (override)
- [ ] Tip that supplies an exact poke string for that one row
- [ ] UI for browsing `smack-tips.json` on an admin seat only
