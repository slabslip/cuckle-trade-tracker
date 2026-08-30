#!/usr/bin/env node
/**
 * The voice. One seam, built to be thrown away.
 *
 * ## Why this file exists at all
 *
 * The whole point of the feed is that a headline is addressed to the manager who owns the
 * player, in the league's own register. That writing is the part the user wants to own — they
 * said so: *"i will assist with how to write the news in a fun league specific way"*. So the
 * writing lives here and nowhere else.
 *
 * **The seam is `leagueLine(item, ctx)`.** news-sync.mjs calls it once per item and stores the
 * string it returns in `news.json.items[].league_line`. Nothing else in the pipeline knows how a
 * line is made, and the UI only ever reads the stored string. That means the voice can be
 * replaced — rewritten templates, a different tone, or an LLM call behind the same signature —
 * by editing this file alone. Ingest does not change. The UI does not change. The schema does
 * not change.
 *
 * ## Two callers, one seam
 *
 * `leagueLine(item, ctx)` is the synchronous template path and is the fallback for everything.
 * `leagueLineAsync(item, ctx, opts)` is the same seam with the LLM adapter in front of it: it
 * asks `news-llm.mjs` for a line, and returns `leagueLine()`'s when the adapter declines — which
 * it always does without an API key. news-sync.mjs calls the async form for every row, so
 * switching the model on is configuration rather than a code change, and switching it off costs
 * nothing because the templates were never removed.
 *
 * ## Why templates and not an LLM, for now
 *
 * No npm, no API key, no network in the copy step, and the same input produces the same line
 * every run — which is what keeps `news.json` diffable in git and keeps a re-run from rewriting
 * fifty rows for no reason. It is not as funny as a model would be. That trade, and exactly what
 * the LLM path would cost and need, is written up in docs/NEWS_SDD.md.
 *
 * ## A summary is not a jab, and the sharer's note is not ours
 *
 * The needling register below belongs to the *automated* feed, where the app is the only voice in
 * the row. A shared tweet has two voices: the member who shared it, and this file. They are kept
 * apart, and that separation is the whole of §10b in docs/NEWS_SDD.md:
 *
 *   - **The member's note is data, not copy.** It ships on the row as `note` and is rendered in
 *     its own element, prefixed by the name of whoever wrote it. leagueLine() never sees it as
 *     something to return, and no generated line can replace it or be replaced by it.
 *   - **A shared tweet's line is fact + poke.** summariseTweet() states what the tweet said;
 *     a short bank poke follows for attitude. Single-seat rows may say "you"; multi-tag and
 *     The league stay impersonal (`tweet_league`). Never repeat the manager name in the line —
 *     that lives in the header. `noteFreeOfAddress()` asserts the multi/unaddressed cases.
 *
 * ## The rules the lines follow
 *
 * These are ten people who know each other, and the names are real. So:
 *   - Needle the **roster decision**, the **timing** or the **player**, never the person.
 *   - Nothing about appearance, family, money, or anything a person would not laugh at.
 *   - Address the manager by the name they chose in Sleeper, second person.
 *   - Never invent a fact. The line frames the headline; the headline is printed beside it.
 *   - Good news for a manager still gets needled — that is the register, not cruelty.
 *
 * Variant choice is a hash of the item id, not `Math.random()`, so a line is stable for a given
 * story forever and two stories about the same player on the same day do not read identically.
 */

/**
 * Categories, and the order they are tested in. First match wins, so the specific patterns come
 * before the general ones — "suspended" must beat "out" and "returns" must beat "injury".
 *
 * `severity` drives sort order and nothing else. It is not a colour: the UI is deliberately not
 * red/green here, because --red and --green mean "you are down/up value" everywhere else in this
 * app and a hamstring is not a value delta.
 */
