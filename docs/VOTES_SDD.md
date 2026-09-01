# CuckleChunckle — Trade votes SDD

Who actually won a trade, as an **opinion**. Shipped 2026-08-29 on the Recent Trade card.
Connected to a real cross-user store 2026-08-30.

**The store is Supabase.** §3 below recommended a Cloudflare Worker with KV; that
recommendation is **superseded** and kept only as the record of why. Setup, keys and the
verification walkthrough live in [`docs/SUPABASE_SETUP.md`](SUPABASE_SETUP.md); the schema is
[`db/schema.sql`](../db/schema.sql); the adapter is §5.

**Hard rule: a vote is not a value.** Votes never enter the needle, the even book, Value
Adjustment, the lens windows, `today_delta`, partner grades, `aged`, or any board ranking. One
identity per number. Votes live in their own table, their own file, behind their own two
functions, in their own UI block. Nothing in the value spine may read them, now or later.

---

## 1. What ships today (Wave 2 vote identity)

The gold **Recent Trade** card on league home expands to the full trade. Under the expanded trade,
and only there, sits the vote block:

```
Who actually won it?
[ SF69erss        1 vote · 100% ]   [ KingHenryXXVI   tap to vote ]
League tally as of 00:21; votes join it as they land. Opinion only: votes never
enter the value book.
```

The caption above is the connected case. All five variants, and the rule that decides between
them, are in **Honest copy** below.

- One vote per trade per person **per league**, enforced by unique
  `(sleeper_league_id, transaction_id, voter)` (`db/wave2b-vote-unique.sql`). Tapping the other
  side moves the vote; tapping the same side clears it.
- Choices are the **two seat `user_id`s** of the trade, not display names, so a rename on Sleeper
  does not orphan a vote.
- Voting is **gated on league membership**. Sign in + redeem a CF invite (or commissioner claim
  seat). `voter` is forced from `league_memberships` for the ballot’s `sleeper_league_id`
  (`db/wave2-vote-identity.sql`). Bottom-nav **Teams** is for browsing meters — it does not write
  ballots. Phase 1 `seat_profiles` / CUCK seed codes are retired (`seed-seat-auth.mjs` exits unless
  `--force-legacy`).
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
  tally,    // { [seat user_id]: count }
  votes,    // sum of tally
  league,   // true when the tally is a real league count rather than this device alone
  asOf,     // when that league count was read, or null
  source,   // "live" | "book" | "local" — where tally came from
  pending,  // true while this device's vote has not been confirmed by the store
}

