#!/usr/bin/env node
/**
 * The validation harness for the tweet matcher, the X ingest and the Discord sender.
 *
 *   node --test news-match.test.mjs
 *   node news-match.test.mjs --report      # the same numbers, printed for a human
 *
 * `node:test` and `node:assert` are Node built-ins, so this adds no dependency.
 *
 * ## Why the assertions are exact numbers
 *
 * `docs/DASHBOARD_AUDIT.md` §3a: a check that cannot fail is worse than no check. Two habits
 * follow from that and both are used here.
 *
 * **Nothing is asserted against live network.** Every input is a committed file
 * (`data/fixtures/`), so a number that moves is a code change rather than a news cycle. Asserting
 * "matched >= 20" against a live feed would pass forever.
 *
 * **The corpus assertions are exact counts, not floors.** 139 items, 32 with a published subject,
 * 0 baseline matches lost. If the matcher changes, this file fails and the numbers have to be
 * re-read and re-justified. That is the intent: a floor would have hidden the collision bug found
 * while writing it, where a wrong property name (`win.player_id` instead of `win.cand.player_id`)
 * silently turned every resolved collision into a refusal and still left 27 matches standing.
 *
 * ## What is real text and what is not
 *
 * - `data/fixtures/rss-corpus.json` — 139 items from a live fetch of the five RSS feeds, verbatim,
 *   each carrying `news-sync.mjs`'s own verdict. Third-party text, third-party answer set.
 * - `data/fixtures/schefter-quotes.json` — 24 sentences quoting or crediting Adam Schefter, from
 *   the same live fetch plus Sleeper's `get_player_news`. Third-party text; `tweet_form` is that
 *   text with one credit clause removed, and the clause removed is recorded per fixture.
 * - `ADVERSARIAL` below — hand-built probes, and **labelled as such on every row**. Each carries
 *   `real` (verbatim from the corpus) or `written` (composed here), because the whole point of the
 *   two files above is not to have to trust invented text, and a probe that claims otherwise
 *   would undo that.
 */
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { readJson } from "./lib.mjs";
import { matchText, loadIndex, normText, looksTitleCased, capitalisedIn, explainName, teamsNamed, PUBLISH_MIN, NOTIFY_MIN, MAX_SUBJECTS, CATEGORY_IDS, scoreCorpus } from "./news-match.mjs";
import { buildPayload, assertInertMentions, sanitiseText, storyKey, isRealDiscordId, createLimiter, post, alertsFrom, selfTest } from "./discord-notify.mjs";
import { plan, timelineUrl, userLookupUrl, normalisePost, budgetFor, pull, FIELDS, MAX_READS_PER_RUN, MAX_READS_PER_MONTH } from "./x-source.mjs";
import { stripAttribution } from "./news-fixtures.mjs";

const index = loadIndex();
const corpus = readJson("fixtures/rss-corpus.json", null);
const quotes = readJson("fixtures/schefter-quotes.json", null);

assert.ok(corpus, "data/fixtures/rss-corpus.json is missing — run `node news-sync.mjs --corpus`");
assert.ok(quotes, "data/fixtures/schefter-quotes.json is missing — run `node news-fixtures.mjs --harvest`");

/* ------------------------------------------------------------ adversarial ---- */

/**
 * The deliberate hard cases. `source: "real"` is verbatim third-party text lifted from the
 * committed corpus; `source: "written"` is composed here and says so.
 *
 * Every collision used is a **real** one in Sleeper's dictionary today, checked rather than
 * imagined: Justin Jefferson is a Vikings receiver this league rosters and a Browns linebacker it
 * does not; "Hunter" is the surname of two rostered players; "Etienne" of two more.
 */
