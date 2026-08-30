#!/usr/bin/env node
/**
 * Which rostered players is this free text about, and how sure are we?
 *
 *   node news-match.mjs --report          # score against data/fixtures/rss-corpus.json, offline
 *   node news-match.mjs --text "…"        # match one string and print the working
 *
 * ## What this is for, and why it is not matchPlayer()
 *
 * `news-sync.mjs` has a matcher already, and it is the right one for RSS. An RSS item arrives as
 * a title plus a summary, and that split is load-bearing: today's two mis-attributions were both
 * fixed by reading the **title only**, because a summary names teammates, coaches and the
 * reporter. "Jalon Daniels: Wins backup QB job" went to Baker Mayfield's owner purely because
 * the summary named Mayfield.
 *
 * A post on X has no such split. There is one blob of text and it contains whatever it contains,
 * so the title-only defence does not transfer and something has to replace it. This file is that
 * replacement, and it is deliberately a separate matcher rather than an option on the old one:
 * RSS should keep refusing on ambiguity, and nothing here should be able to change what the
 * shipping feed does.
 *
 * ## What replaces "read the title only"
 *
 * Four things, in the order they do work:
 *
 * **1. Only rostered players are indexed.** 337 of ~12,225. This removes most collisions before
 * they can happen and is inherited from the RSS matcher, which is right about it.
 *
 * **2. Collisions are resolved against the whole dictionary, not the roster.** This is the part
 * the RSS matcher cannot do and the part that matters most. Sleeper has 357 colliding normalised
 * names. Indexing rosters only means a post about the *Jaguars linebacker* Josh Allen would be
 * addressed with total confidence to whoever owns the *Bills quarterback*, because the
 * linebacker was never a candidate. So every name hit is re-opened against all 12,225 players,
 * ranked with `nameCandidateScore()` from price-today.mjs — the same ranking that mispriced four
 * players tonight when it was missing — plus a roster bonus and NFL-team context. If the winner
 * is not on a roster here, the item is refused. A same-named stranger now costs a drop rather
 * than a wrong address.
 *
 * **3. Team context.** Prose names teams: "the Texans placed Higgins (knee) on injured reserve".
 * That single word separates Jayden Higgins (HOU) from Tee Higgins (CIN), and it is present in
 * most real transaction wording. A candidate whose team is named gains; a candidate whose team
 * is named-and-contradicted loses.
 *
 * **4. Confidence, with two thresholds.** Everything above produces a number rather than a
 * verdict, because "publish this in a scrolling feed" and "ping a person's phone" are different
 * bets. See PUBLISH_MIN / NOTIFY_MIN.
 *
 * ## Several rostered players in one post: one item per manager
 *
 * The RSS path drops these, and for RSS that is right — a *title* naming two owned players
 * ("Raiders expected to name Kirk Cousins Week 1 starter over No. 1 pick Fernando Mendoza") has
 * one subject and picking it would be a guess.
 *
 * For free text the drop is the wrong trade, for two reasons. First, the most valuable posts
 * name two players by construction: a trade has two sides and genuinely affects two managers, so
 * dropping it loses the news the feature exists for. Second, the claim being made is weaker.
 * A per-manager row says *"this story mentions your player"*, not *"this story is about your
 * player"*, and that claim is true for both managers. The voice supports it: `leagueLine()` is
 * keyed on category and frames the headline printed beside it rather than asserting a subject,
 * so "{who}, {player} has a new address" is accurate for both sides of a trade.
 *
 * It is bounded. Past MAX_SUBJECTS rostered names the text is a league-wide roundup — a cut
 * tracker, an inactives list, a "15 players who will not participate" — and that is not news for
 * anyone in particular, so it is refused outright rather than fanned out to six managers.
 *
 * ## Surnames
 *
 * The RSS matcher never matches a bare surname, and on headlines that is correct. But real
 * reporter wording is full of them — "Kittle (Achilles) is expected to practice", "The Texans
 * placed Higgins (knee) on IR" — and refusing all of them would drop most of the corpus. So a
 * surname is allowed under three conditions at once: unique among the 337 rostered players, no
 * dictionary namesake who currently holds an NFL team (that is the Josh Allen guard again), and
 * **capitalised in the raw text**, so the noun "love" is not Jordan Love. It still lands below
 * NOTIFY_MIN: a surname can print, and it cannot ring a phone.
 */
import fs from "node:fs";
import { readJson } from "./lib.mjs";
import { nameCandidateScore, normName } from "./price-today.mjs";
import { CATEGORIES, classify } from "./news-voice.mjs";