writeVote(transactionId, choice) -> void   // choice === null clears the vote
```

`source` and `pending` were added when Supabase was connected; they exist so the caption can
state which of three things the reader is looking at rather than implying the best case.

`localStorage` payload, versioned so a migration is possible:

```json
{
  "v": 1,
  "device": "3f2b…",
  "votes": { "1399241722193522688": { "choice": "457779824002330624", "seat": "457779824002330624", "ts": "2026-08-29T23:00:00.000Z" } }
}
```

Keys: `cuckle.votes.v1`, `cuckle.device.v1`, `cuckle.seat.v1`. The device id is a `crypto.randomUUID()` with a
timestamp fallback. `localStorage` throws in private mode and on a full quota, so every read and
write is wrapped and falls back to an in-memory box — voting still works for the session rather
than breaking the render.

### Honest copy

The block never claims a league tally it did not receive. Three captions, one per `source`:

| `source` | Caption |
| --- | --- |
| `live` | League tally as of *HH:MM*; votes join it as they land. |
| `live`, `pending` | League tally as of *HH:MM*; your vote is saved here and still on its way to it. |
| `book` | League tally as of *generated_at*; your vote joins it on the next rebuild. |
| `local`, read failed | Your vote, on this device only — the league tally is out of reach right now. |
| `local`, not read yet | Your vote, on this device only — the league tally lights up once the vote store answers. |

`asOf` on a live tally is the clock time of the read, and it is **not** advanced when your own
vote lands. Your vote landing says nothing about anybody else's, and moving the timestamp would
claim the other counts had been rechecked.

---

## 2. The committed-file reader (Phase 2)

At boot the page fetches `data/ui/votes.json`, tolerating a 404 and a malformed or wrong-version
file (either leaves `voteBook = null` and the local-only copy stands). A committed file is merged
with the local vote for display. **No further front-end work is needed** if a backend ever starts
writing that file.

Since 2026-08-30 this is the **middle** tier of three: the live Supabase tally outranks it and
local-only sits below it (§5.3). It is what the card paints when Supabase is unreachable or the
free-tier project is paused, so it is kept rather than deleted — last-known totals beat nothing.

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
trade therefore falls back to the local-only copy. Its role is now **paint-first fallback** for a
paused or unreachable Supabase project rather than the primary source — see §5.

---

## 3. Real cross-user capture — options and recommendation

> **Superseded 2026-08-30.** The user chose **Supabase**, which is Option B below rather than the
> recommended Option A. This section is kept as the record of what was weighed. What actually
> shipped is §5, and the reasons Supabase beat the Worker in practice are not in this section at
> all: the project already existed, the schema was already applied and verified, and PostgREST
> gave a working upsert and a tally view for zero lines of server code. Note also that Option B as
> written below is not what shipped — it proposed no `SELECT` policy for `anon` and a scheduled
> service-role pull, whereas the shipped design reads the tally **directly from the browser**.

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
backend-only change, and the site stays static. *(Not taken — see the note at the top of §3 and
what shipped in §5.)*

---

## 4. What is deliberately not built

- No per-manager breakdown on screen yet, though the voter identity is recorded for it. It would
  be a list of unverified claims (§5.5), so it needs copy that says so before it earns a screen.
- No vote on N-way trades (§1).
- No vote on the Trades tab rows — only the Recent Trade card. Trades-tab rows are `<button>`s
  with the detail nested inside (audit A1); adding a control there means fixing that first.
- No scheduled pull into `data/ui/votes.json`. The page reads the live tally directly, so the
  committed file has no writer and stays the empty valid case. §5.3 explains why it is kept.
- No rate limiting. Supabase's platform limits are the only cap (§5.5).

---

## 5. What shipped: the Supabase adapter

Plain `fetch` against PostgREST. No npm, no SDK, no bundler — same constraint as the rest of the
repo. Everything lives inside the two doors of §1; no render code changed.

The project URL and the **`anon`** key are committed in `generate-page.mjs`. That is what those
values are for: the site is static on GitHub Pages, so there is nowhere to hide a secret, and the
Row Level Security in `db/schema.sql` is the boundary rather than the key. The key on this project
is a **legacy anon JWT**, so `Authorization: Bearer <key>` is valid alongside the always-required
`apikey` header. A newer `sb_publishable_...` key is **not** a JWT and is rejected on the Bearer
header with `Invalid JWT` — if the key is ever replaced with one of those, send `apikey` alone.
A `service_role` / `sb_secret_` key must never appear anywhere in this repo: it bypasses RLS.

### 5.1 Reads — two requests per page load, none per card

```
GET /rest/v1/trade_vote_tallies?select=*
GET /rest/v1/trade_votes?select=transaction_id,choice&voter=in.(<our ids>)
```

The first returns `{ transaction_id, choice, votes }` for **every** trade at once and is cached in
memory for the session. The table is tiny and the view is an aggregate, so this stays cheap as
votes accumulate. Nothing fires a request per rendered card.

The second is not tidiness, it is required. The view has aggregated the ballots away, so there is
no way to tell from it whether the total for a trade already counts **us**. Without it the only
options are double-counting our own vote or hiding it, and both are wrong. It is bounded by our
own vote count, and `voter=in.(...)` lists every id this device might have voted under — the
device uuid, the seat picked now, and the seat recorded with each stored vote — because `voter` is
decided at vote time and picking a seat later must not orphan an earlier vote.

Both reads carry an 8 s abort. A paused free-tier project can hang rather than refuse, and they
are fired **after** first paint, so Supabase is never between the reader and the dashboard.

### 5.2 Writes — upsert, optimistically

```
POST /rest/v1/trade_votes?on_conflict=sleeper_league_id,transaction_id,voter
Prefer: resolution=merge-duplicates,return=representation
{ "transaction_id": "...", "choice": "...", "voter": "...", "sleeper_league_id": "..." }
```

`?on_conflict=sleeper_league_id,transaction_id,voter` is **not optional**. PostgREST infers the
conflict target from the primary key unless told otherwise, and the primary key is the surrogate
`id` — leave it off and a second vote fails on the unique constraint instead of updating the row.
Requires `db/wave2b-vote-unique.sql`.

The vote is written to `localStorage` and on screen **before** the request leaves. The response
then reconciles: the echoed row's `choice` is folded into the cached tally, moving only our own
contribution. On failure the vote stays where it is, the trade is marked `pending`, and the
caption says so — nothing is lost and nothing wedges. The next page load retries it.

That retry is **one-directional by design**: a trade with a local vote the server disagrees with
gets the local vote pushed again, but a trade with *no* local vote is never cleared on the server.
The same person on a phone and a laptop resolves to the same `voter` once they pick a seat, so
inferring a clear from local absence would have the second device silently delete the first
device's vote. A clear is only ever sent when somebody actually taps to clear.

### 5.3 Precedence

**live Supabase tally > committed `data/ui/votes.json` > local-only.**

Where the live tally is available it is the whole league count, and our own ballot row is what
tells us whether we are already in it. Where it is not — offline, blocked, paused project, an
error — the reader falls back to the committed book, and failing that to this device alone. The
committed file is kept as the paint-first/offline fallback exactly as `SUPABASE_SETUP.md` §6
recommends: last-known totals beat nothing. It currently has no writer, so it is the empty valid
case and the live tally always wins.

`localStorage` is the source of truth for **"my vote"**. Supabase is the source of truth for
**"the league tally"**. Neither overrides the other; where they disagree, the difference is
precisely what is still in flight, and that is what the optimistic adjustment renders.

### 5.4 The sentinel-clear rule

`writeVote(tx, null)` clears a vote, but **anon has no `DELETE`** — verified against the live
project, it returns `401`. That is deliberate and must stay: a delete verb reachable from the page
would let any league member erase everybody else's votes.

So clearing is an **UPDATE to the reserved `choice` value `__none__`**, and the tally view filters
it:

```sql
create or replace view public.trade_vote_tallies with (security_invoker = true) as
  select transaction_id, choice, count(*)::int as votes
  from public.trade_votes
  where choice <> '__none__'
  group by transaction_id, choice;