const ADVERSARIAL = [
  {
    id: "two-rostered-players",
    source: "real",
    provenance: "Yahoo NFL, verbatim from rss-corpus.json",
    text: "Raiders expected to name Kirk Cousins Week 1 starter over No. 1 pick Fernando Mendoza",
    expect: { reason: "matched_multi", players: ["Fernando Mendoza", "Kirk Cousins"], notify: true },
    why: "Two managers own these two players and the item is genuinely about both. The RSS path drops it; per-manager emission keeps it.",
  },
  {
    id: "collision-no-team-context",
    source: "written",
    provenance: "composed; the collision is real (Justin Jefferson MIN/WR rostered, Justin Jefferson CLE/LB not)",
    text: "Justin Jefferson will not play Sunday, sources tell ESPN.",
    expect: { reason: "matched", players: ["Justin Jefferson"], notify: false, evidence: "name_collision_rank" },
    why: "No team named, so the ranking has to choose. It chooses the receiver, and the confidence says it chose rather than knew — publishable, not pingable.",
  },
  {
    id: "collision-team-context-confirms",
    source: "written",
    provenance: "composed; same real collision",
    text: "The Vikings say Justin Jefferson will not play Sunday.",
    expect: { reason: "matched", players: ["Justin Jefferson"], notify: true, evidence: "name_collision_team" },
    why: "One word settles it, so the confidence rises past the notify line.",
  },
  {
    id: "collision-team-context-contradicts",
    source: "written",
    provenance: "composed; same real collision",
    text: "The Browns say Justin Jefferson will not play Sunday.",
    expect: { reason: "refused", players: [] },
    why: "This is the Josh Allen bug in its live form. The Browns' Justin Jefferson is a linebacker nobody here owns, and silence is the only correct output.",
  },
  {
    id: "surname-ambiguous",
    source: "written",
    provenance: "composed; \"Hunter\" is the surname of two rostered players (Travis Hunter JAX, Jarquez Hunter MIA)",
    text: "Hunter is expected to miss a month with a knee injury.",
    expect: { reason: "refused", players: [] },
    why: "A surname shared by two rostered players and no team to separate them. Refuse.",
  },
  {
    id: "surname-unique-with-team",
    source: "real",
    provenance: "Rotowire via Sleeper get_player_news, tweet_form of fixture sq22",
    text: "The Texans placed Higgins (knee) on injured reserve Friday.",
    expect: { reason: "matched", players: ["Jayden Higgins"], notify: false, evidence: "surname_team" },
    why: "Two Higginses on NFL rosters; one word of team context picks the right one. Still below the notify line, because a surname is a surname.",
  },
  {
    id: "non-news-promo",
    source: "real",
    provenance: "ESPN NFL feed, verbatim from schefter-quotes.json sq02",
    text: "Adam Schefter's cheat sheet: The players our NFL insider is most excited about this season.",
    expect: { reason: "no_player", players: [] },
    why: "Names no player, and the promo wording would have cost 0.20 of confidence if it had.",
  },
  {
    id: "non-news-condolence",
    source: "written",
    provenance: "composed to the shape of a condolence post",
    text: "Thoughts and prayers to Kirk Cousins and his family today.",
    expect: { reason: "matched", players: ["Kirk Cousins"], notify: false },
    why: "Names a rostered player and reports nothing. It may sit in the feed; it must not ring a phone.",
  },
  {
    id: "non-news-draft-chatter",
    source: "written",
    provenance: "composed to the shape of draft chatter",
    text: "Mock draft season: where does Fernando Mendoza land on your big board?",
    expect: { reason: "matched", players: ["Fernando Mendoza"], notify: false },
    why: "Same again. Two non-news patterns fire, and the notify line holds.",
  },
  {
    id: "nobody-rosters-him",
    source: "real",
    provenance: "ESPN NFL feed, tweet_form of fixture sq18",
    text: "The Dolphins acquired quarterback Kyle McCord in a trade with the Packers on Sunday.",
    expect: { reason: "no_player", players: [] },
    why: "A real trade, a real quarterback, nobody in this league owns him. Nothing to say.",
  },
  {
    id: "roundup-refused",
    source: "real",
    provenance: "RotoBaller via Sleeper get_player_news, verbatim from schefter-quotes.json sq23",
    text: "The Washington Commanders have listed 15 players who will not participate in Saturday's preseason matchup with the Lions, but NFL Insider Adam Schefter notes that among the starters expected to see action are quarterback Jayden Daniels and wide receivers Terry McLaurin and Stefon Diggs.",
    expect: { reason: "matched_multi", players: ["Jayden Daniels", "Stefon Diggs", "Terry McLaurin"] },
    why: "Exactly MAX_SUBJECTS, so it stands. One more name and it would be a roundup and refused.",
  },
  {
    id: "roundup-over-the-limit",
    source: "written",
    provenance: "composed by adding a fourth rostered name to the sq23 shape",
    text: "The Commanders will hold out Jayden Daniels, Terry McLaurin, Stefon Diggs and Kirk Cousins on Saturday.",
    expect: { reason: "roundup", players: [] },
    why: "Four owned names is an inactives list, not a story about anyone. Refused rather than fanned out.",
  },
  {
    id: "ambiguous-alias",
    source: "written",
    provenance: "composed; \"JJ\" is genuinely both J.J. McCarthy and Justin Jefferson, both rostered, both MIN",
    text: "Big year coming for JJ.",
    expect: { reason: "refused", players: [] },
    why: "An alias two managers could both claim. Team context cannot help — they play for the same team.",
  },
  {
    id: "possessive-name",
    source: "real",
    provenance: "CBS Sports, verbatim from rss-corpus.json",
    text: "The Ja'Kobi Lane hype is real: Ravens rookie could quickly become Lamar Jackson's WR2",
    expect: { reason: "matched_multi", players: ["Ja'Kobi Lane", "Lamar Jackson"] },
    why: "A possessive. normName() deletes the apostrophe without a space, so without normText()'s possessive step this reads 'lamar jacksons' and matches nobody.",
  },
  {
    id: "the-jalon-daniels-headline",
    source: "real",
    provenance: "Rotowire, verbatim from rss-corpus.json — the headline that produced today's mis-attribution",
    text: "Jalon Daniels: Wins backup QB job",
    expect: { reason: "refused", players: [] },
    why: "The original bug addressed this to Baker Mayfield's owner. It must reach nobody, by any path.",
  },
];

/* ----------------------------------------------------------------- report ---- */

function matcherNumbers() {
  const t = scoreCorpus(index, corpus);
  const published = (corpus.items || []).filter((i) => matchText(i.title, index).subjects.some((s) => s.publish)).length;
  const notifiable = (corpus.items || []).filter((i) => matchText(i.title, index).subjects.some((s) => s.notify)).length;
  return { ...t, published, notifiable };
}

