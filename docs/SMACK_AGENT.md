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

---

## 2. House rules (do not loosen casually)

1. Needle the **roster decision**, the **timing**, or the **player** — not
   appearance, family, money, or anything a friend would not laugh at.
2. Never invent a fact the tweet did not state.
3. Informational posts do not need smack. Cuts and hurts do.
4. The sharer’s public `note` is **their** voice. The agent’s poke is **ours**.
   Keep them separate.
5. Variant choice is a **hash of the item id**, not `Math.random()`, so a line
   is stable for a given story.

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
| `news-voice.mjs` | `TEMPLATES`, `tweetPokeKind`, `summariseTweet`, `leagueLine` |
| `data/smack-tips.json` | Your coaching log from the Shortcut |
| `docs/SMACK_AGENT.md` | This brief — examples, do/don’t, heat level |
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
- 
- 

### Cut / waive / release
- 
- 

### Retire / disappear
- 
- 

### Soft (still friends)
- 
- 

### Do not use
- 

### Heat level for this league
- Default: needle the roster, not the person.
- Group chat short spice is fine on cuts/IR.
- Skip poke on “made the roster” / “kept on the 53” / good injury news.
- “Not starting on IR” / “not going on IR” is **good** news (healthy enough to be
  active) — label as Good injury news, fact only. Do not needle that.

---

## 6. Checklist for a new tip from your phone

1. Share tweet → **Send to Cuckle (with tip)** (or add Ask to the one-tap copy).
2. Dictate / type the tip (“no poke”, “use Ace Bandage line”, “aim at Ted”).
3. Wait for `news-refresh` (or cron) so `news-sync` appends `data/smack-tips.json`.
4. Optionally open this doc and copy the tip into §5.
5. When a tip repeatedly lands, add it to the right `tweet_*` bank in
   `news-voice.mjs` and revoice.

---

## 7. Open improvements

- [ ] Per-seat voice flavor (Ted vs Bubba) if the corpus splits cleanly
- [ ] Tip that says `poke: none` forces fact-only even on a cut (override)
- [ ] Tip that supplies an exact poke string for that one row
- [ ] UI for browsing `smack-tips.json` on an admin seat only