```

Without that predicate the sentinel is counted as a vote for a side called `__none__`. Reproduced
live — two votes for one side, one of them cleared — the view returned
`[{choice:"__none__",votes:1},{choice:"SEATX",votes:1}]`, so a trade with one real vote would have
rendered 50% / 50%. The fix is the schema's, not the client's.

The reader **also** drops `__none__`, and any seat whose count reaches zero, before summing the
denominator. That is belt-and-braces, not the fix: it keeps the percentages right on a project
whose view has not been re-run since, and it costs one condition.

`__none__` cannot collide with a real answer because `choice` only ever holds a Sleeper `user_id`,
which is a decimal snowflake string. It is stored rather than nulled because `choice` is
`not null`, and because one row per `(trade, voter)` for the whole life of an opinion — including
the fact that it was withdrawn — is the more useful record.

### 5.5 Claimed-seat auth (Chuckle Fantasy)

Supabase Auth is on for **vote writes only**. Identity is a Chuckle Fantasy username/
password account plus a **membership** in the active league (invite redeem or
commissioner claim-seat). Phase 1 `CUCK-` codes from `seed-seat-auth.mjs` are **retired**.

| Piece | Role |
| --- | --- |
| Synthetic email | `{username}@users.cuckle.invalid` (never mailed; Confirm email OFF) |
| Password | Account password (not the invite code) |
| Invite | `CF-XXXX-XXXX` → binds `league_memberships` to a Sleeper seat |
| `trade_votes.sleeper_league_id` | Scopes the ballot to one league |
| Trigger `trade_votes_force_voter` | Rewrites `voter` from `league_memberships` for that league |
| RLS | Anon may **SELECT** tallies; authenticated may write only as their membership seat |

The Teams picker is still not Auth. Soft-delete on news is still UI-gated. What closed is
impersonation and device-UUID ballot stuffing on **trade_votes**, and wrong-seat votes when
switching leagues.

Custom domain cutover: localStorage is origin-scoped — managers sign in again on the new
host. Walkthrough: [`docs/CUSTOM_DOMAIN.md`](CUSTOM_DOMAIN.md) and
[`docs/SUPABASE_SETUP.md`](SUPABASE_SETUP.md) §8 / [`docs/APP_SDD.md`](APP_SDD.md).

Optional once before go-live: `truncate public.trade_votes restart identity;` (commented in
`db/phase1-seat-auth.sql`) so Phase 0 unverified rows do not sit in the tally.

Two more, for completeness. **Nothing rate-limits** — Supabase's platform limits are the only cap,
which a ten-person league will never approach. And there is **no PII** in a vote row: a transaction
id, a seat id and two timestamps. Invite codes are secrets — DM them, do not commit them.