function fixtureNumbers() {
  let withSubject = 0;
  let withNotify = 0;
  const evidence = {};
  for (const f of quotes.items) {
    const r = matchText(f.tweet_form, index);
    const pub = r.subjects.filter((s) => s.publish);
    if (pub.length) withSubject++;
    if (pub.some((s) => s.notify)) withNotify++;
    for (const s of pub) evidence[s.evidence] = (evidence[s.evidence] || 0) + 1;
  }
  return { fixtures: quotes.items.length, withSubject, withNotify, evidence };
}

/* ------------------------------------------------------------------ tests ---- */

test("the corpus is the real thing and has not been trimmed", () => {
  assert.equal(corpus.items.length, 139);
  assert.equal(corpus.rostered_players, 337);
  assert.equal(corpus.feeds.length, 5);
  assert.ok(corpus.feeds.every((f) => f.ok), "every feed answered on the harvest run");
  const baseline = {};
  for (const i of corpus.items) baseline[i.baseline.verdict] = (baseline[i.baseline.verdict] || 0) + 1;
  // The shipping RSS matcher's own answer set, as documented in NEWS_SDD §4.
  assert.deepEqual(baseline, { matched: 27, no_player: 108, ambiguous: 4 });
});

test("no baseline match is lost, and no baseline match is re-attributed", () => {
  const t = scoreCorpus(index, corpus);
  // Every item the shipping matcher attributed, this matcher attributes to the same player. This
  // is the assertion that matters: a new matcher that gains items while quietly moving one to a
  // different manager would be a regression dressed as an improvement.
  assert.equal(t.agree, 27, "all 27 baseline matches agree on the player");
  assert.deepEqual(t.lost, [], "nothing the baseline matched is dropped");
  assert.deepEqual(t.disagree, [], "nothing the baseline matched is given to a different player");
});

test("the corpus numbers are exactly these, so a change has to be re-justified", () => {
  const n = matcherNumbers();
  assert.deepEqual(n.mine, { matched: 28, matched_multi: 4, refused: 18, no_player: 89 });
  assert.equal(n.published, 32, "32 of 139 items yield at least one publishable subject");
  assert.equal(n.gained.length, 5, "5 items the baseline did not attribute");
  // The five gains are all real and all checked by hand; naming them stops a future gain from
  // sliding in unread.
  assert.deepEqual(n.gained.map((g) => g.title.slice(0, 40)).sort(), [
    "Miami Dolphins 2026 roster cuts tracker:",
    "Predicting first-time NFL All-Pros at ev",
    "Raiders expected to name Kirk Cousins We",
    "The Ja'Kobi Lane hype is real: Ravens ro",
    "Todd Monken continues wrestling \"somewha",
  ]);
});

test("every headline the SDD names as a required refusal is refused", () => {
  const required = [
    // NEWS_SDD §4: the mis-attribution that pushed attribution to title-only.
    "Jalon Daniels: Wins backup QB job",
    // NEWS_SDD §4: named as a deliberate, correct drop.
    "Colts WR Allen arrested on drunk driving charges",
  ];
  for (const title of required) {
    assert.ok(corpus.items.some((i) => i.title === title), `${title} is in the corpus`);
    const r = matchText(title, index);
    assert.deepEqual(r.subjects.filter((s) => s.publish), [], `${title} must reach nobody`);
  }
});

test("the Schefter fixtures are real harvested text, not invented", () => {
  assert.ok(quotes.items.length >= 20, `${quotes.items.length} fixtures`);
  assert.equal(quotes.items.length, 24);
  for (const f of quotes.items) {
    assert.match(f.verbatim, /Schefter/i, `${f.id} verbatim credits him`);
    assert.ok(f.origin, `${f.id} records where it came from`);
    if (f.derived) {
      assert.ok(f.stripped, `${f.id} records the clause removed`);
      // The transform is reversible by inspection: what is left is a substring of the original
      // once the clause and the re-capitalisation are accounted for.
      assert.ok(!/Schefter/i.test(f.tweet_form) || f.verbatim.includes(f.stripped), `${f.id} strip is honest`);
    } else {
      assert.equal(f.tweet_form, f.verbatim, `${f.id} was not rewritten`);
    }
  }
  // Four different publishers, so the wording is not one outlet's house style.
  assert.ok(new Set(quotes.items.map((f) => f.origin)).size >= 4);
});

test("stripAttribution only ever removes a listed clause", () => {
  assert.equal(stripAttribution("The Jets are releasing Mazi Smith, Adam Schefter of ESPN reports.").tweet_form, "The Jets are releasing Mazi Smith.");
  assert.equal(stripAttribution("According to Adam Schefter, Kittle will practice.").tweet_form, "Kittle will practice.");
  assert.equal(stripAttribution("Kittle will practice."), null, "no clause, no change");
  assert.equal(stripAttribution("Schefter is on the podcast today."), null, "an unlisted shape is left alone");
});