/**
 * Publish into the feed at or above this. Below it the item is dropped entirely.
 *
 * 0.55 is set just under the surname-only floor (0.58), which is the weakest evidence this
 * matcher is willing to print at all. Everything below that line is either a collision it could
 * not resolve or an alias it could not pin to one player, and a scrolling feed of guesses is
 * worse than a shorter feed.
 */
export const PUBLISH_MIN = 0.55;
/**
 * Send a Discord mention at or above this, and only here.
 *
 * 0.80 sits above every form of evidence that involved a judgement call: a collision resolved by
 * ranking alone scores 0.65, an alias 0.70, a surname 0.58. Only a full name that is either
 * unique in the whole dictionary (0.90) or a collision settled by explicit team context (0.85)
 * can ping anybody. A notification is the one output that cannot be quietly corrected once it
 * has landed on ten phones, so it requires evidence that needed no interpretation.
 *
 * Publish-but-do-not-notify is therefore the normal state for weaker matches, not an error.
 */
export const NOTIFY_MIN = 0.80;
/** More rostered names than this and the text is a roundup, not a story about anyone. */
export const MAX_SUBJECTS = 3;

/* -------------------------------------------------------------- aliases ---- */

/**
 * Nicknames the league actually says out loud, alias → the full name it resolves to.
 *
 * Kept small, explicit and hand-written rather than generated. A generated table (initials,
 * first-name-only, every substring) is where a matcher goes wrong quietly: "AJ" would collect
 * six players and "Will" would fire on the auxiliary verb. Every entry here is a form a person
 * would type in a group chat, and an alias that resolves to more than one **rostered** player is
 * ambiguous by construction and refused unless team context settles it.
 *
 * An alias whose target nobody rosters is skipped at index time and counted, so this table can
 * name players who come and go without breaking.
 */
export const ALIASES = [
  { alias: "zeke", full: "Ezekiel Elliott" },
  { alias: "cmc", full: "Christian McCaffrey" },
  { alias: "ajb", full: "A.J. Brown" },
  { alias: "jsn", full: "Jaxon Smith-Njigba" },
  { alias: "dk", full: "DK Metcalf" },
  { alias: "nuk", full: "DeAndre Hopkins" },
  { alias: "cheetah", full: "Tyreek Hill" },
  { alias: "hollywood", full: "Marquise Brown" },
  { alias: "etn", full: "Travis Etienne" },
  { alias: "jamo", full: "Jameson Williams" },
  { alias: "mvs", full: "Marquez Valdes-Scantling" },
  { alias: "saquon", full: "Saquon Barkley" },
  { alias: "bijan", full: "Bijan Robinson" },
  { alias: "puka", full: "Puka Nacua" },
  { alias: "tua", full: "Tua Tagovailoa" },
  { alias: "breece", full: "Breece Hall" },
  { alias: "jahmyr", full: "Jahmyr Gibbs" },
  { alias: "amon ra", full: "Amon-Ra St. Brown" },
  // Deliberately two rows on one alias. "JJ" is J.J. McCarthy to half the league and Justin
  // Jefferson to the other half, so it must be able to come back ambiguous rather than pick.
  { alias: "jj", full: "J.J. McCarthy" },
  { alias: "jj", full: "Justin Jefferson" },
];

/* ---------------------------------------------------------------- teams ---- */

/**
 * The 32 teams by the words prose uses, keyed to Sleeper's abbreviation.
 *
 * Nicknames and city names only. Abbreviations are excluded on purpose: "LAR" never appears in a
 * sentence, and the short ones collide with ordinary text once lower-cased.
 */
