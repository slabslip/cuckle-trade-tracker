# Agent catalog — other cloud agents on this repo

**Snapshot:** 2026-10-21 · ~145 accessible cloud agents · ~349 `cursor/*` remote branches · 24 open PRs  
**Handoff:** [`AGENT_HANDOFF.md`](AGENT_HANDOFF.md) · **Plan:** [`plans/MASTER_PLAN.md`](plans/MASTER_PLAN.md)

This file is an index. Prefer `main` + these docs over replaying every transcript.

---

## 1. Substantive product agents (branched / PR-backed)

| Agent | URL | Branch | PR | Outcome |
| --- | --- | --- | --- | --- |
| Ledger screen pull refresh | [bc-01a0727f](https://cursor.com/agents/bc-01a0727f-42e5-78f3-b2ab-885be0368d2b) | `cursor/league-home-dashboard-8d2b` (+ `high-low-sort-toggle-8d2b`, `ledger-pull-to-refresh-8d2b`) | [#108](https://github.com/slabslip/cuckle-trade-tracker/pull/108) OPEN **CONFLICTING**; #107 merged (PTR) | League IA for **four top tabs** — **do not merge as-is**. Port ideas to five-tab Home. Sort toggle never got a PR. |
| Titles and emblems experience | [bc-01a07905](https://cursor.com/agents/bc-01a07905-f49d-76f8-b24f-fe3fb506cf2b) | `cursor/cosmetics-titles-emblems-fix-cf2b` (+ several follow-on branches) | Often direct-to-`main` | Comic art, matching law, thumbs, plate layout — **live on Pages**. |
| Team emblem title visuals | [bc-01a07498](https://cursor.com/agents/bc-01a07498-dffd-7e84-98dd-6ce43cead739) | `cursor/cosmetics-art-concepts-d739` | Merged to `main` | Art-origin thread; concepts under `docs/design/cosmetics/`. |
| Awards loading performance | [bc-01a07dfa](https://cursor.com/agents/bc-01a07dfa-1e45-7904-be7a-db34ebe40487) | `cursor/cosmetics-awards-load-0487` | Unmerged; **superseded** by thumbs on `main` | WebP thumb strategy — verify branch then delete/close. |
| Teams tab rank visuals | [bc-01a07edc](https://cursor.com/agents/bc-01a07edc-9666-7c04-b4f9-6c6b483353c8) | `cursor/teams-place-badge-53c8` | On `main` (no PR) | Ordinal badges + podium colors + last-place mark. |
| Side value adjustment | [bc-01a0869a](https://cursor.com/agents/bc-01a0869a-07a5-7b4d-b48f-ceb71195708a) | `cursor/calc-va-compare-708a` | On `main` | Compare bar / Favors use VA on **receive** bags; card footers stay raw. |
| Vote system user access | [bc-01a05840](https://cursor.com/agents/bc-01a05840-44fd-776f-8bf2-cfda12e6878c) | `cursor/phase1-seat-auth-878c` | [#43](https://github.com/slabslip/cuckle-trade-tracker/pull/43) DRAFT | Spawned multi-league app path; most later work on `main`. Reconcile #43. |
| Tedcumberbatch lawyer context | [bc-01a0581a](https://cursor.com/agents/bc-01a0581a-121d-79d1-91af-9f607f798ccb) | `cursor/ted-lawyer-smack-8ccb` | [#42](https://github.com/slabslip/cuckle-trade-tracker/pull/42) MERGED | Seat flavor + feed refresh. Done. |

### Off-product / non-repo noise (ignore for Cuckle plan)

Mobile chats that are not product work: Attorney settlement tax strategies, Property owner offer, AI image detection, Shedeur signature T-shirt. Internal explore/browser-test children (many `ERROR` / short IDLE) are one-shot tooling, not product owners.

---

## 2. Open PRs (24) — triage view

**Active (touched ~2026-10-21):**

| PR | Title | Triage |
| --- | --- | --- |
| [#108](https://github.com/slabslip/cuckle-trade-tracker/pull/108) | Rebuild League home as action-inbox dashboard | **Rewrite or close** — conflicts; wrong tab era |
| [#14](https://github.com/slabslip/cuckle-trade-tracker/pull/14) | Supabase schema + vote persistence guide | Audit vs `db/` + `SUPABASE_SETUP.md` |

**Stale but possibly useful:**

| Theme | PRs |
| --- | --- |
| Auth / claim | #43, #153 |
| Votes / launch UI | #49, #46, #55 |
| GM / redraft career | #137, #147, #149, #142, #126 |
| Ledger / wager polish | #100, #90, #81 |
| Home / Data / polish | #116, #120, #61, #62, #44, #47, #48 |
| Other | #15 (X→Discord, leave open), #11 (audit artifact) |

Full list: `gh pr list --state open`.

---

## 3. Branch theme counts (`origin/cursor/*`)

Rough theme frequency among ~349 remote agent branches (prefix heuristic):

| Theme | ~Count | Notes |
| --- | --- | --- |
| news | 20 | Feed chrome, refresh, voice |
| ledger | 17 | Wagers, PTR, go-live |
| wager | 16 | Odds, stake, clocks |
| home / brand-home | ~14 | Home chrome evolution |
| gm | 12 | Redraft / money law |
| drop / calc / cosmetics / data / vote | 7–10 each | Feature spikes |
| seat / teams / league / settings | 4–6 each | App path |

Most are historical; **`main` is canonical.** Do not check out random `cursor/*-af37` branches unless a PR still needs them.

---

## 4. Locked decisions harvested from agents

Carry these forward (also in PRODUCT / SDDs):

1. **Identity:** per-seat invite codes → claimed seats → one vote. No IP binding. No shared league password.
2. **Fake auth emails:** `@users.cuckle.invalid` (not `.example.com`).
3. **Cosmetics matching law:** one unlock gate → title + emblem pair; equip one of each; can mix pairs.
4. **Cosmetics paint:** team home + Teams cards + your emblem on your name; titles on every byline later.
5. **Barracks load:** WebP thumbs in the grid; full PNG only on plate / detail.
6. **No Unicode emoji** as award emblems (custom art only). Exception already shipped: Teams **last-place** 💩 on the place badge is UI chrome, not a catalog emblem.
7. **Calc VA:** compare / Favors = receive bags + VA; listed piece footers stay raw.
8. **Ledger PTR:** soft in-place refresh; never full document reload that kicks to Home/League.
9. **Do not scrape Sleeper chat** for debates / smack.
10. **Five-tab law** overrides older “League leftmost of four top tabs” plans.

---

## 5. How to pull more from an old agent

```text
1. cursor-cloud list-cloud-agents (filter didMakeCodeChanges / didCreatePullRequest)
2. batch-fetch-details with includeTranscripts + includeDiffMetadata
3. Summarize transcripts via a subagent — do not read huge JSON in the parent
4. Diff the branch against origin/main before reviving any PR
```

Transcript batch used for this handoff:
`/tmp/cursor/cloud-agent-transcripts/2026-10-21T00-57-08Z-5f41/`
(ephemeral to that cloud run; re-fetch if needed).

---

## 6. This handoff agent

| Field | Value |
| --- | --- |
| Name | New agent initial setup |
| bcId | `bc-a5c2738e-9298-4f4d-8735-2aa4d18333b5` |
| URL | https://cursor.com/agents/bc-a5c2738e-9298-4f4d-8735-2aa4d18333b5 |
| Deliverable | This catalog + `AGENT_HANDOFF.md` + `plans/MASTER_PLAN.md` |
