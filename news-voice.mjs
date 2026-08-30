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
 * ## Why templates and not an LLM, for now
 *
 * No npm, no API key, no network in the copy step, and the same input produces the same line
 * every run — which is what keeps `news.json` diffable in git and keeps a re-run from rewriting
 * fifty rows for no reason. It is not as funny as a model would be. That trade, and exactly what
 * the LLM path would cost and need, is written up in docs/NEWS_SDD.md.
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
    test: /\b(depth chart|starter|starting (?:job|role|quarterback|running back)|benched?|demot\w+|promot\w+|snap (?:count|share)|first[- ]team|second[- ]string|named the|wins? the (?:job|competition)|committee|timeshare|touches)\b/i,
  },
  {
    id: "breakout",
    label: "Breakout",
    severity: 2,
    test: /\b(breakout|impress\w+|standout|turning heads|best shape|buzz|sleeper|hype|explod\w+|dominat\w+|career[- ]high|stock (?:is )?(?:up|rising)|shines?|stars?\b)\b/i,
  },
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
};

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
 * **The seam.** Turn one matched news item into one line of league voice.
 *
 * @param item {{ id, player, team, category, upbeat, title }} the matched story
 * @param ctx  {{ manager }} the manager the line is addressed to
 * @returns {string} one sentence or two, plain text, unescaped
 *
 * Replacing the voice means replacing this function's body and the table above it. Its inputs
 * and its return type are the contract with news-sync.mjs; keep those and nothing else breaks.
 */
export function leagueLine(item, ctx) {
  const manager = String((ctx && ctx.manager) || "").trim();
  const player = String((item && item.player) || "").trim();
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

/** Every variant, rendered, so the user can read the whole voice at once and rewrite it. */
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
  return out;
}