export const NFL_TEAMS = [
  { abbr: "ARI", names: ["cardinals", "arizona"] },
  { abbr: "ATL", names: ["falcons", "atlanta"] },
  { abbr: "BAL", names: ["ravens", "baltimore"] },
  { abbr: "BUF", names: ["bills", "buffalo"] },
  { abbr: "CAR", names: ["panthers", "carolina"] },
  { abbr: "CHI", names: ["bears", "chicago"] },
  { abbr: "CIN", names: ["bengals", "cincinnati"] },
  { abbr: "CLE", names: ["browns", "cleveland"] },
  { abbr: "DAL", names: ["cowboys", "dallas"] },
  { abbr: "DEN", names: ["broncos", "denver"] },
  { abbr: "DET", names: ["lions", "detroit"] },
  { abbr: "GB", names: ["packers", "green bay"] },
  { abbr: "HOU", names: ["texans", "houston"] },
  { abbr: "IND", names: ["colts", "indianapolis"] },
  { abbr: "JAX", names: ["jaguars", "jags", "jacksonville"] },
  { abbr: "KC", names: ["chiefs", "kansas city"] },
  { abbr: "LAC", names: ["chargers", "bolts", "los angeles chargers"] },
  { abbr: "LAR", names: ["rams", "los angeles rams"] },
  { abbr: "LV", names: ["raiders", "las vegas"] },
  { abbr: "MIA", names: ["dolphins", "miami"] },
  { abbr: "MIN", names: ["vikings", "minnesota"] },
  { abbr: "NE", names: ["patriots", "pats", "new england"] },
  { abbr: "NO", names: ["saints", "new orleans"] },
  { abbr: "NYG", names: ["giants", "new york giants"] },
  { abbr: "NYJ", names: ["jets", "new york jets"] },
  { abbr: "PHI", names: ["eagles", "philadelphia"] },
  { abbr: "PIT", names: ["steelers", "pittsburgh"] },
  { abbr: "SEA", names: ["seahawks", "seattle"] },
  { abbr: "SF", names: ["49ers", "niners", "san francisco"] },
  { abbr: "TB", names: ["buccaneers", "bucs", "tampa bay"] },
  { abbr: "TEN", names: ["titans", "tennessee"] },
  { abbr: "WAS", names: ["commanders", "washington"] },
];

/**
 * Text that is not news about a football player, however many players it names.
 *
 * Every pattern here is one this repo has actually seen or the user named: the live ESPN feed
 * carries "Adam Schefter's cheat sheet: The players our NFL insider is most excited about this
 * season", which names players, matches nothing meaningful and should never ping anyone, and CBS
 * carries "Predicting first-time NFL All-Pros at every offensive position: Caleb Williams, Jahmyr
 * Gibbs among…", which names two rostered players with complete confidence and reports nothing.
 *
 * This is a **confidence penalty, not a filter**. A listicle naming your player is still mildly
 * interesting and the feed can carry it; the penalty is sized (−0.20) so a full-name match drops
 * from 0.90 to 0.70 — still published, no longer able to ring a phone.
 */