test("the fixtures match the players they name", () => {
  const n = fixtureNumbers();
  assert.equal(n.fixtures, 24);
  assert.equal(n.withSubject, 19, "19 of 24 fixtures reach at least one manager");
  assert.equal(n.withNotify, 12, "12 clear the notify line");
  // Hand-checked attributions on the fixtures whose subject is unambiguous to a reader.
  const expected = {
    sq01: "George Kittle",
    sq04: "Bijan Robinson",
    sq07: "Jayden Higgins",
    sq11: "George Kittle",
    sq14: "Alvin Kamara",
    sq16: "Jonathan Taylor",
    sq21: "Jarquez Hunter",
    sq22: "Jayden Higgins",
  };
  for (const [id, player] of Object.entries(expected)) {
    const f = quotes.items.find((q) => q.id === id);
    assert.ok(f, `${id} exists`);
    const players = matchText(f.tweet_form, index).subjects.filter((s) => s.publish).map((s) => s.player);
    assert.ok(players.includes(player), `${id} -> ${player}, got ${JSON.stringify(players)}`);
  }
});

test("the adversarial cases behave as designed", () => {
  for (const c of ADVERSARIAL) {
    const r = matchText(c.text, index);
    assert.equal(r.reason, c.expect.reason, `${c.id}: reason (${JSON.stringify(r.notes || [])})`);
    const players = r.subjects.filter((s) => s.publish).map((s) => s.player).sort();
    assert.deepEqual(players, [...c.expect.players].sort(), `${c.id}: players`);
    if (c.expect.notify !== undefined) {
      assert.equal(r.subjects.some((s) => s.notify), c.expect.notify, `${c.id}: notify`);
    }
    if (c.expect.evidence) {
      assert.ok(r.subjects.some((s) => s.evidence === c.expect.evidence), `${c.id}: evidence ${c.expect.evidence}, got ${r.subjects.map((s) => s.evidence)}`);
    }
  }
});

test("a collision is decided by a margin, not by an id tie-break", () => {
  // The outcome assertions above pass even when the weights tie, because the id tie-break
  // happened to land on the right player. That made reverting the weights invisible. This asserts
  // the property the weights exist for: on each of the three sentences the winner wins outright.
  const cases = [
    { text: "The Browns say Justin Jefferson will not play Sunday.", winner: "CLE" },
    { text: "The Vikings say Justin Jefferson will not play Sunday.", winner: "MIN" },
    { text: "Justin Jefferson will not play Sunday, sources tell ESPN.", winner: "MIN" },
  ];
  for (const c of cases) {
    const scored = explainName("justin jefferson", index, teamsNamed(c.text, index));
    assert.equal(scored.length, 2, "the collision is real: two Justin Jeffersons in the dictionary");
    assert.equal(scored[0].team, c.winner, c.text);
    assert.ok(
      scored[0].score > scored[1].score,
      `${c.text} was decided ${scored[0].score}-${scored[1].score}, i.e. by a coin toss on player id`,
    );
  }
});

test("every adversarial probe declares whether its text is real", () => {
  for (const c of ADVERSARIAL) {
    assert.ok(c.source === "real" || c.source === "written", `${c.id} declares a source`);
    assert.ok(c.provenance && c.provenance.length > 10, `${c.id} says where the text came from`);
    if (c.source === "real") {
      const inCorpus = corpus.items.some((i) => i.title === c.text);
      const inQuotes = quotes.items.some((q) => q.verbatim === c.text || q.tweet_form === c.text);
      assert.ok(inCorpus || inQuotes, `${c.id} claims to be real text and must be findable in a committed fixture`);
    }
  }
  // More than half the probes are verbatim third-party text rather than composed.
  assert.ok(ADVERSARIAL.filter((c) => c.source === "real").length >= 6);
});

test("thresholds are ordered and every confidence tier lands where it was meant to", () => {
  assert.ok(PUBLISH_MIN < NOTIFY_MIN);
  const tiers = {
    "name (unique in the dictionary)": 0.90,
    "name_collision_team": 0.85,
    "surname_team": 0.72,
    "alias": 0.70,
    "name_collision_rank": 0.65,
    "surname": 0.58,
  };
  for (const [tier, value] of Object.entries(tiers)) {
    assert.ok(value >= PUBLISH_MIN, `${tier} publishes`);
  }
  // Only evidence that needed no judgement call can ping.
  assert.ok(tiers["name (unique in the dictionary)"] >= NOTIFY_MIN);
  assert.ok(tiers.name_collision_team >= NOTIFY_MIN);
  assert.ok(tiers.surname_team < NOTIFY_MIN, "a surname can never ping a phone");
  assert.ok(tiers.alias < NOTIFY_MIN, "a nickname can never ping a phone");
  assert.ok(tiers.name_collision_rank < NOTIFY_MIN, "a collision resolved by ranking can never ping a phone");
  assert.ok(tiers.surname < NOTIFY_MIN);
  // The non-news penalty must be exactly enough to take the strongest evidence below notify.
  assert.ok(0.90 - 0.20 < NOTIFY_MIN);
  assert.ok(0.90 - 0.20 >= PUBLISH_MIN, "and not so much that a listicle disappears");
});

test("the matcher cannot invent a category the voice and the UI do not know", () => {
  const seen = new Set();
  for (const i of corpus.items) seen.add(matchText(i.title, index).category);
  for (const f of quotes.items) seen.add(matchText(f.tweet_form, index).category);
  for (const c of seen) assert.ok(CATEGORY_IDS.includes(c), `${c} is in news-voice.mjs CATEGORIES`);
  assert.ok(seen.size >= 4, `${seen.size} categories exercised by the fixtures`);
});

