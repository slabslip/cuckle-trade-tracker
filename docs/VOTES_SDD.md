# CuckleChunckle — Trade votes SDD

Who actually won a trade, as an **opinion**. Shipped 2026-08-29 on the Recent Trade card.

**Hard rule: a vote is not a value.** Votes never enter the needle, the even book, Value
Adjustment, the lens windows, `today_delta`, partner grades, `aged`, or any board ranking. One
identity per number. Votes live in their own file, behind their own two functions, in their own UI
block. Nothing in the value spine may read them, now or later.

---

## 1. What ships today (Phase 1)

The gold **Recent Trade** card on league home expands to the full trade. Under the expanded trade,
and only there, sits the vote block:

```
Who actually won it?
[ SF69erss        1 vote · 100% ]   [ KingHenryXXVI   tap to vote ]
Your vote, on this device only — the league tally lights up once the vote store is
connected. Opinion only: votes never enter the value book.
```

- One vote per trade per person. Tapping the other side moves the vote; tapping the same side
  clears it.
- Choices are the **two seat `user_id`s** of the trade, not display names, so a rename on Sleeper
  does not orphan a vote.
- Voting is **not** gated on picking a seat with the Team button. If a seat *is* selected, its
  `user_id` is recorded as the voter identity so a future store can show the tally per manager.
- **N-way trades carry no vote.** "Which side won" has no two-sided answer across three bags, and
  N-way is already the case that carries no Value Adjustment. The block renders a caption instead
  of buttons. In practice `trade_boards.sides` only contains complete 2-team trades
  (`apply-value-adjust.mjs` skips `others.length !== 1`), so the guard is belt-and-braces: it
  checks both the seat count on the board row and `others.length` on the cached trade.
- The block is a **sibling** of the open row, never a child. The expanded trade is a `<button>`
  and any click inside it that misses a handler collapses the row (audit A1), so the vote handler
  runs before the row handlers and the markup sits outside the button.

### Storage adapter

Two doors. Everything the UI touches goes through them, so a remote store is a rewrite of two
function bodies and nothing else.

```js
readVotes(transactionId) -> {
  choice,   // seat user_id this device voted for, or null
  seat,     // voter identity recorded at vote time, or null
  tally,    // { [seat user_id]: count }  — committed totals plus this device's vote
  votes,    // sum of tally
  league,   // true when data/ui/votes.json has an entry for this trade
  asOf,     // votes.json generated_at, or null
}

writeVote(transactionId, choice) -> void   // choice === null clears the vote
```

`localStorage` payload, versioned so a migration is possible:

```json
{
  "v": 1,
  "device": "3f2b…",
  "votes": { "1399241722193522688": { "choice": "457779824002330624", "seat": "457779824002330624", "ts": "2026-08-29T23:00:00.000Z" } }
}
```

Keys: `cuckle.votes.v1`, `cuckle.device.v1`. The device id is a `crypto.randomUUID()` with a
timestamp fallback. `localStorage` throws in private mode and on a full quota, so every read and
write is wrapped and falls back to an in-memory box — voting still works for the session rather
than breaking the render.

### Honest copy

With local-only storage the tally a user sees is **their own device's vote**. The UI says so and
does not render a fake league-wide count. It only claims a league tally when
`data/ui/votes.json` actually carries an entry for that trade.

---

## 2. The reader that is already in place (Phase 2, front-end done)

At boot the page fetches `data/ui/votes.json`, tolerating a 404 and a malformed or wrong-version
file (either leaves `voteBook = null` and the local-only copy stands). A committed file is merged
with the local vote for display. **No further front-end work is needed** when a backend starts
writing that file.

### `data/ui/votes.json` schema (v1)