const NON_NEWS = /\b(podcast|episode|listen|subscribe|cheat sheet|mailbag|on today'?s (?:show|pod)|link in bio|watch (?:live|now)|thoughts and prayers|rest in peace|condolences|passed away|our (?:hearts|thoughts) (?:are|go)|happy birthday|congrats to|throwback|on this day|mock draft|big board|draft chatter|way[- ]too[- ]early|power rankings|start\/sit|best ball|waiver targets|dfs|predict\w+|projections?|all[- ]pros?|bold takes?|over\/under)\b/i;

/* ---------------------------------------------------------- normalising ---- */

/**
 * Free text, normalised the same way a player's name is.
 *
 * `normName()` from price-today.mjs is the one normaliser in this repo for player names and it
 * stays that way — this composes on top of it rather than beside it. Order matters, and each of
 * the three steps earned its place against real text:
 *
 * 1. **The possessive comes off first.** normName() deletes apostrophes without leaving a space,
 *    so "Lamar Jackson's WR2" would become "lamar jacksons" and never match "lamar jackson" —
 *    and that headline is in the live corpus. An internal apostrophe must still be deleted, not
 *    spaced ("Ja'Marr Chase" → "jamarr chase"), so only a trailing `'s` is removed.
 * 2. **normName() next**, so "A.J. Brown" collapses to "aj brown". Flattening punctuation first
 *    would give "a j brown" and never match.
 * 3. **Remaining prose punctuation becomes whitespace** — colons, parentheses, hyphens — so
 *    "Jalon Daniels: Wins backup QB job" and "Amon-Ra St. Brown" tokenise like the name keys do.
 */
export function normText(s) {
  return normName(String(s == null ? "" : s).replace(/['’]s(?![A-Za-z])/g, ""))
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function surnameOf(normalised) {
  const parts = String(normalised || "").split(" ").filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function fullNameOf(p) {
  return p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
}

function hasTeam(p) {
  const t = p && p.team;
  return !!(t && t !== "FA" && t !== "None");
}

/* ---------------------------------------------------------------- index ---- */

/**
 * Everything the matcher needs, built once.
 *
 * @param owner   Map player_id -> { user_id, manager, roster_id }, from news-sync.buildOwnership
 * @param players the Sleeper dictionary, all 12,225 of them — not just the rostered ones
 */
export function buildMatchIndex(owner, players) {
  const rostered = new Map();
  for (const pid of owner.keys()) {
    const p = players[String(pid)];
    if (!p) continue;
    const name = fullNameOf(p);
    if (!name) continue;
    rostered.set(String(pid), {
      player_id: String(pid),
      name,
      key: normText(name),
      team: p.team || null,
      position: p.position || (p.fantasy_positions || [])[0] || null,
      raw: p,
    });
  }

  // Every player in the dictionary under their normalised name, so a collision is visible.
  const dictByName = new Map();
  for (const [pid, p] of Object.entries(players)) {
    const key = normText(fullNameOf(p));
    if (!key || key.split(" ").length < 2) continue;
    if (!dictByName.has(key)) dictByName.set(key, []);
    dictByName.get(key).push({ player_id: String(pid), name: fullNameOf(p), team: p.team || null, position: p.position || null, raw: p });
  }

  // Name keys worth searching for: the rostered players' own names. Sleeper's search_full_name
  // is folded in because it already drops punctuation the same way.
  const nameKeys = new Map();
  for (const row of rostered.values()) {
    for (const key of new Set([row.key, normText(row.raw.search_full_name || "")])) {
      if (!key || key.split(" ").length < 2) continue;
      if (!nameKeys.has(key)) nameKeys.set(key, new Set());
      nameKeys.get(key).add(row.player_id);
    }
  }

  const aliasKeys = new Map();
  const aliasesDropped = [];
  for (const { alias, full } of ALIASES) {
    const target = normText(full);
    const hit = [...rostered.values()].find((r) => r.key === target);
    if (!hit) { aliasesDropped.push({ alias, full }); continue; }
    const key = normText(alias);
    if (!aliasKeys.has(key)) aliasKeys.set(key, new Set());
    aliasKeys.get(key).add(hit.player_id);
  }

  // Surname -> rostered players, and surname -> every dictionary player currently holding an NFL
  // team. The second index is the guard, and it is what makes a surname usable at all: "the Jets
  // are releasing defensive tackle Mazi Smith" must not reach a manager who owns a different
  // Smith, and the only way to know that is to look at every Smith in the league.
  const surnameRostered = new Map();
  for (const row of rostered.values()) {
    const s = surnameOf(row.key);
    if (!s || s.length < 3) continue;
    if (!surnameRostered.has(s)) surnameRostered.set(s, new Set());
    surnameRostered.get(s).add(row.player_id);
  }
  const surnameActive = new Map();
  for (const rows of dictByName.values()) {
    for (const p of rows) {
      if (!hasTeam(p.raw)) continue;
      const s = surnameOf(normText(p.name));
      if (!s) continue;
      if (!surnameActive.has(s)) surnameActive.set(s, []);
      surnameActive.get(s).push({ player_id: p.player_id, name: p.name, team: p.team });
    }
  }

  const teamWords = [];
  for (const t of NFL_TEAMS) for (const n of t.names) teamWords.push({ abbr: t.abbr, key: normText(n) });
  teamWords.sort((a, b) => b.key.length - a.key.length);

  return {
    owner,
    rostered,
    dictByName,
    nameKeys,
    aliasKeys,
    aliasesDropped,
    surnameRostered,
    surnameActive,
    teamWords,
    dictionary_size: Object.keys(players).length,
  };
}

/** Which NFL teams this text names. Longest phrase first, so "green bay" beats nothing. */
export function teamsNamed(text, index) {
  const hay = ` ${normText(text)} `;
  const out = new Set();
  for (const { abbr, key } of index.teamWords) {
    if (hay.includes(` ${key} `)) out.add(abbr);
  }
  return out;
}

/**
 * Score one dictionary candidate for a name that appeared in the text.
 *
 * `nameCandidateScore()` supplies the position/team/active part and is imported rather than
 * restated. Two weights are added on top, and their relative size is the whole design:
 *
 * - **rostered +12.** Owning a player of that name is strong evidence, because the feed only
 *   exists for rostered players.
 * - **team named +14, team contradicted −12.** Deliberately heavier than the roster bonus, so
 *   explicit team context *beats* "we happen to own somebody with this name". Sized against a
 *   real collision: Justin Jefferson is a Vikings receiver this league rosters **and** a Browns
 *   linebacker it does not. With the roster bonus larger, "the Browns say Justin Jefferson will
 *   not play" tied at 16–16 and fell through to an id tie-break, which is a coin toss deciding
 *   whose phone rings. Weighted this way the Browns linebacker wins the sentence outright and
 *   the item is refused, which is the only correct answer.
 */
function scoreCandidate(cand, index, teams) {
  const parts = [];
  let score = nameCandidateScore(cand.raw);
  parts.push(`base ${score}`);
  const rostered = index.rostered.has(cand.player_id);
  if (rostered) { score += 12; parts.push("rostered +12"); }
  if (teams.size && cand.team) {
    if (teams.has(cand.team)) { score += 14; parts.push(`team ${cand.team} named +14`); }
    else { score -= 12; parts.push(`team ${cand.team} not among ${[...teams].join("/")} -12`); }
  }
  return { score, rostered, why: parts.join(", ") };
}

/**
 * Resolve one name key that appeared in the text to a single player, or refuse.
 *
 * Returns `{ player_id, collided, resolved_by }`, where `resolved_by` is "unique" when the
 * dictionary holds exactly one player of that name, "team" when context settled a collision, and
 * "rank" when it did not and the ranking had to. Those three feed three different confidences,
 * because they are three different qualities of evidence.
 */
/**
 * The scored candidate list for one name, best first. Exported so a test can assert the *margin*
 * rather than the winner.
 *
 * That distinction is not pedantry. The first version of the weights left the Justin Jefferson
 * collision tied 16–16 under "the Browns say Justin Jefferson will not play", and the id
 * tie-break happened to pick the linebacker — so the adversarial test passed while the design was
 * wrong, and reverting the weights did not fail a single assertion. §3a's "a check that cannot
 * fail is worse than no check", in the form it actually takes: a check that passes for a reason
 * you did not intend. The test now asserts `scored[0].score > scored[1].score`.
 */
export function explainName(key, index, teams) {
  const cands = index.dictByName.get(key) || [];
  return cands
    .map((c) => ({ player_id: c.player_id, name: c.name, team: c.team, position: c.position, ...scoreCandidate(c, index, teams) }))
    .sort((a, b) => b.score - a.score || Number(b.player_id) - Number(a.player_id));
}

function resolveName(key, index, teams) {
  const cands = index.dictByName.get(key) || [];
  if (!cands.length) return null;
  if (cands.length === 1) {
    return index.rostered.has(cands[0].player_id)
      ? { player_id: cands[0].player_id, collided: false, resolved_by: "unique", why: "only player with this name" }
      : null;
  }
  const scored = cands.map((c) => ({ cand: c, ...scoreCandidate(c, index, teams) }));
  scored.sort((a, b) => b.score - a.score || Number(b.cand.player_id) - Number(a.cand.player_id));
  const win = scored[0];
  if (!win.rostered) {
    // A same-named stranger outranks everyone this league owns: refuse. This is the Josh Allen
    // case and the only correct answer is silence.
    return { player_id: null, collided: true, resolved_by: "outranked", why: `${win.cand.name} (${win.cand.team || "FA"}, ${win.cand.position || "?"}) outranks any rostered namesake: ${win.why}` };
  }
  const settledByTeam = teams.size > 0 && !!win.cand.team && teams.has(win.cand.team);
  return {
    player_id: win.cand.player_id,
    collided: true,
    resolved_by: settledByTeam ? "team" : "rank",
    why: `${cands.length} namesakes; ${win.cand.name} wins (${win.why})`,
  };
}

/**
 * Which rostered player, if any, a bare surname refers to.
 *
 * Two paths, and the team-context one is the reason surnames are usable at all — reporter wording
 * names the team far more often than it repeats the first name. "The Texans placed Higgins (knee)
 * on injured reserve" is Jayden Higgins and not Tee Higgins, and nothing but the word "Texans"
 * says so.
 *
 * The path without team context is the strict one: the surname must belong to exactly one rostered
 * player *and* to nobody else currently on an NFL roster. That is the Josh Allen guard again, and
 * it is what stops "the Jets are releasing defensive tackle Mazi Smith" from reaching whoever
 * owns a different Smith.
 */
function resolveSurname(surname, rosteredIds, index, teams) {
  const active = index.surnameActive.get(surname) || [];

  if (teams.size) {
    const onNamedTeam = active.filter((p) => p.team && teams.has(p.team));
    if (onNamedTeam.length === 1) {
      const only = onNamedTeam[0];
      if (!index.rostered.has(only.player_id)) {
        return { player_id: null, why: `the only ${surname} on a named team is ${only.name} (${only.team}), who nobody rosters` };
      }
      return {
        player_id: only.player_id,
        evidence: "surname_team",
        confidence: 0.72,
        why: `surname "${surname}" plus team ${only.team} identifies ${only.name} among ${active.length} on NFL rosters`,
      };
    }
    if (onNamedTeam.length > 1) {
      return { player_id: null, why: `${onNamedTeam.length} players named ${surname} play for a team this text names` };
    }
  }

  if (rosteredIds.size !== 1) {
    return { player_id: null, why: `${rosteredIds.size} rostered players share it and no team context settles it` };
  }
  if (active.length > 1) {
    return { player_id: null, why: `${active.length} players with an NFL team answer to it` };
  }
  const id = [...rosteredIds][0];
  return {
    player_id: id,
    evidence: "surname",
    confidence: 0.58,
    why: `surname "${surname}" is unique among the ${index.surnameRostered.size} rostered surnames and among NFL rosters`,
  };
}

/**
 * Is this text title-cased, so that capitalisation says nothing about proper nouns?
 *
 * Without this the capitalisation guard would be **vacuous on exactly the inputs it exists for**:
 * in "Eagles News: Philadelphia's Most Likely First-Time Pro Bowl Candidate" every word is
 * capitalised, so "Likely" would read as Isaiah Likely. Rather than have a check that cannot
 * fail, surname matching is switched off entirely on title-cased text. Live wire copy and X posts
 * are sentence case, so this costs almost nothing.
 */
export function looksTitleCased(raw) {
  const words = String(raw == null ? "" : raw).match(/\b[A-Za-z][A-Za-z'’-]{3,}\b/g) || [];
  if (words.length < 5) return false;
  const upper = words.filter((w) => /^[A-Z]/.test(w)).length;
  return upper / words.length >= 0.7;
}

/* --------------------------------------------------------------- matcher ---- */

/**
 * Every rostered player this text is about, one entry per player, each with its own confidence.
 *
 * Emits nothing rather than guessing. `reason` explains an empty result and is what the report
 * counts, so a change in behaviour reads as a change in a named category rather than as a total.
 *
 * @param text  the whole post. For a tweet there is no title/summary split, so this is all of it.
 * @param index buildMatchIndex() output
 * @returns {{ subjects: Array, reason: string, teams: string[], non_news: boolean, category: string, upbeat: boolean }}
 */
export function matchText(text, index) {
  const raw = String(text == null ? "" : text);
  const hay = ` ${normText(raw)} `;
  const teams = teamsNamed(raw, index);
  const nonNews = NON_NEWS.test(raw);
  const kind = classify(raw);
  const base = { teams: [...teams], non_news: nonNews, category: kind.category, upbeat: kind.upbeat };

  /** player_id -> the strongest evidence found for that player. */
  const found = new Map();
  const notes = [];

  const take = (playerId, evidence, confidence, why) => {
    const prev = found.get(playerId);
    if (prev && prev.confidence >= confidence) return;
    found.set(playerId, { player_id: playerId, evidence, confidence, why });
  };

  // 1. Full names.
  for (const [key, ids] of index.nameKeys) {
    if (!hay.includes(` ${key} `)) continue;
    const res = resolveName(key, index, teams);
    if (!res) {
      // The key is a rostered player's name but the dictionary has no such entry under it,
      // which only happens for a search_full_name variant. Fall back to the roster entry.
      for (const id of ids) take(id, "name_variant", 0.85, `matched "${key}" as a name variant`);
      continue;
    }
    if (!res.player_id) { notes.push(`refused "${key}": ${res.why}`); continue; }
    if (!index.rostered.has(res.player_id)) continue;
    const conf = res.resolved_by === "unique" ? 0.90 : res.resolved_by === "team" ? 0.85 : 0.65;
    take(res.player_id, res.resolved_by === "unique" ? "name" : `name_collision_${res.resolved_by}`, conf, res.why);
  }

  // 2. Aliases.
  for (const [key, ids] of index.aliasKeys) {
    if (!hay.includes(` ${key} `)) continue;
    if (ids.size > 1) {
      // Resolve a shared alias with team context, or leave it alone.
      const settled = [...ids].filter((id) => {
        const row = index.rostered.get(id);
        return row && row.team && teams.has(row.team);
      });
      if (settled.length === 1) {
        take(settled[0], "alias_collision_team", 0.75, `alias "${key}" shared by ${ids.size} rostered players, settled by team context`);
      } else {
        notes.push(`refused alias "${key}": shared by ${ids.size} rostered players, no team context`);
      }
      continue;
    }
    const id = [...ids][0];
    const row = index.rostered.get(id);
    const bump = row && row.team && teams.has(row.team) ? 0.05 : 0;
    take(id, "alias", 0.70 + bump, `alias "${key}" -> ${row ? row.name : id}`);
  }

  // 3. Surnames — but only when no full name was found. A surname sitting beside a full name is
  // the weakest evidence in a text that already has strong evidence, and it is usually context
  // rather than subject: "Miller (back) and Devin Neal (hamstring) returned to practice, while
  // teammate Alvin Kamara (knee) is expected to be out" is the same shape as the summary that
  // sent a Jalon Daniels story to Baker Mayfield's owner. The cost is that one phrasing of a
  // story can reach fewer managers than another; the notifier's dedupe absorbs that.
  if (!found.size) {
    const titleCased = looksTitleCased(raw);
    for (const [surname, ids] of index.surnameRostered) {
      if (!hay.includes(` ${surname} `)) continue;
      if (titleCased) {
        notes.push(`refused surname "${surname}": the text is title-cased, so capitalisation carries no signal`);
        continue;
      }
      if (!capitalisedIn(raw, surname)) {
        notes.push(`refused surname "${surname}": not capitalised in the text`);
        continue;
      }
      const resolved = resolveSurname(surname, ids, index, teams);
      if (!resolved.player_id) { notes.push(`refused surname "${surname}": ${resolved.why}`); continue; }
      take(resolved.player_id, resolved.evidence, resolved.confidence, resolved.why);
    }
  }

  if (!found.size) {
    return { ...base, subjects: [], reason: notes.length ? "refused" : "no_player", notes };
  }
  if (found.size > MAX_SUBJECTS) {
    return {
      ...base,
      subjects: [],
      reason: "roundup",
      notes: [...notes, `${found.size} rostered players named — a roundup, not a story about anyone`],
    };
  }

  const subjects = [];
  for (const hit of found.values()) {
    const row = index.rostered.get(hit.player_id);
    const own = index.owner.get(hit.player_id);
    if (!row || !own) continue;
    let confidence = hit.confidence;
    const adjust = [];
    if (nonNews) { confidence -= 0.20; adjust.push("non-news wording -0.20"); }
    if (row.team && teams.has(row.team) && hit.evidence === "name") { confidence += 0.05; adjust.push("own team named +0.05"); }
    confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(3))));
    subjects.push({
      player_id: row.player_id,
      player: row.name,
      player_team: row.team,
      player_position: row.position,
      user_id: own.user_id,
      manager: own.manager,
      evidence: hit.evidence,
      confidence,
      publish: confidence >= PUBLISH_MIN,
      notify: confidence >= NOTIFY_MIN,
      why: [hit.why, ...adjust].join("; "),
    });
  }
  subjects.sort((a, b) => b.confidence - a.confidence || a.player.localeCompare(b.player));
  const publishable = subjects.filter((s) => s.publish);
  return {
    ...base,
    subjects,
    reason: publishable.length ? (publishable.length > 1 ? "matched_multi" : "matched") : "below_publish",
    notes,
  };
}

/**
 * Does this surname appear capitalised in the raw text?
 *
 * The surname rule needs a signal that "Love", "Likely" and "Hill" are names rather than words,
 * and capitalisation is the one that prose actually carries. It earns its place on live text: the
 * corpus contains "Eagles News: Philadelphia's most likely first-time Pro Bowl candidate", where
 * lower-case "likely" is the only thing standing between Isaiah Likely's owner and a wrong row.
 *
 * Sentence-initial capitals **do** count, which was not the first design. Excluding them looked
 * more rigorous and was strictly worse: reporter wording leads with the surname constantly —
 * "Kittle (Achilles) is expected to practice", "Tillman (undisclosed) is in line to be cut" —
 * so the strict version threw away three of the twenty-four harvested Schefter fixtures to buy a
 * guard against a sentence opening on the word "Love". The residual risk is real and it is
 * bounded on purpose: surname evidence tops out at 0.72, below NOTIFY_MIN, so the worst case is
 * one generic feed row rather than a false ping. `looksTitleCased()` covers the case where
 * capitalisation means nothing at all.
 */
export function capitalisedIn(raw, surnameNormalised) {
  const target = String(surnameNormalised || "");
  if (!target) return false;
  for (const word of String(raw == null ? "" : raw).match(/[A-Za-z][A-Za-z'’.-]*/g) || []) {
    if (normText(word) === target && /^[A-Z]/.test(word)) return true;
  }
  return false;
}

/* ---------------------------------------------------------------- report ---- */

/**
 * Score this matcher against the committed corpus, whose answer set was written by the RSS
 * matcher that ships. Offline and deterministic: the corpus is a frozen file, so a number that
 * moves here is a code change rather than a news cycle.
 */
export function scoreCorpus(index, corpus, { baselineMatch = null } = {}) {
  const tally = { total: 0, baseline: {}, mine: {}, agree: 0, disagree: [], gained: [], lost: [] };
  for (const item of corpus.items) {
    tally.total++;
    const bVerdict = baselineMatch ? baselineMatch(item) : item.baseline;
    tally.baseline[bVerdict.verdict] = (tally.baseline[bVerdict.verdict] || 0) + 1;
    // The RSS answer set was produced from titles, so the comparison must read titles too.
    const mine = matchText(item.title, index);
    tally.mine[mine.reason] = (tally.mine[mine.reason] || 0) + 1;
    const minePlayers = mine.subjects.filter((s) => s.publish).map((s) => s.player_id);
    const bPlayer = bVerdict.player_id;
    if (bPlayer && minePlayers.includes(bPlayer)) tally.agree++;
    else if (bPlayer && !minePlayers.length) tally.lost.push({ title: item.title.slice(0, 100), baseline: bVerdict.player, mine: mine.reason, notes: mine.notes });
    else if (bPlayer) tally.disagree.push({ title: item.title.slice(0, 100), baseline: bVerdict.player, mine: mine.subjects.map((s) => `${s.player} ${s.confidence}`) });
    else if (minePlayers.length) tally.gained.push({ title: item.title.slice(0, 100), baseline: bVerdict.verdict, mine: mine.subjects.filter((s) => s.publish).map((s) => `${s.player} ${s.confidence} ${s.evidence}`) });
  }
  return tally;
}

/** Load rosters + dictionary and build the index. Offline: both are already on disk. */
export function loadIndex() {
  const rosters = readJson("rosters_now.json", []) || [];
  const members = readJson("ui/members.json", []) || [];
  const nameById = new Map(members.map((m) => [m.user_id, m.name]));
  const owner = new Map();
  for (const r of rosters) {
    if (!r.owner_id) continue;
    for (const pid of r.players || []) {
      if (owner.has(String(pid))) continue;
      owner.set(String(pid), { user_id: r.owner_id, manager: nameById.get(r.owner_id) || r.owner_id, roster_id: r.roster_id });
    }
  }
  const path = new URL("./data/players.nfl.json", import.meta.url).pathname;
  if (!fs.existsSync(path)) throw new Error("data/players.nfl.json missing — run `node sleeper-sync.mjs` first");
  return buildMatchIndex(owner, JSON.parse(fs.readFileSync(path, "utf8")));
}

function main() {
  const argv = process.argv.slice(2);
  const index = loadIndex();
  const textArg = argv.indexOf("--text");
  if (textArg >= 0) {
    const text = argv[textArg + 1] || "";
    console.log(JSON.stringify({ text, ...matchText(text, index) }, null, 2));
    return;
  }
  const corpus = readJson("fixtures/rss-corpus.json", null);
  if (!corpus) throw new Error("no data/fixtures/rss-corpus.json — run `node news-sync.mjs --corpus`");
  const t = scoreCorpus(index, corpus);
  console.log(JSON.stringify({
    thresholds: { publish: PUBLISH_MIN, notify: NOTIFY_MIN, max_subjects: MAX_SUBJECTS },
    corpus: { items: t.total, harvested: new Date(corpus.harvested).toISOString() },
    aliases: { indexed: index.aliasKeys.size, dropped_not_rostered: index.aliasesDropped.length },
    baseline_verdicts: t.baseline,
    my_verdicts: t.mine,
    agree_on_player: t.agree,
    gained: t.gained.length,
    lost: t.lost.length,
    disagreed: t.disagree.length,
    gained_examples: t.gained.slice(0, 12),
    lost_examples: t.lost.slice(0, 12),
    disagreed_examples: t.disagree.slice(0, 12),
  }, null, 2));
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fs.realpathSync(new URL(import.meta.url).pathname);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// CATEGORIES is imported so this file cannot drift from the shipped category vocabulary: a
// category invented here would not have a voice template or a UI label.
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