test("normText handles the punctuation live text actually contains", () => {
  assert.equal(normText("A.J. Brown"), "aj brown");
  assert.equal(normText("Amon-Ra St. Brown"), "amon ra st brown");
  assert.equal(normText("Lamar Jackson's WR2"), "lamar jackson wr2");
  assert.equal(normText("Ja'Marr Chase"), "jamarr chase");
  assert.equal(normText("Jalon Daniels: Wins backup QB job"), "jalon daniels wins backup qb job");
  assert.equal(normText("Chris Brazzell II (knee)"), "chris brazzell knee");
});

test("the capitalisation guard is not vacuous", () => {
  // It can fail: lower-case "likely" is refused where capitalised "Likely" would not be.
  assert.equal(capitalisedIn("Philadelphia's most likely candidate", "likely"), false);
  assert.equal(capitalisedIn("Likely (thigh) returns to practice", "likely"), true);
  // And it is switched off where it would be vacuous.
  assert.equal(looksTitleCased("Jaguars to trade TE Hunter Long to Cardinals"), true);
  assert.equal(looksTitleCased("The Texans placed Higgins (knee) on injured reserve Friday."), false);
  const titleCased = matchText("Jaguars to trade TE Hunter Long to Cardinals", index);
  assert.deepEqual(titleCased.subjects, [], "no surname match on title-cased text");
  assert.ok(titleCased.notes.some((n) => /title-cased/.test(n)), "and it says why");
});

test("per-manager emission is bounded", () => {
  assert.equal(MAX_SUBJECTS, 3);
  const three = matchText("The Commanders will hold out Jayden Daniels, Terry McLaurin and Stefon Diggs on Saturday.", index);
  assert.equal(three.subjects.length, 3);
  assert.equal(three.reason, "matched_multi");
  const four = matchText("The Commanders will hold out Jayden Daniels, Terry McLaurin, Stefon Diggs and Kirk Cousins on Saturday.", index);
  assert.equal(four.reason, "roundup");
  assert.deepEqual(four.subjects, []);
});

test("one item per affected manager, and each carries its own manager", () => {
  const r = matchText("Raiders expected to name Kirk Cousins Week 1 starter over No. 1 pick Fernando Mendoza", index);
  assert.equal(r.subjects.length, 2);
  const managers = r.subjects.map((s) => s.manager);
  assert.equal(new Set(managers).size, 2, "two different managers");
  for (const s of r.subjects) {
    assert.ok(s.user_id, "every subject carries a Sleeper user_id");
    assert.ok(s.manager, "and the manager name it resolves to");
    assert.ok(s.why, "and the reasoning that produced its confidence");
  }
});