export const CATEGORIES = [
  {
    // Before "suspension", because an arrest is not a suspension and the line must not say it is.
    id: "off_field",
    label: "Off the field",
    severity: 4,
    test: /\b(arrest\w*|charged with|charges?|DUI|DWI|OWI|citation|cited for|court|indict\w+|lawsuit|sued|police|jail|custody)\b/i,
  },
  {
    id: "suspension",
    label: "Suspension",
    severity: 4,
    test: /\b(suspend\w*|suspension|banned|placed on the (?:commissioner|exempt)|violat\w+ (?:of )?the (?:league'?s )?(?:personal conduct|substance|performance)|reinstat\w+)\b/i,
  },
  {
    id: "injury",
    label: "Injury",
    severity: 5,
    test: /\b(injur\w+|tears?|torn|ACL|MCL|Achilles|concussion|hamstring|surgery|fracture\w*|sprain\w*|out for the season|IR\b|injured reserve|placed on IR|questionable|doubtful|ruled out|will not play|did not practice|hospital\w*|carted off|strain\w*|PUP list)\b/i,
  },
  {
    id: "trade",
    label: "Trade",
    severity: 4,
    test: /\b(traded?|trade|acquir\w+|dealt|shipped to|sent to|released|waived|cut\b|signs? with|signed with|claim\w+ off waivers|agree\w* to terms)\b/i,
  },
  {
    id: "depth_chart",
    label: "Depth chart",
    severity: 3,
    // `starting QB|RB|WR|TE` was added when the shared-tweet summariser landed: "Kirk Cousins
    // expected to be named Raiders starting QB" is a depth-chart fact and fell to the `news`
    // catch-all, because the pattern already had `starter` and `starting quarterback` and not the
    // abbreviation wire copy actually uses. It is the same class of fact as the words beside it,
    // so this widens the category rather than changing what it means.
    test: /\b(depth chart|starter|starting (?:job|role|quarterback|running back|QB|RB|WR|TE)|benched?|demot\w+|promot\w+|snap (?:count|share)|first[- ]team|second[- ]string|named the|wins? the (?:job|competition)|committee|timeshare|touches)\b/i,
  },
  {
    id: "breakout",
    label: "Breakout",
    severity: 2,
    test: /\b(breakout|impress\w+|standout|turning heads|best shape|buzz|sleeper|hype|explod\w+|dominat\w+|career[- ]high|stock (?:is )?(?:up|rising)|shines?|stars?\b)\b/i,
  },
  /**
   * A tweet a league member shared in by hand. **Never reached by classify()** — its test is
   * `/(?!)/`, which cannot match anything — because this category is not inferred from words, it
   * is assigned by news-sync.mjs to items that came through the submission queue. It is listed
   * here so the shipped `category` is one CATEGORIES knows, which is what news-sync.mjs's
   * self-check and the UI's label table both read.
   *
   * Severity 4 puts a hand-picked item above the generic `news` bank it would otherwise sort
   * among. Somebody chose to send this one; that is more signal than an aggregator restating a
   * depth chart. It is still only a sort weight, and still not a colour.
   */
  { id: "tweet", label: "From X", severity: 4, test: /(?!)/ },
  { id: "news", label: "News", severity: 1, test: /.*/ },
];

/** Words that mean the story is *good* for the owner, inside an otherwise worrying category. */
const UPBEAT = /\b(returns?|returning|cleared|activated|full (?:go|participant|practice)|expected to (?:play|practice|start|suit up)|no structural damage|avoided|good to go|will play|upgraded|back at practice|resumed|progressing|ahead of schedule|out of the (?:boot|walking boot))\b/i;

/**
 * The templates. `{who}` is the manager, `{player}` the player, `{team}` their NFL team.
 *
 * Every slot is filled with plain text and the result is escaped with esc() at render time —
 * these strings are the only part of a line this repo controls, and they are static source, so
 * the injection surface is the headline, not this table.
 */
const TEMPLATES = {
  injury: [
    "{who}, the trainer's table has your guy again. {player} is on the report and your Sunday just got interesting.",
    "Bad news travels fast, {who}. {player} is banged up. Time to go be nice to somebody in the group chat.",
    "{who} is about to refresh the injury report for the ninth time today. It still says {player}.",
    "Somebody check on {who}. {player} is hurt and the waiver wire is not going to be kind.",
    "{who}, this is your reminder that {player} has a body. The body has opinions.",
    "The medical staff has thoughts about {player}, {who}. None of them are the ones you wanted.",
  ],
  injury_good: [
    "Exhale, {who}. {player} is trending the right way for once.",
    "{who} gets a win: {player} is back on track. Enjoy it, it's the offseason of your life.",
    "{player} is cleared, {who}. You may now stop pretending you had a backup plan.",
    "Good news for {who}, which is frankly a change of pace. {player} is on the mend.",
  ],
  suspension: [
    "{who}, {player} is going to be watching some football in regular clothes. League business.",
    "Roster math incoming for {who}: {player} has a date with the league office.",
    "{who} is going to want to read this one sitting down. It's about {player} and the league office.",
    "{player} found a way to miss games without getting hit, {who}. Impressive, in a way.",
  ],
  off_field: [
    "{who}, {player} made the wrong kind of headline. Nothing to do but read it.",
    "This one's off the field, {who}. {player} is in the news and it isn't about football.",
    "{who}, there's a {player} story going around and it has nothing to do with routes.",
    "Heads up, {who}: the {player} news is the non-football kind.",
  ],
  trade: [
    "{who}, {player} has a new address. Hope you liked the old one.",
    "New team, new problems. {player} is on the move and {who} owns the ride.",
    "{who} did not consent to this trade and it happened anyway. {player} is out of {team}.",
    "Somebody traded {player} and it wasn't {who}, which is somehow worse.",
    "{who}, your guy {player} just got moved. The league does not check with you first.",
  ],
  depth_chart: [
    "Depth chart movement on {player}, {who}. Read it before you set a lineup you regret.",
    "{who}, the coaching staff has an opinion about {player} and you are not going to love the tone.",
    "{player}'s role just changed, {who}. You drafted the role, not the guy, remember?",
    "{who} spent real capital on {player} and a position coach just moved him around like furniture.",
    "Somebody tell {who} that {player}'s snaps are a group project now.",
  ],
  breakout: [
    "{who} is going to be insufferable about this. {player} is turning heads.",
    "Heads up, league: {who} owns {player}, and {player} is getting buzz. Brace for the posting.",
    "{who}, {player} is looking good. You will now claim you always knew.",
    "{player} is trending up and {who} is already drafting the trade offer you're about to decline.",
    "Credit where it's due: {who} has {player}, and {player} is playing well. Annoying.",
  ],
  // The largest bank on purpose: `news` is the catch-all, so most weeks most rows land here and
  // a short list would have the whole feed reading like one sentence.
  news: [
    "{who}, there's news on {player}. Consider yourself informed.",
    "{player} is in the headlines, {who}. Your roster, your problem.",
    "News on {player}. {who} owns him, so {who} gets to care.",
    "{who}, something happened to {player}. It's probably fine. It's usually fine.",
    "For {who}'s attention: {player} made the news today.",
    "{who} owns {player}, so this one lands on {who}'s desk.",
    "{player} did something newsworthy, {who}. Whether it's good is above the feed's pay grade.",
    "Paging {who}: your {player} investment is generating column inches.",
    "{who}, {player} is being written about again. You know what you did.",
    "There is {player} content today, {who}, and you are contractually the audience.",
    "{who}, the beat writers have found {player}. Godspeed.",
  ],
  news_good: [
    "Something went right for {who} for once. {player} is in the news and it reads well.",
    "{who}, the {player} news is the good kind. Don't get used to it.",
    "Filed under things going {who}'s way: {player}.",
    "{player} had a good day, {who}. You may now tell everyone you planned it.",
    "{who} is going to screenshot this one. {player} looked good.",
    "Reluctantly, credit to {who}: the {player} news is positive.",
  ],
  /** Nobody in the league owns the player. These never ship — see news-sync.mjs. */
  orphan: ["{player} is in the news and nobody in this league owns him."],
  /**
   * Shared-tweet banks: short **pokes** appended after the factual summariseTweet() line.
   * The manager name stays in the row header; these speak as "you" and never repeat the seat.
   * Facts come from summariseTweet(); these lines are attitude only.
   */
  tweet: [
    "Your roster. Your problem.",
    "How's the stomach.",
    "Even a blind squirrel finds a nut.",
    "Don't refresh the waivers too hard.",
    "The group chat is already typing.",
    "Sleep tight.",
    "Hope you liked that pick.",
    "Tell the bench it might be starting.",
  ],
  tweet_who: [
    "Don't act surprised.",
    "Eyes up.",
    "Read it twice.",
    "This one's aimed at your forehead.",
    "Not a drill.",
    "You're welcome.",
  ],
  /** Impersonal tags for The league / multi-tag rows — no "you". */
  tweet_league: [
    "Pass it around.",
    "Group chat fuel.",
    "Everybody see this?",
    "File under: league business.",
    "No notes. Just vibes.",
  ],
};

/* ------------------------------------------------- summarising a tweet ---- */

/**
 * The `tweet` bank, and it is a bank of **labels rather than sentences**.
 *
 * ## Why the old three banks are gone
 *
 * They were jokes with slots — *"{who}, somebody went out of their way to make sure you saw this
 * {player} take"* — and they had two problems that a fourth variant could not fix.
 *
 * **They said nothing about the tweet.** Before oEmbed there was nothing to say: the pipeline had
 * a URL, a sharer and maybe a target, and a line about the *act of sharing* was the only honest
 * thing available. It now has the tweet's actual text, its author, the reporter credited inside
 * it, the rostered player, that player's team and position, and a category read off the words. A
 * template that ignores all of that in favour of "somebody shared this" is throwing away the only
 * new information the feature acquired.
 *
 * **They addressed the manager in second person**, which was safe while `target_name` was the
 * only way a row could be addressed and is not safe now that a matcher can address one. See the
 * header note: a summary that says "you" makes the sharer's jab read as though it were aimed at
 * whoever rosters the player.
 *
 * ## The shape, and why it is fixed
 *
 * ```
 * {Kind}[ on {Player} ({TEAM POS})] \u2014 {fact from the tweet}. [Via @{reporter}.]
 * ```
 *
 * One shape for every row, deliberately. The old bank needed variety because a joke repeated
 * twice is not a joke; a summary is *scanned*, and a stable shape is what makes a column of
 * twelve of them readable at a glance. The variation that matters here is that the fact is
 * different every time, because it comes from the tweet.
 *
 * Each piece is omitted when it would be noise rather than padded with a placeholder — the
 * lesson the old bank taught the hard way:
 *
 *   - **Kind** is dropped for the `news` catch-all, which asserts nothing. "News \u2014 Sounds like
 *     TreVeyon Henderson is going to be fine" is worse than the sentence on its own.
 *   - **The subject clause** appears only when the fact does not already name the player, which
 *     is the surname-wording case ("Kittle (Achilles) is expected to practice"). Otherwise it
 *     duplicates both the fact and the row's own meta line, which already prints
 *     `Keenan Allen \u00b7 IND WR`.
 *   - **The credit** appears only when the tweet actually credits somebody.
 */
const TWEET_KINDS = {
  injury: "Injury",
  injury_good: "Good injury news",
  off_field: "Off the field",
  suspension: "Suspension",
  trade: "Roster move",
  depth_chart: "Depth chart",
  breakout: "Buzz",
  news: "",
  news_good: "",
  tweet: "",
};

/** How long a fact lifted out of a tweet may be before it is clipped at a word boundary. */
const MAX_FACT = 150;
/** The whole summary line. Two lines of a 320px row, not six. */
const MAX_LINE = 220;
/** A member's note, capped the same way a headline is. Their words, not their word count. */
export const MAX_NOTE = 240;

/**
 * The reporter a tweet credits, and the clause that credits them.
 *
 * Three orderings, because live text uses all three: `per @handle`, `as @handle reported`, and a
 * bare `@handle reports`. The first pattern also eats a trailing list — real wording is
 * `via @DZangaroNBCS & Frank Reuben`, and leaving the co-credit behind puts a stray proper noun
 * in the middle of the summary.
 */
const CREDIT_PATTERNS = [
  /\bas\s+@([A-Za-z0-9_]{1,15})\s+report(?:ed|s)\b/i,
  /\b(?:per|via|h\/t|hat tip|from|according to)\s+@([A-Za-z0-9_]{1,15})(?:\s*(?:&|and|,)\s*(?:@[A-Za-z0-9_]{1,15}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))*/i,
  /\B@([A-Za-z0-9_]{1,15})\s+report(?:s|ed)\b/i,
];

/**
 * Words that can only begin a sentence, used to split a tweet that never typed a full stop.
 *
 * A **whitelist**, and that is the entire point. The obvious rule — split where a lower-case
 * word is followed by a capitalised one — cuts *"the Colts are seeking a 1st round pick for |
 * Anthony Richardson"* in half, because "for" is lower case and "Anthony" is a capital. Only
 * words that cannot appear as the second half of a noun phrase are listed, so a proper noun can
 * never trigger a split. It earns its place on real text: `Eli Stowers could start the season on
 * IR-R (hamstring) They also believe he was going to be a healthy inactive` is one submission in
 * the live queue, and without this the summary runs to the clip limit and ends mid-clause.
 */
const RUNON = /(?<=[a-z0-9)\]"'\u2019\u201d])\s+(?=(?:They|He|She|It|We|This|That|These|Those|There|But|And|Also|Now|Feels|Sounds|Meanwhile|However)\b)/;

/**
 * The one salient fact in a tweet, plus who is credited for it.
 *
 * Everything removed here is either not prose or not about the story: the media permalink an
 * image attachment leaves behind, any bare link, a trailing run of hashtags, and the credit
 * clause — which is removed from the fact and re-attached at the end of the line, where it reads
 * as a source rather than as part of the sentence.
 *
 * **Nothing is added and nothing is reworded.** The fact that comes out of here is a contiguous
 * span of the tweet's own words, so the summary cannot state something the tweet did not. That is
 * failure mode 2 in docs/NEWS_SDD.md §8, and a template summariser is only defensible because it
 * cannot commit it.
 */
export function salient(text) {
  let s = String(text == null ? "" : text)
    .replace(/\bpic\.twitter\.com\/\S+/gi, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\bt\.co\/\S+/gi, " ");
  const credits = [];
  for (const re of CREDIT_PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    credits.push(m[1]);
    s = s.replace(m[0], " ");
  }
  // Trailing hashtags are labels for X's search, not part of the sentence.
  s = s.replace(/(?:\s+#[A-Za-z0-9_]+)+\s*$/g, " ");
  s = tidy(s);
  // The first sentence, when the tweet wrote one and it is long enough to stand alone. A very
  // short opener ("Report:", "Wow.") is a lead-in rather than the story, so it is kept.
  const stop = s.search(/[.!?](?:\s|$)/);
  if (stop >= 40) s = s.slice(0, stop + 1);
  else {
    const parts = s.split(RUNON);
    if (parts.length > 1 && parts[0].length >= 25) s = parts[0];
  }
  return { fact: clipAt(tidy(s), MAX_FACT), credits: [...new Set(credits)] };
}

/**
 * Whitespace and the punctuation artefacts that removing a clause leaves behind.
 *
 * The comma rule is the one worth naming. `…in downtown Indianapolis, as @FOX59 reported.` loses
 * its middle and closes on `Indianapolis,.` — a comma that was correct before the clause it
 * introduced was taken out. Three live submissions produced exactly that, in three different
 * shapes (`,.`, `,".`, `QB,.`), so the comma is dropped wherever it now sits immediately before
 * the sentence's own full stop, inside or outside a closing quote.
 *
 * A spaced hyphen becomes an em dash because that is what it is standing in for in a tweet; an
 * unspaced one is left alone, so `IR-R` and `first-team` survive.
 */
function tidy(s) {
  return String(s == null ? "" : s)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+:/g, ":")
    .replace(/[,;:]+(\s*["'\u2019\u201d]?)\s*([.!?])\s*$/, "$1$2")
    .replace(/ +- +/g, " \u2014 ")
    // A dangling opener or separator left by a removed clause.
    .replace(/^[\s,;:.\u2013\u2014-]+/, "")
    .replace(/[\s,;:\u2013\u2014&-]+(["'\u2019\u201d]?)\s*$/, "$1")
    // `On <Name>:` is a wire-copy lead-in, not part of the fact, and it survives the credit
    // removal that produced it: `On Tank Dell via @AaronWilson_NFL : Somewhat speculative...`
    // leaves `On Tank Dell: Somewhat speculative...`. The colon is required, so an ordinary
    // sentence opening "On Sunday the Colts..." is untouched.
    .replace(/^On\s+[A-Z][A-Za-z'.\u2019-]*(?:\s+[A-Z][A-Za-z'.\u2019-]*){0,3}:\s*/, "")
    .trim();
}

/** Clip to a word boundary and mark the cut, so a truncated quote does not read as complete. */
function clipAt(s, n) {
  const text = String(s == null ? "" : s).trim();
  if (text.length <= n) return text;
  const cut = text.slice(0, n);
  const space = cut.lastIndexOf(" ");
  return (space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "") + "\u2026";
}

/**
 * Does this fact already name the player, so a subject clause would only repeat it?
 *
 * **The full name, and only the full name.** A surname deliberately does not count: `Kittle
 * (Achilles) is expected to practice` and `thinks that Dell goes on IR-R` are exactly the cases
 * where the subject clause is worth its width, because it turns a surname into `George Kittle
 * (SF TE)` and tells a reader which Kittle and which position. The first version counted the
 * surname, and the effect was that the surname-only wording — the shape wire copy uses most —
 * was the one shape that lost its subject.
 */
function namesPlayer(fact, player) {
  const p = String(player || "").trim();
  if (!p) return true;
  return String(fact || "").toLowerCase().includes(p.toLowerCase());
}

/**
 * One shared tweet, summarised.
 *
 * @param item {{ player, team, position, title, tweet_handle }}
 *   `title` is the tweet's whole text — a tweet has no title/summary split.
 * @returns {string} one line of plain text, unescaped, never naming a manager
 */
export function summariseTweet(item) {
  const text = String((item && item.title) || "");
  const { fact, credits } = salient(text);
  const player = String((item && item.player) || "").trim();
  const handle = String((item && item.tweet_handle) || "").replace(/^@/, "").trim();
  const credit = credits.length
    ? ` Via ${credits.map((h) => `@${h}`).join(" and ")}.`
    : "";

  if (!fact) {
    // No readable prose in the tweet at all — an image-only post. Say that, rather than
    // inventing a sentence about a picture nobody in the pipeline has seen.
    return handle ? `@${handle} posted this without any text.` : "Shared from X, with no text.";
  }

  const terminal = /[.!?\u2026]$/.test(fact) ? "" : ".";

  // No rostered player: the summary is who said what. There is no story to frame, and framing it
  // anyway is how the old bank ended up describing the act of sharing instead of the content.
  if (!player) return clipAt(handle ? `@${handle}: ${fact}${terminal}${credit}` : `${fact}${terminal}${credit}`, MAX_LINE);

  // **The topic, not the row's category.** A shared tweet's `category` is always "tweet" — it
  // records how the row got here, not what it is about — so reading it would put every summary in
  // the catch-all. classify() over the tweet's own text is what says "injury" or "off the field",
  // and it is the same function, on the same text, that dedupeAgainstTweets() already runs.
  const topic = classify(text);
  const key = topic.upbeat && (topic.category === "injury" || topic.category === "news")
    ? `${topic.category}_good`
    : topic.category;
  const kind = TWEET_KINDS[key] != null ? TWEET_KINDS[key] : TWEET_KINDS.news;
  const team = [item.team, item.position].filter(Boolean).join(" ");
  const subject = namesPlayer(fact, player) ? "" : `${player}${team ? ` (${team})` : ""}`;
  const lead = kind && subject ? `${kind} on ${subject}` : kind || subject;
  const line = lead
    ? `${lead} \u2014 ${fact}${terminal}${credit}`
    : `${fact}${terminal}${credit}`;
  return clipAt(line, MAX_LINE);
}

/**
 * A member's note, trimmed and capped, and nothing else done to it.
 *
 * Exported so news-sync.mjs and the self-test apply exactly one rule. It is third-party text —
 * typed by a person, arriving through a table anyone holding the anon key can write to — so it is
 * escaped at render like every other field. Being "ours" earns it no trust and being theirs earns
 * it no editing: the words inside the cap are verbatim.
 */
export function trimNote(note) {
  const s = String(note == null ? "" : note).replace(/\s+/g, " ").trim();
  if (s.length <= MAX_NOTE) return s;
  return s.slice(0, MAX_NOTE - 1).replace(/[\s,;:.]+$/, "") + "\u2026";
}

/**
 * Does this line keep out of the business of addressing a person?
 *
 * The rule the shared-tweet summary has to obey: no manager's name, no second person. Asserted in
 * news-sync.mjs's self-test against every row it is about to write, because the reason for the
 * rule is not stylistic — an auto-attributed row carries somebody else's jab, and a summary that
 * says "you" or names the tagged manager collapses the distinction the whole design rests on.
 */
export function noteFreeOfAddress(line, managers) {
  const s = String(line == null ? "" : line);
  if (/\b(?:you|your|you're|youre|yours)\b/i.test(s)) return "uses second person";
  for (const m of managers || []) {
    if (m && s.toLowerCase().includes(String(m).toLowerCase())) return `names the manager ${m}`;
  }
  return "";
}

/** Deterministic, well-mixed enough to spread six variants evenly. FNV-1a. */
function hash(s) {
  let h = 0x811c9dc5;
  const str = String(s == null ? "" : s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Which category a headline belongs to, plus whether it reads as good news for the owner.
 *
 * **Reads the title only, deliberately.** The first version classified on title *plus* summary
 * and produced two lines that stated things the story did not say: an arrest became "{player} is
 * suspended", and a Trevor Lawrence *ranking* piece became "back on track" because the analysis
 * paragraph mentioned his ACL in passing. A summary supplies context, injury history and other
 * players, none of which is what *this* item is about.
 *
 * Classifying on the title alone means an unclear headline falls through to `news`, whose
 * templates assert nothing beyond "there is news about this player" — which is always true. A
 * misclassification therefore costs a generic line rather than a false one, and that is the
 * direction this feature has to fail in.
 */
export function classify(title) {
  const s = String(title == null ? "" : title);
  const cat = CATEGORIES.find((c) => c.test.test(s)) || CATEGORIES[CATEGORIES.length - 1];
  return { category: cat.id, label: cat.label, severity: cat.severity, upbeat: UPBEAT.test(s) };
}

/**
 * Glue a factual tweet summary to a short poke without blowing MAX_LINE.
 * Fact first (the news), poke second (the attitude).
 */
function joinFactAndPoke(fact, poke) {
  const f = String(fact || "").replace(/\s+/g, " ").trim();
  const p = String(poke || "").replace(/\s+/g, " ").trim();
  if (!p) return f;
  if (!f) return p;
  const budget = Math.max(72, MAX_LINE - p.length - 1);
  const head = clipAt(f, budget);
  const base = /[.!?…]$/.test(head) ? head : `${head}.`;
  return clipAt(`${base} ${p}`, MAX_LINE);
}

function tweetPoke(item, manager) {
  const player = String((item && item.player) || "").trim();
  const seed = item && (item.id || item.title || player || manager) || "poke";
  if (manager && player) {
    const bank = TEMPLATES.tweet;
    return bank[hash(seed) % bank.length]
      .replace(/\{player\}/g, player)
      .replace(/\{team\}/g, String((item && item.team) || "his old spot"))
      .trim();
  }
  if (manager) {
    const bank = TEMPLATES.tweet_who;
    return bank[hash(seed) % bank.length].trim();
  }
  const bank = TEMPLATES.tweet_league;
  return bank[hash(seed) % bank.length].trim();
}

/**
 * **The seam.** Turn one matched news item into one line of league voice.
 *
 * @param item {{ id, player, team, position, category, upbeat, title, tweet_handle }} the story
 * @param ctx  {{ manager }} the manager the line is addressed to
 * @returns {string} one sentence or two, plain text, unescaped
 *
 * Replacing the voice means replacing this function's body and the tables above it. Its inputs
 * and its return type are the contract with news-sync.mjs; keep those and nothing else breaks.
 *
 * **Shared tweets:** factual summariseTweet() first, then a short poke. Manager name stays in
 * the row header; pokes use "you" only when a single seat is addressed. Multi-tag / The league
 * get an impersonal tag so nobody is roasted by mistake.
 */
export function leagueLine(item, ctx) {
  const manager = String((ctx && ctx.manager) || "").trim();
  const player = String((item && item.player) || "").trim();

  /**
   * Shared tweets: news first, attitude second.
   *
   * summariseTweet() carries what happened. The tweet / tweet_who / tweet_league banks are
   * short pokes only — they used to *replace* the fact and the feed lost the story. The
   * sharer's note is a separate field and never returned from this seam.
   */
  if (item && item.category === "tweet") {
    const fact = summariseTweet(item);
    const poke = tweetPoke(item, manager);
    return joinFactAndPoke(fact, poke);
  }

  if (!manager || !player) return "";
  const key = item.upbeat && (item.category === "injury" || item.category === "news")
    ? `${item.category}_good`
    : item.category;
  const bank = TEMPLATES[key] || TEMPLATES.news;
  const pick = bank[hash(item.id || item.title || player) % bank.length];
  return pick
    .replace(/\{who\}/g, manager)
    .replace(/\{player\}/g, player)
    .replace(/\{team\}/g, String((item && item.team) || "his old spot"))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * **The seam, with the model in front of it.**
 *
 * news-sync.mjs calls this for every row rather than `leagueLine()` directly, so wiring the LLM
 * up is a matter of setting a secret and nothing else. Without `NEWS_LLM_KEY` the adapter returns
 * null on the first line of its own function and this returns the template, so the default path
 * makes no network call and costs nothing — the same shape `x-source.mjs` uses for the X token.
 *
 * A generated line that comes back empty, over-long, addressed to a person, or carrying a manager
 * name is **discarded** and the template ships instead. The adapter cannot loosen those rules
 * because they are checked here, on this side of the seam, against the same helper the self-test
 * uses. See docs/NEWS_SDD.md §6a for the prompt, the secret and the budget.
 *
 * @param opts.cachedLine a line already in the previous news.json for this id. Reused **only**
 *   when the model is on, because the whole cost control is "never pay twice for one row" — and
 *   because caching the template output would freeze the templates against their own edits.
 * @param opts.managers   every manager name in the league, so a generated line that names one
 *   can be refused rather than published.
 */
export async function leagueLineAsync(item, ctx, opts = {}) {
  const fallback = leagueLine(item, ctx);
  const manager = String((ctx && ctx.manager) || "").trim();
  let llm;
  try {
    llm = await import("./news-llm.mjs");
  } catch {
    return fallback;
  }
  if (!llm.llmEnabled()) return fallback;
  const cached = String(opts.cachedLine || "").trim();
  if (cached) return cached;
  let line = "";
  try {
    line = String((await llm.llmLine(item, ctx)) || "").replace(/\s+/g, " ").trim();
  } catch {
    return fallback;
  }
  if (!line || line.length > MAX_LINE) return fallback;
  // Unaddressed tweet summaries must stay impersonal (no you / no manager names).
  // Addressed ones may say "you", but must not repeat the seat name — that is the header.
  if (item && item.category === "tweet") {
    if (!manager) {
      if (noteFreeOfAddress(line, opts.managers)) return fallback;
    } else {
      const names = opts.managers && opts.managers.length ? opts.managers : [manager];
      for (const m of names) {
        if (m && line.toLowerCase().includes(String(m).toLowerCase())) return fallback;
      }
    }
  }
  return line;
}

/**
 * Every variant, rendered, so the user can read the whole voice at once and rewrite it.
 *
 * The shared-tweet rows are not in TEMPLATES any more — they are summarised from the tweet's own
 * words — so a fixed set of real tweet texts is run through summariseTweet() here. Those texts
 * are the live queue's, verbatim, which is the point: a sample of the summariser on invented text
 * would show whatever the invented text was written to show.
 */
export const TWEET_SAMPLES = [
  { player: "Eli Stowers", team: "PHI", position: "TE", tweet_handle: "DhananiZain",
    text: "Eli Stowers could start the season on IR-R (hamstring) via @DZangaroNBCS & Frank Reuben They also believe he was going to be a healthy inactive and is not ready to contribute Feels like a redshirt season for Stowers" },
  { player: "Keenan Allen", team: "IND", position: "WR", tweet_handle: "AdamSchefter",
    text: "Colts WR Keenan Allen is facing two DUI charges after being arrested early this morning in downtown Indianapolis, as @FOX59 reported." },
  { player: "Kirk Cousins", team: "LV", position: "QB", tweet_handle: "UnderdogNFL",
    text: "Kirk Cousins expected to be named Raiders starting QB, per @mzenitz ." },
  { player: "Anthony Richardson", team: "IND", position: "QB", tweet_handle: "FootballCravee",
    text: "Report: The Colts are seeking a 1st round pick for Anthony Richardson, per @RichJohnsonNFL pic.twitter.com/3yASOzsMhq" },
  { player: "Taylen Green", team: "CLE", position: "QB", tweet_handle: "UnderdogNFL",
    text: "Browns would like to keep Taylen Green on 53-man roster \"if they can find a way to do it,\" per @MaryKayCabot ." },
  { player: "TreVeyon Henderson", team: "NE", position: "RB", tweet_handle: "DhananiZain",
    text: "Sounds like TreVeyon Henderson is going to be fine - just rolled his ankle \u201cIt\u2019s not significant\u201d via @_AndrewCallahan" },
  { player: "Tank Dell", team: "HOU", position: "WR", tweet_handle: "DhananiZain",
    text: "On Tank Dell via @AaronWilson_NFL : Somewhat speculative but thinks that Dell goes on IR-R to start the year He\u2019s been off my board for a while" },
  // Surname-only wording, which is where the subject clause earns its place: the fact never says
  // "George Kittle", so the summary has to.
  { player: "George Kittle", team: "SF", position: "TE", tweet_handle: "AdamSchefter",
    text: "Kittle (Achilles) is expected to practice this week as he continues his push to play in the 49ers' season opener against the Rams in Australia." },
  // No rostered player, so the summary is who said what.
  { player: "", team: "", position: "", tweet_handle: "jack", text: "just setting up my twttr" },
  { player: "", team: "", position: "", tweet_handle: "Interior",
    text: "Sunsets don't get much better than this one over @GrandTetonNPS . #nature #sunset pic.twitter.com/YuKy2rcjyU" },
];

export function voiceSamples(manager, player, team) {
  const out = [];
  for (const [category, bank] of Object.entries(TEMPLATES)) {
    if (category === "orphan") continue;
    for (const template of bank) {
      out.push({
        category,
        line: template
          .replace(/\{who\}/g, manager)
          .replace(/\{player\}/g, player)
          .replace(/\{team\}/g, team || "his old spot"),
      });
    }
  }
  for (const s of TWEET_SAMPLES) {
    const sample = {
      id: `sample:${s.tweet_handle}:${s.player}`,
      category: "tweet",
      player: s.player,
      team: s.team,
      position: s.position,
      title: s.text,
      tweet_handle: s.tweet_handle,
    };
    out.push({
      category: "tweet",
      // Show the shipped shape: fact then poke (manager optional so both banks appear).
      line: leagueLine(sample, { manager: s.player ? manager : "" }),
    });
  }
  return out;
}