```json
{
  "v": 1,
  "generated_at": "2026-08-30T06:00:00Z",
  "source": "none",
  "votes": {
    "<transaction_id>": {
      "totals": { "<seat user_id>": 3, "<other seat user_id>": 1 },
      "voters": { "<voter user_id>": "<seat user_id they picked>" }
    }
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `v` | yes | Schema version. The reader ignores anything that is not `1`. |
| `generated_at` | yes (nullable) | ISO timestamp of the pull. Rendered as the tally's as-of. |
| `source` | yes | Where the totals came from: `none`, `worker-kv`, `supabase`. Provenance only. |
| `votes` | yes | Keyed by Sleeper `transaction_id`. Absent trade = no league tally. |
| `votes[].totals` | yes | Seat `user_id` → count. Keys must be seat ids, never display names. |
| `votes[].voters` | no | Voter `user_id` → the seat id they picked. Used for two things: showing the tally per manager later, and dedupe (below). |

**Dedupe rule.** A device's local vote is added to `totals` **unless** `voters` already contains
that device's recorded voter `user_id` — in which case the committed totals already include it.
Without a `voters` map the local vote is always added, which can double-count by one for a voter
whose vote has already been pulled. Ship `voters` and the count is exact.

The file committed today is the empty, valid case: `v: 1`, `source: "none"`, `votes: {}`. Every
trade therefore falls back to the local-only copy.

---

## 3. Real cross-user capture — options and recommendation

The site is static on GitHub Pages: no server, no database. Capturing ten managers' votes needs
exactly one writable endpoint somewhere. Three shapes, cheapest first.

### Option A — Cloudflare Worker + KV (recommended)

A ~30-line Worker on the free plan with a KV namespace bound to it.

- `POST /vote` with `{ transaction_id, seat, voter, device }` → `KV.put("v:<tx>:<voter|device>", seat)`.
- `GET /tally` → reduce the keys to the `votes.json` shape above.
- Called from the page with plain `fetch`. **No npm client-side**, no SDK, no bundler.
- Free tier: 100k requests/day, 1k KV writes/day. A ten-person league will use single digits.
- CORS: allow the Pages origin only.

**Credentials the user must create:** a Cloudflare account, one Worker, one KV namespace, and an
API token (Workers KV read) stored as a GitHub Actions secret for the pull job. The Worker URL
itself is public and lives in the page — that is fine, it is write-one-key-per-voter.

### Option B — Supabase table, insert-only RLS, public anon key

- One table `votes (transaction_id, seat, voter, device, ts)`, unique on `(transaction_id, coalesce(voter, device))`.
- RLS: an `INSERT` policy for `anon`, no `SELECT` policy. The anon key ships in the page and can
  only append.
- Read totals from the service role in the scheduled job, never from the browser.
- Uses the REST endpoint over `fetch`, so again no client-side dependency.

More moving parts than A (a Postgres project to keep alive, a second key to rotate) for the same
result. Prefer A unless the league already runs on Supabase.

### Option C — the vote lives in git

A GitHub Action with `workflow_dispatch` and a form, or an issue-comment convention, and the job
commits the tally. Zero new services and zero new credentials, but every vote is a public commit
and it needs a GitHub account per manager. Fine as a fallback, poor as a product.

### The pull job (all options)

A scheduled GitHub Action, or a step appended to the existing rebuild, that fetches `/tally`,
writes `data/ui/votes.json`, and commits it. The site stays fully static and the UI lights up on
the next deploy without a front-end change. Bump `DATA_V` in the same commit or the 600 s CDN
cache serves the old file.

### Abuse surface

Low, and worth stating plainly. The endpoint is public and unauthenticated, so anyone who reads
the page source can post votes. For a ten-person private league that means:

- **Ballot stuffing** by clearing `localStorage` or rotating the device id. Mitigation: key KV on
  the voter `user_id` when a seat is selected and on the device id otherwise, and cap keys per
  `transaction_id`. It stays possible; it just is not interesting when everyone knows each other.
- **Impersonation:** seat selection is an unverified claim — anyone can pick any seat. Do not
  present the per-manager tally as attested. If that matters, gate on Sleeper OAuth, which is a
  much larger change than this feature deserves.
- **Spam / cost:** rate-limit per IP at the Worker; the free tier absorbs a ten-person league many
  times over.
- **No PII.** A vote is a transaction id, a seat id and a timestamp. Nothing to leak.

**Recommendation:** Option A. One Worker, one KV namespace, one scheduled pull into
`data/ui/votes.json` — the front end is already written against that file, so connecting it is a
backend-only change, and the site stays static.

---

## 4. What is deliberately not built

- No league tally is live. Until a store is connected, every user sees their own device's votes.
- No per-manager breakdown on screen yet, though the voter identity is recorded for it.
- No vote on N-way trades (§1).
- No vote on the Trades tab rows — only the Recent Trade card. Trades-tab rows are `<button>`s
  with the detail nested inside (audit A1); adding a control there means fixing that first.