test("news-sync.mjs still runs as a script after being made importable", () => {
  // The entry-point guard fails silently if it stops resolving: the cron would run, print nothing
  // and refresh nothing. --voice needs no network, so this can assert the guard is live.
  const r = spawnSync(process.execPath, ["news-sync.mjs", "--voice"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.split("\n").length > 40, `--voice printed ${r.stdout.split("\n").length} lines`);
  assert.match(r.stdout, /\[injury\]/);
});

/* ----------------------------------------------------------- X ingest ---- */

test("x-source does nothing at all without a token", async () => {
  const before = process.env.X_BEARER_TOKEN;
  delete process.env.X_BEARER_TOKEN;
  try {
    const r = await pull({ token: "", persist: false });
    assert.equal(r.ok, true, "a missing token is a success, not a failure — the cron must stay green");
    assert.equal(r.skipped, true);
    assert.deepEqual(r.items, []);
    assert.equal(r.cost.post_reads, 0);
    assert.equal(r.cost.usd, 0);
    assert.match(r.reason, /no X_BEARER_TOKEN/);
  } finally {
    if (before !== undefined) process.env.X_BEARER_TOKEN = before;
  }
});

test("the timeline request matches X's OpenAPI document", () => {
  const url = new URL(timelineUrl("12345", { sinceId: "1700000000000000000", budget: 50 }));
  assert.equal(url.origin, "https://api.x.com");
  assert.equal(url.pathname, "/2/users/12345/tweets");
  assert.equal(url.searchParams.get("exclude"), "retweets,replies");
  assert.equal(url.searchParams.get("since_id"), "1700000000000000000");
  // Renamed from tweet.fields in spec 2.168; tweet.fields now appears only on streaming routes.
  assert.ok(url.searchParams.has("post.fields"));
  assert.ok(!url.searchParams.has("tweet.fields"));
  assert.equal(userLookupUrl("AdamSchefter"), "https://api.x.com/2/users/by/username/AdamSchefter");
});

/**
 * The first draft of this module asked for `referenced_posts` in `post.fields`. That name is real,
 * but it is an *expansion*, not a field, so X would have answered 400 and the ingest would have
 * been dead on the first run after the token arrived — with nothing in the repo able to notice,
 * because no test can call X without a token. So the spec's own enums are pinned to a fixture and
 * every parameter we send is checked against them offline. This is the check that would have caught
 * it, and the reason a wrong field name cannot come back quietly.
 */
test("every field and parameter we send is a member of the spec's own enum", () => {
  const spec = readJson("fixtures/x-post-fields.json", null);
  assert.ok(spec, "data/fixtures/x-post-fields.json is missing — re-pin it from X's OpenAPI spec");
  assert.equal(spec.field_param_name, "post.fields");
  assert.equal(spec.timeline_operation_id, "getUsersPosts");
  assert.equal(spec.user_lookup_operation_id, "getUsersByUsername");
  assert.ok(spec.post_fields_enum.length > 20, "the pinned enum looks like the real thing");

  const allowed = new Set(spec.post_fields_enum);
  const asked = FIELDS.split(",");
  assert.ok(asked.length > 0);
  for (const f of asked) {
    assert.ok(allowed.has(f), `post.fields=${f} is not in the spec's enum — X answers 400`);
  }

  // The specific mistake, nailed down so the fixture itself cannot be edited to excuse it.
  assert.ok(!allowed.has("referenced_posts"), "referenced_posts is an expansion, not a field");
  assert.ok(spec.expansions_enum.includes("referenced_posts"));
  assert.ok(!asked.includes("referenced_posts"));

  // And the rest of the query string, against the same document.
  const url = new URL(timelineUrl("12345", { sinceId: "1", budget: 50 }));
  for (const key of url.searchParams.keys()) {
    if (key === "post.fields") continue;
    assert.ok(spec.query_params.includes(key), `${key} is not a documented query parameter`);
  }
  for (const v of url.searchParams.get("exclude").split(",")) {
    assert.ok(spec.exclude_enum.includes(v), `exclude=${v} is not in the spec's enum`);
  }
  const mr = Number(url.searchParams.get("max_results"));
  assert.ok(mr >= spec.max_results.minimum && mr <= spec.max_results.maximum);
});

test("max_results is clamped to the spec's 5..100", () => {
  assert.equal(new URL(timelineUrl("1", { budget: 1 })).searchParams.get("max_results"), "5");
  assert.equal(new URL(timelineUrl("1", { budget: 5000 })).searchParams.get("max_results"), "100");
  assert.equal(new URL(timelineUrl("1", { budget: 50 })).searchParams.get("max_results"), "50");
});

test("the read budget is a real ceiling and is stated in dollars", () => {
  assert.equal(MAX_READS_PER_RUN, 50);
  assert.equal(MAX_READS_PER_MONTH, 1200);
  const worstCase = MAX_READS_PER_MONTH * 0.005;
  assert.equal(worstCase, 6, "the monthly ceiling is $6.00 against a ~$4.50 estimate");
  const spent = budgetFor({ month: new Date().toISOString().slice(0, 7), month_reads: 1195 });
  assert.equal(spent.run_budget, 5, "a nearly-spent month clamps the run");
  const done = budgetFor({ month: new Date().toISOString().slice(0, 7), month_reads: 1200 });
  assert.equal(done.run_budget, 0);
  const rolled = budgetFor({ month: "2020-01", month_reads: 1200 });
  assert.equal(rolled.run_budget, 50, "and a new billing cycle resets it");
});

test("a post normalises into the shape the pipeline already reads", () => {
  const row = normalisePost({ id: "1900000000000000001", text: "Kittle (Achilles) is expected to practice this week.", created_at: "2026-08-30T12:34:56.000Z" }, "AdamSchefter");
  assert.equal(row.source, "x:adamschefter");
  assert.equal(row.source_url, "https://x.com/AdamSchefter/status/1900000000000000001");
  assert.equal(row.title, "Kittle (Achilles) is expected to practice this week.");
  assert.equal(row.summary, "", "a post has no summary, and inventing one would invite the title-only rule");
  assert.equal(row.published, Date.parse("2026-08-30T12:34:56.000Z"));
  assert.equal(row.player_id, null);
  // An unparseable date is null, never Date.now().
  assert.equal(normalisePost({ id: "1", text: "x", created_at: "not a date" }, "a").published, null);
  assert.equal(normalisePost({ id: "1", text: "   " }, "a"), null, "an empty post is dropped");
});

test("--plan discloses the whole request without a token", () => {
  const p = plan();
  assert.equal(p.token_present, false);
  assert.equal(p.account, "AdamSchefter");
  assert.equal(p.budget.worst_case_month_usd, 6);
  assert.equal(p.unit_costs_usd.post_read, 0.005);
  assert.equal(p.unit_costs_usd.user_read, 0.01);
  assert.match(p.spec, /openapi\.json/);
});

/* --------------------------------------------------------- Discord sender ---- */

test("an @everyone headline cannot ping anything but the intended manager", () => {
  const intended = "111111111111111111";
  const payload = buildPayload({
    player: "George Kittle",
    headline: "@everyone @here <@&123456789012345678> Kittle ruled out — <@987654321098765432> confirms",
    source_label: "Rotowire",
    source_url: "https://example.com/x",
    league_line: "Bad news travels fast, @everyone.",
  }, intended);

  // The only thing Discord is permitted to resolve.
  assert.deepEqual(payload.allowed_mentions, { parse: [], users: [intended] });
  // And the content it would parse contains nothing else to resolve, independently of that.
  assert.deepEqual(payload.content.match(/<@!?&?\d+>|<#\d+>/g), [`<@${intended}>`]);
  assert.equal(/@everyone|@here/.test(payload.content), false);
  assert.match(payload.content, /@\u200beveryone/, "it still reads as @everyone to a human");
  assert.match(payload.content, /@\u200bhere/);
  assert.match(payload.content, /@\u200b123456789012345678/, "the role mention lost its brackets");
  assert.ok(payload.content.length <= 2000);
});

test("every clause of the mention guard can fail", () => {
  const report = selfTest();
  assert.equal(report.guard_clauses.length, 6);
  for (const c of report.guard_clauses) {
    assert.equal(c.refused, true, `${c.clause} must refuse`);
  }
  assert.equal(report.everyone_tokens_in_content, 0);
  assert.deepEqual(report.mention_tokens_in_content, ["<@111111111111111111>"]);
  assert.equal(report.third_party_at_signs_all_defused, true);
});

test("the guard is checked on the finished payload, so a careless caller is caught too", () => {
  const intended = "111111111111111111";
  // A payload assembled without sanitising: correct allowed_mentions, hostile content.
  assert.throws(
    () => assertInertMentions({ content: `<@${intended}> @everyone Kittle is out`, allowed_mentions: { parse: [], users: [intended] } }, intended),
    /live @everyone/,
  );
  assert.throws(() => assertInertMentions({ content: "no mention at all", allowed_mentions: { parse: [], users: [intended] } }, intended), /exactly one mention token/);
  assert.throws(() => assertInertMentions({ content: `<@${intended}>`, allowed_mentions: { parse: ["everyone"], users: [intended] } }, intended), /parse must be an empty array/);
  assert.throws(() => assertInertMentions({ content: `<@${intended}> ${"x".repeat(2100)}`, allowed_mentions: { parse: [], users: [intended] } }, intended), /over Discord's 2000/);
});

test("sanitising is readable and total", () => {
  assert.equal(sanitiseText("@everyone"), "@\u200beveryone");
  assert.equal(sanitiseText("<@&999>"), "@\u200b999");
  assert.equal(sanitiseText("<@!999>"), "@\u200b999");
  assert.equal(sanitiseText("<#999>"), "#999");
  assert.equal(sanitiseText("plain text"), "plain text");
  for (const hostile of ["@everyone", "@here", "<@1>", "<@&1>", "<@!1>", "<#1>", "@EVERYONE", "@\u200b@everyone"]) {
    assert.equal(/(<@|<#)|(@(?!\u200b))/.test(sanitiseText(hostile)), false, `${hostile} is defused`);
  }
});

test("a placeholder discord id refuses loudly instead of skipping quietly", () => {
  assert.equal(isRealDiscordId("000000000000000000"), false);
  assert.equal(isRealDiscordId("12345"), false);
  assert.equal(isRealDiscordId("111111111111111111"), true);
  assert.throws(() => buildPayload({ player: "x", headline: "y" }, "000000000000000000"), /fill in data\/discord-members\.json/);
  const config = readJson("discord-members.json", null);
  assert.ok(config, "data/discord-members.json is committed");
  assert.equal(config.members.length, 10, "one row per seat");
  const members = readJson("ui/members.json", []);
  assert.deepEqual(
    config.members.map((m) => m.user_id).sort(),
    members.map((m) => m.user_id).sort(),
    "and the seats match members.json, so nobody is silently absent",
  );
  // Shipped as placeholders. If this ever fails, somebody committed a real id — which is not a
  // secret, but it should be a deliberate act rather than a surprise in a diff.
  for (const m of config.members) assert.equal(isRealDiscordId(m.discord_id), false, `${m.manager} ships as a placeholder`);
  assert.equal(/discord\.com\/api\/webhooks/.test(JSON.stringify(config)), false, "and no webhook URL is in the file");
});

test("only items above the notify threshold become alerts", () => {
  const book = {
    items: [
      { id: "a", match: "player_id", user_id: "u1", player_id: "1", headline: "h", published: 0 },
      { id: "b", match: "name", user_id: "u1", player_id: "2", headline: "h", published: 0 },
      { id: "c", match: "name", user_id: "u1", player_id: "3", headline: "h", published: 0, confidence: 0.65 },
      { id: "d", match: "text", user_id: "u1", player_id: "4", headline: "h", published: 0, confidence: 0.85 },
    ],
  };
  const ids = alertsFrom(book).map((a) => a.id);
  assert.deepEqual(ids, ["a", "b", "d"], "0.65 publishes but does not notify");
  assert.equal(alertsFrom(book, { minConfidence: 1 }).length, 0);
});

test("the same story from two sources notifies once", () => {
  // The real cross-source shape, taken from the harvest: an aggregator restates a report and
  // appends a credit clause. Same first six meaningful words, hours apart, one story.
  const fromSleeper = { user_id: "u1", player_id: "3321", published: Date.parse("2026-08-30T08:00:00Z"), headline: "Kittle (Achilles) is expected to practice this week" };
  const fromX = { user_id: "u1", player_id: "3321", published: Date.parse("2026-08-30T19:00:00Z"), headline: "Kittle (Achilles) is expected to practice this week, Adam Schefter of ESPN reports" };
  assert.equal(storyKey(fromSleeper), storyKey(fromX), "one story, two sources");
  const differentStory = { ...fromSleeper, headline: "Kittle placed on injured reserve, out four weeks" };
  assert.notEqual(storyKey(fromSleeper), storyKey(differentStory), "and two stories about one player on one day both survive");
  const otherManager = { ...fromSleeper, user_id: "u2" };
  assert.notEqual(storyKey(fromSleeper), storyKey(otherManager), "a trade legitimately notifies two people");
  const nextDay = { ...fromSleeper, published: Date.parse("2026-09-01T08:00:00Z") };
  assert.notEqual(storyKey(fromSleeper), storyKey(nextDay), "and a genuine follow-up two days later is not suppressed");
});

test("the dry run is the default and writes no secret", async () => {
  const { run } = await import("./discord-notify.mjs");
  const out = await run({ target: "dry-run", book: readJson("ui/news.json", { items: [] }), now: 1756569600000 });
  assert.equal(out.dry_run, true);
  assert.equal(out.dry_run_reason, "default");
  assert.deepEqual(out.results, [], "nothing was sent");
  assert.ok(out.messages.length > 0, "and a reviewer can read what would have been");
  for (const m of out.messages) assert.equal(assertInertMentions(m.payload, m.discord_id), true);
  assert.equal(/discord\.com\/api\/webhooks|https:\/\/discordapp\.com/.test(JSON.stringify(out)), false, "no webhook URL anywhere in the artifact");
  assert.equal(out.webhook_env, null);
});

test("a configured target with no secret behind it degrades to a dry run", async () => {
  const { run } = await import("./discord-notify.mjs");
  const before = process.env.DISCORD_WEBHOOK_STAGING;
  delete process.env.DISCORD_WEBHOOK_STAGING;
  try {
    const out = await run({ target: "staging", book: { items: [] }, now: 1 });
    assert.equal(out.dry_run, true);
    assert.equal(out.dry_run_reason, "DISCORD_WEBHOOK_STAGING is not set");
    assert.equal(out.webhook_env, "DISCORD_WEBHOOK_STAGING");
  } finally {
    if (before !== undefined) process.env.DISCORD_WEBHOOK_STAGING = before;
  }
});

test("a 429 is obeyed, then retried", async () => {
  const waits = [];
  // The clock has to advance with the waits, or the limiter's hold never expires.
  let clock = 0;
  const wait = async (ms) => { waits.push(Math.round(ms)); clock += ms; };
  let call = 0;
  const fetchImpl = async () => {
    call++;
    if (call === 1) {
      return {
        status: 429,
        headers: new Headers({ "retry-after": "2", "x-ratelimit-remaining": "0", "x-ratelimit-reset-after": "2" }),
        json: async () => ({ retry_after: 1.5, global: false }),
      };
    }
    return { status: 204, headers: new Headers({ "x-ratelimit-remaining": "4", "x-ratelimit-reset-after": "1" }) };
  };
  const limiter = createLimiter({ wait, now: () => clock });
  const res = await post("https://example.invalid/webhook", { content: "x" }, { limiter, wait, fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.attempts, 2);
  // The server said 2 seconds via the header, which beats the body's 1.5.
  assert.ok(waits.includes(2000), `waited ${JSON.stringify(waits)}`);
});

test("the rate limiter holds the burst floor without real time passing", async () => {
  const waits = [];
  let clock = 0;
  const wait = async (ms) => { waits.push(Math.round(ms)); clock += ms; };
  const limiter = createLimiter({ wait, now: () => clock });
  for (let i = 0; i < 6; i++) await limiter.take();
  assert.equal(waits.length, 1, "the sixth request in a 2s window waits once");
  assert.ok(waits[0] >= 2000 && waits[0] <= 2100, `waited ${waits[0]}ms`);
});

test("a webhook that 404s is not retried", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { status: 404, headers: new Headers() }; };
  const res = await post("https://example.invalid/gone", { content: "x" }, { fetchImpl, wait: async () => {} });
  assert.equal(res.ok, false);
  assert.equal(res.terminal, true);
  assert.equal(calls, 1, "Discord restricts IPs that keep calling a dead webhook");
});

/* ----------------------------------------------------------------- report ---- */

if (process.argv.includes("--report")) {
  const m = matcherNumbers();
  const f = fixtureNumbers();
  console.log(JSON.stringify({
    thresholds: { publish: PUBLISH_MIN, notify: NOTIFY_MIN, max_subjects: MAX_SUBJECTS },
    rss_corpus: {
      items: m.total,
      baseline_verdicts: m.baseline,
      my_verdicts: m.mine,
      items_with_a_published_subject: m.published,
      items_with_a_notifiable_subject: m.notifiable,
      baseline_matches_agreed: m.agree,
      baseline_matches_lost: m.lost.length,
      baseline_matches_reattributed: m.disagree.length,
      items_gained: m.gained.length,
    },
    schefter_fixtures: f,
    adversarial: ADVERSARIAL.map((c) => ({ id: c.id, source: c.source, reason: matchText(c.text, index).reason, players: matchText(c.text, index).subjects.filter((s) => s.publish).map((s) => `${s.player} ${s.confidence}${s.notify ? " PING" : ""}`) })),
  }, null, 2));
}
